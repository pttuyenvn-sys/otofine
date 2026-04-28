/**
 * @param {unknown} raw
 * @returns {any[]|null}
 */
export function parseJsonArray(raw) {
  if (raw == null || raw === "") return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return null;
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
export function parseJsonObject(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  try {
    const v = JSON.parse(String(raw));
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? /** @type {Record<string, unknown>} */ (v)
      : null;
  } catch {
    return null;
  }
}
