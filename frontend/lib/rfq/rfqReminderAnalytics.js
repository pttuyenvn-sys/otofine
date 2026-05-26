import { API_BASE } from "@/lib/config";

/**
 * Report reminder push open/dismiss — lightweight, fire-and-forget.
 */
export function trackReminderAttributionEvent({ attributionId, event, subscriptionId, source }) {
  const id = Number(attributionId);
  if (!Number.isFinite(id) || id <= 0) return;
  const ev = String(event || "").trim().toLowerCase();
  if (ev !== "opened" && ev !== "dismissed") return;

  const base = String(API_BASE || "").replace(/\/$/, "");
  void fetch(`${base}/rfq-push/reminder-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attributionId: id,
      event: ev,
      subscriptionId: subscriptionId || null,
      source: source || "client",
    }),
  }).catch(() => {
    /* non-fatal */
  });

  if (typeof console !== "undefined" && console.info) {
    console.info(`[rfq-reminder] rfq.reminder.${ev}`, { attributionId: id, source });
  }
}
