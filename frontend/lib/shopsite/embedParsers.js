/**
 * Pure URL parsers for the 3 storefront embed providers.
 * Used by both the editor (to convert pasted URLs to safe iframes)
 * and unit-testable in isolation.  These functions return the canonical
 * iframe `src` URL that the backend sanitizer will accept verbatim.
 *
 * Keep these in sync with `SAFE_IFRAME_PATTERNS` in
 * `backend/domains/shopPublic/utils/htmlSanitize.util.js`.
 */

/**
 * Accepts any of:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/shorts/ID
 * Returns:
 *   https://www.youtube.com/embed/ID
 */
export function parseYouTubeEmbed(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    let id = null;
    if (u.hostname === "youtu.be") {
      id = u.pathname.replace(/^\//, "").split("/")[0];
    } else if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.pathname.startsWith("/watch")) {
        id = u.searchParams.get("v");
      } else if (u.pathname.startsWith("/embed/")) {
        id = u.pathname.split("/")[2];
      } else if (u.pathname.startsWith("/shorts/")) {
        id = u.pathname.split("/")[2];
      }
    }
    if (!id || !/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
    return `https://www.youtube.com/embed/${id}`;
  } catch {
    return null;
  }
}

/**
 * Accepts any of:
 *   https://www.tiktok.com/@user/video/7012345678901234567
 *   https://www.tiktok.com/embed/v2/7012345678901234567
 *   https://vm.tiktok.com/SHORT  (left as-is; oembed not supported here)
 * Returns:
 *   https://www.tiktok.com/embed/v2/ID
 */
export function parseTikTokEmbed(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)tiktok\.com$/.test(u.hostname)) return null;
    let id = null;
    const segs = u.pathname.split("/").filter(Boolean);
    const videoIdx = segs.indexOf("video");
    if (videoIdx >= 0 && segs[videoIdx + 1]) id = segs[videoIdx + 1];
    if (!id && segs[0] === "embed") id = segs[segs.length - 1];
    if (!id || !/^\d{6,}$/.test(id)) return null;
    return `https://www.tiktok.com/embed/v2/${id}`;
  } catch {
    return null;
  }
}

/**
 * Accepts a Facebook video URL such as:
 *   https://www.facebook.com/<page>/videos/<id>/
 *   https://www.facebook.com/watch/?v=<id>
 *   https://fb.watch/<short>/
 * Returns the canonical plugin URL:
 *   https://www.facebook.com/plugins/video.php?href=<encoded-original>&show_text=false
 */
export function parseFacebookEmbed(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)facebook\.com$|^fb\.watch$/.test(u.hostname)) return null;
    const encoded = encodeURIComponent(u.toString());
    return `https://www.facebook.com/plugins/video.php?href=${encoded}&show_text=false`;
  } catch {
    return null;
  }
}

/**
 * Quick provider sniff for the toolbar's "Embed" dialog.
 */
export function detectEmbedProvider(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname === "youtu.be" || /youtube(-nocookie)?\.com$/.test(u.hostname)) return "youtube";
    if (/tiktok\.com$/.test(u.hostname)) return "tiktok";
    if (/facebook\.com$|^fb\.watch$/.test(u.hostname)) return "facebook";
    return null;
  } catch {
    return null;
  }
}
