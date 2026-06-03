/** Lightweight in-memory counters (optional dev observability). */

const metrics = {
  image_errors: 0,
  image_fallbacks: 0,
  broken_urls: 0,
  original_fallbacks: 0,
};

export function recordProductImageError() {
  metrics.image_errors += 1;
}

export function recordProductImageFallback() {
  metrics.image_fallbacks += 1;
}

export function recordProductBrokenUrl() {
  metrics.broken_urls += 1;
}

export function recordProductOriginalFallback() {
  metrics.original_fallbacks += 1;
}

export function getProductMediaMetrics() {
  return { ...metrics };
}
