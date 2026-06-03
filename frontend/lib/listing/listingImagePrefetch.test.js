import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueListingImagePrefetch,
  LISTING_IMAGE_PREFETCH_MAX_INFLIGHT,
  resetListingImagePrefetchQueueForTests,
} from "./listingImagePrefetch.js";

describe("enqueueListingImagePrefetch", () => {
  /** @type {Set<string>} */
  let loadedUrls;

  beforeEach(() => {
    resetListingImagePrefetchQueueForTests();
    loadedUrls = new Set();

    class MockImage {
      /** @param {string} value */
      set src(value) {
        this._src = value;
        loadedUrls.add(value);
        queueMicrotask(() => {
          this.onload?.();
        });
      }

      get src() {
        return this._src;
      }

      decoding = "async";
      /** @type {(() => void) | null} */
      onload = null;
      /** @type {(() => void) | null} */
      onerror = null;
    }

    vi.stubGlobal("window", { Image: MockImage });
    vi.stubGlobal("Image", MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetListingImagePrefetchQueueForTests();
  });

  it("dedupes repeated URLs", () => {
    enqueueListingImagePrefetch(["/a.jpg", "/a.jpg", "/b.jpg"]);
    enqueueListingImagePrefetch(["/a.jpg", "/b.jpg"]);

    expect(loadedUrls.size).toBe(2);
    expect([...loadedUrls].sort()).toEqual(["/a.jpg", "/b.jpg"]);
  });

  it("limits concurrent in-flight prefetches", async () => {
    const slow = [];
    class SlowImage {
      /** @param {string} value */
      set src(value) {
        this._src = value;
        slow.push(value);
      }

      get src() {
        return this._src;
      }

      decoding = "async";
      onload = null;
      onerror = null;
    }

    vi.stubGlobal("window", { Image: SlowImage });
    vi.stubGlobal("Image", SlowImage);

    const urls = ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg"];
    enqueueListingImagePrefetch(urls);

    expect(slow.length).toBe(LISTING_IMAGE_PREFETCH_MAX_INFLIGHT);
  });
});
