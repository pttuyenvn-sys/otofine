import crypto from "crypto";

/**
 * @param {string} text
 * @returns {string} 32-char hex key for UPSERT unique columns
 */
export function hashKey(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}
