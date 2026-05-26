/**
 * SMS body format for Android/iOS OTP auto-fill (domain-bound + hash suffix).
 * Use when wiring real SMS provider — console/dev logs use same shape.
 */
export function formatRfqOtpSmsBody(code, { domain = "otofine.com" } = {}) {
  const digits = String(code || "").replace(/\D/g, "").slice(0, 8);
  if (!digits) return "";
  return `Otofine OTP: ${digits}\n\n@${domain} #${digits}`;
}
