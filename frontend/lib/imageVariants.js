export function toThumb100(url) {
  if (!url) return null;

  return String(url)
    .trim()
    .replace(/\/([^/]+)\.webp$/i, "/thumb_100_$1.webp");
}

export function toThumb400(url) {
  if (!url) return null;

  return String(url)
    .trim()
    .replace(/\/([^/]+)\.webp$/i, "/thumb_400_$1.webp");
}
