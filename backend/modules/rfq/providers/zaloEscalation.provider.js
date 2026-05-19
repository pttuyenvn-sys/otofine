import crypto from "crypto";
import { rfqLog } from "../utils/rfqLogger.js";

function signBody(secret, body) {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Provider abstraction — đẩy payload ra webhook nội bộ (staging/prod bridge) hoặc no-op.
 * Không hard-code Zalo OA HTTP chi tiết; team vận hành map webhook → ZNS/OA.
 */
export async function sendRfqZaloEscalation(payload) {
  const url = String(process.env.RFQ_ZALO_WEBHOOK_URL || "").trim();
  const secret = String(process.env.RFQ_ZALO_WEBHOOK_SECRET || "").trim();
  const timeoutMs = Math.min(30000, Math.max(3000, Number(process.env.RFQ_ZALO_WEBHOOK_TIMEOUT_MS || 12000)));

  if (!url) {
    rfqLog.warn("rfq.zalo.provider.noop", { reason: "missing RFQ_ZALO_WEBHOOK_URL", dispatch_id: payload.dispatchId });
    return { ok: false, reason: "noop" };
  }

  const bodyObj = {
    event: "rfq_escalation_zalo",
    version: 1,
    dispatchedAt: new Date().toISOString(),
    ...payload,
  };
  const body = JSON.stringify(bodyObj);
  const sig = secret ? signBody(secret, body) : null;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "otofine-rfq-escalation/2",
    };
    if (sig) headers["X-Rfq-Zalo-Signature"] = sig;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: ac.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      rfqLog.warn("rfq.zalo.provider.http_error", {
        status: res.status,
        dispatch_id: payload.dispatchId,
        snippet: text.slice(0, 200),
      });
      return { ok: false, reason: `http_${res.status}` };
    }
    rfqLog.info("rfq.zalo.provider.sent", { dispatch_id: payload.dispatchId, shop_id: payload.shopId });
    return { ok: true };
  } catch (e) {
    rfqLog.warn("rfq.zalo.provider.failed", {
      dispatch_id: payload.dispatchId,
      err: String(e?.message || e),
    });
    return { ok: false, reason: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}
