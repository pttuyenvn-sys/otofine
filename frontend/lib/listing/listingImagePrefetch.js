/** Prefetch this many listing cards ahead of the mounted window. */
export const LISTING_IMAGE_PREFETCH_AHEAD = 4;

/** IntersectionObserver rootMargin — start prefetch before sentinel is visible. */
export const LISTING_IMAGE_PREFETCH_ROOT_MARGIN = "420px 0px";

/** Max concurrent image prefetches (avoid browser connection flood). */
export const LISTING_IMAGE_PREFETCH_MAX_INFLIGHT = 3;

/** @typedef {(url: string) => void} ListingPrefetchDrainHook */

/** @type {Set<string>} */
const completed = new Set();

/** @type {string[]} */
const pending = [];

let inFlight = 0;

/**
 * Lightweight deduped prefetch queue — uses Image() decode cache only.
 * @param {string[]} urls
 */
export function enqueueListingImagePrefetch(urls) {
  if (typeof window === "undefined") return;

  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url || completed.has(url)) continue;
    completed.add(url);
    pending.push(url);
  }

  drainListingImagePrefetchQueue();
}

/** @internal — test reset */
export function resetListingImagePrefetchQueueForTests() {
  completed.clear();
  pending.length = 0;
  inFlight = 0;
}

function drainListingImagePrefetchQueue() {
  while (
    inFlight < LISTING_IMAGE_PREFETCH_MAX_INFLIGHT &&
    pending.length > 0
  ) {
    const url = pending.shift();
    if (!url) continue;
    inFlight += 1;
    const img = new window.Image();
    const done = () => {
      inFlight = Math.max(0, inFlight - 1);
      drainListingImagePrefetchQueue();
    };
    img.decoding = "async";
    img.onload = done;
    img.onerror = done;
    img.src = url;
  }
}
