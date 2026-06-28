/**
 * Normalize product gallery URL to absolute HTTPS for sitemap image:loc.
 *
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function resolveAbsoluteProductImageUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  let absolute = raw;
  if (!/^https?:\/\//i.test(absolute)) {
    const base = String(
      process.env.R2_PUBLIC_URL ||
        process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
        "https://img.otofine.com",
    ).replace(/\/+$/, "");
    absolute = `${base}/${decodeURIComponent(raw).replace(/^\/+/, "")}`;
  }

  try {
    const parsed = new URL(absolute);
    if (parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} url
 */
export function isPublicProductImageUrl(url) {
  const abs = resolveAbsoluteProductImageUrl(url);
  if (!abs) return false;
  try {
    const host = new URL(abs).hostname.toLowerCase();
    return host === "img.otofine.com" || host.endsWith(".otofine.com");
  } catch {
    return false;
  }
}
