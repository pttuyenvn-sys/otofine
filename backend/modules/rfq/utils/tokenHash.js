import crypto from "crypto";
import { rfqViewerSecret, rfqOtpSecret } from "../../../config/rfq.config.js";

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input), "utf8").digest("hex");
}

/** Opaque viewer token + deterministic hash for DB lookup */
export function generateViewerToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashViewerToken(rawToken) {
  const pepper = rfqViewerSecret();
  return sha256Hex(`${pepper}:${rawToken}`);
}

export function hashOtpCode(code, phoneE164) {
  const pepper = rfqOtpSecret();
  return sha256Hex(`${pepper}:${phoneE164}:${String(code).trim()}`);
}
