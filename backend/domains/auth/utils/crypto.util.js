import crypto from "crypto";

/** URL-safe opaque token for reset/refresh (store SHA-256 hash in DB). */
export function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
