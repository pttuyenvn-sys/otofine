/** Max events coalesced before an immediate flush. */
export const ANALYTICS_BATCH_MAX_SIZE = 10;

/** Debounced flush interval when the queue is non-empty. */
export const ANALYTICS_BATCH_FLUSH_MS = 500;

/** Rolling dedupe window for identical interaction keys. */
export const ANALYTICS_DEDUPE_WINDOW_MS = 800;

/**
 * Lightweight analytics batch queue — defer JSON/network work off hot paths.
 *
 * Flush when:
 *   - queue length reaches `maxBatchSize`, or
 *   - `flushIntervalMs` elapses after the first queued item.
 *
 * @param {object} options
 * @param {(items: unknown[]) => void} options.flush
 * @param {number} [options.maxBatchSize]
 * @param {number} [options.flushIntervalMs]
 * @param {(item: unknown) => string} [options.dedupeKey]
 * @param {number} [options.dedupeWindowMs]
 */
export function createAnalyticsBatchQueue({
  flush,
  maxBatchSize = ANALYTICS_BATCH_MAX_SIZE,
  flushIntervalMs = ANALYTICS_BATCH_FLUSH_MS,
  dedupeKey,
  dedupeWindowMs = ANALYTICS_DEDUPE_WINDOW_MS,
}) {
  /** @type {unknown[]} */
  const queue = [];
  /** @type {Map<string, number>} */
  const recent = new Map();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let flushScheduled = false;

  function gcRecent(now) {
    if (recent.size <= 64) return;
    for (const [mk, ts] of recent) {
      if (now - ts > dedupeWindowMs * 4) recent.delete(mk);
    }
  }

  function shouldEnqueue(item) {
    if (typeof dedupeKey !== "function") return true;
    const key = String(dedupeKey(item) || "");
    if (!key) return true;
    const now = Date.now();
    const seen = recent.get(key);
    if (seen && now - seen < dedupeWindowMs) return false;
    recent.set(key, now);
    gcRecent(now);
    return true;
  }

  function doFlush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    flushScheduled = false;
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    flush(batch);
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    timer = setTimeout(doFlush, flushIntervalMs);
  }

  function enqueue(item) {
    if (!shouldEnqueue(item)) return false;
    queue.push(item);
    if (queue.length >= maxBatchSize) {
      doFlush();
      return true;
    }
    scheduleFlush();
    return true;
  }

  function flushNow() {
    doFlush();
  }

  function destroy() {
    if (timer) clearTimeout(timer);
    timer = null;
    flushScheduled = false;
    queue.length = 0;
    recent.clear();
  }

  return { enqueue, flushNow, destroy, get pendingCount() { return queue.length; } };
}
