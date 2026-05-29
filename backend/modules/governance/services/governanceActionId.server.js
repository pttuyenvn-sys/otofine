import crypto from "crypto";

/** Generate a unique governance action identifier. */
export function createGovernanceActionId() {
  return crypto.randomUUID();
}

/**
 * Build a deterministic idempotency key when the client does not supply one.
 * Uses a 5-minute time bucket to collapse accidental double-clicks/retries.
 */
export function buildDeterministicIdempotencyKey({ shopId, action, note, adminId }) {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const raw = [shopId, action, String(note || "").trim(), adminId ?? "system", bucket].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}
