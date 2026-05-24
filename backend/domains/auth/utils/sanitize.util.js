/** Strip control chars; trim strings for auth payloads. */
export function sanitizeString(value, maxLen = 512) {
  if (value == null) return "";
  return String(value)
    .replace(/\0/g, "")
    .trim()
    .slice(0, maxLen);
}

export function sanitizeEmail(value) {
  return sanitizeString(value, 255).toLowerCase();
}
