import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_BATCH_FLUSH_MS,
  ANALYTICS_BATCH_MAX_SIZE,
  createAnalyticsBatchQueue,
} from "./analyticsEventQueue.js";

describe("createAnalyticsBatchQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes when batch size is reached", () => {
    const flushed = [];
    const queue = createAnalyticsBatchQueue({
      flush: (items) => flushed.push(...items),
      maxBatchSize: 3,
      flushIntervalMs: 500,
    });

    queue.enqueue("a");
    queue.enqueue("b");
    expect(flushed).toEqual([]);

    queue.enqueue("c");
    expect(flushed).toEqual(["a", "b", "c"]);
  });

  it("flushes on interval when batch is below max", () => {
    const flushed = [];
    const queue = createAnalyticsBatchQueue({
      flush: (items) => flushed.push(...items),
      maxBatchSize: ANALYTICS_BATCH_MAX_SIZE,
      flushIntervalMs: ANALYTICS_BATCH_FLUSH_MS,
    });

    queue.enqueue("one");
    queue.enqueue("two");
    expect(flushed).toEqual([]);

    vi.advanceTimersByTime(ANALYTICS_BATCH_FLUSH_MS);
    expect(flushed).toEqual(["one", "two"]);
  });

  it("dedupes identical keys inside the rolling window", () => {
    const flushed = [];
    const queue = createAnalyticsBatchQueue({
      flush: (items) => flushed.push(...items),
      maxBatchSize: 10,
      flushIntervalMs: 500,
      dedupeKey: (item) => `${item.type}|${item.id}`,
      dedupeWindowMs: 800,
    });

    queue.enqueue({ type: "click", id: 1 });
    queue.enqueue({ type: "click", id: 1 });
    queue.flushNow();

    expect(flushed).toEqual([{ type: "click", id: 1 }]);
  });

  it("flushNow drains pending items immediately", () => {
    const flushed = [];
    const queue = createAnalyticsBatchQueue({
      flush: (items) => flushed.push(...items),
    });

    queue.enqueue("x");
    queue.flushNow();
    expect(flushed).toEqual(["x"]);
    expect(queue.pendingCount).toBe(0);
  });
});
