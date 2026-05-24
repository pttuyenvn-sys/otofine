/**
 * Process-wide counters for the subdomain middleware. The middleware
 * itself runs in Next.js (edge / Node depending on deploy target), so
 * it can't directly bump backend counters — instead it sends them via
 * a fire-and-forget `POST /api/public/shops/_internal/metrics` ping,
 * or (more commonly in this codebase) the SSR layer reports via this
 * module from a thin route adapter.
 *
 * To keep ALL Phase 4.5 observability backend-side, we expose
 * `recordSubdomainEvent` here and the frontend SSR helpers call into
 * it through the same backend API path. For now the counters are
 * populated by the response-cache layer (which sees every shop-tied
 * request) plus an internal beacon path the middleware uses.
 *
 * This module is intentionally simple — counters only, never PII.
 */
const counters = {
  rewrite_ok: 0,
  unknown_shop: 0,
  reserved_subdomain: 0,
  invalid_subdomain: 0,
  pass_through: 0,
  last_event_at: null,
};

export function recordSubdomainEvent(event, slug) {
  if (!Object.prototype.hasOwnProperty.call(counters, event)) return;
  counters[event] += 1;
  counters.last_event_at = new Date().toISOString();
}

export function getMiddlewareStats() {
  return { ...counters };
}

export function resetMiddlewareStats() {
  for (const k of Object.keys(counters)) {
    counters[k] = typeof counters[k] === "number" ? 0 : null;
  }
}
