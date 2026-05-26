/**
 * Lightweight RFQ history analytics — console + CustomEvent for future wiring.
 */
export function trackRfqHistoryEvent(event, props = {}) {
  const payload = { event, ts: new Date().toISOString(), ...props };
  if (typeof console !== "undefined" && console.info) {
    console.info(`[rfq-history] ${event}`, payload);
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("rfq:history", { detail: payload }));
    } catch {
      /* ignore */
    }
  }
}

export function trackRfqHistoryOpened(source = "direct") {
  trackRfqHistoryEvent("rfq.history.opened", { source });
}

export function trackRfqHistorySessionRestored() {
  trackRfqHistoryEvent("rfq.history.session_restored");
}

export function trackRfqHistoryReopened(publicId) {
  trackRfqHistoryEvent("rfq.history.reopened", { publicId });
}
