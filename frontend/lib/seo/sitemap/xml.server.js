/**
 * Shared sitemap XML rendering for route handlers.
 *
 * @typedef {import('next').MetadataRoute.Sitemap[number] & {
 *   images?: Array<{ loc: string, title?: string }>
 * }} SitemapEntry
 */

export function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * @param {Array<{ loc: string, title?: string }>} images
 */
function renderImageBlocks(images) {
  return (images || [])
    .map((image) => {
      const loc = escapeXml(image.loc);
      const title = image.title ? `<image:title>${escapeXml(image.title)}</image:title>` : "";
      return `<image:image><image:loc>${loc}</image:loc>${title}</image:image>`;
    })
    .join("");
}

/**
 * @param {SitemapEntry[]} entries
 */
export function renderSitemapUrlset(entries) {
  const rows = entries || [];
  const hasImages = rows.some((row) => Array.isArray(row.images) && row.images.length > 0);
  const xmlnsImage = hasImages
    ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    : "";

  const urls = rows
    .map((row) => {
      const loc = escapeXml(row.url);
      const lastmod = row.lastModified
        ? new Date(row.lastModified).toISOString()
        : new Date().toISOString();
      const changefreq = row.changeFrequency || "weekly";
      const priority =
        row.priority != null ? Number(row.priority).toFixed(1) : "0.5";
      const imageXml = Array.isArray(row.images) ? renderImageBlocks(row.images) : "";
      return `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority>${imageXml}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlnsImage}>${urls}</urlset>`;
}

/**
 * @param {string[]} locs Absolute sitemap URLs.
 */
export function buildSitemapIndex(locs) {
  const now = new Date().toISOString();
  const items = (locs || [])
    .map((loc) => `<sitemap><loc>${escapeXml(loc)}</loc><lastmod>${now}</lastmod></sitemap>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`;
}

/**
 * @param {string} body
 * @param {number} [maxAge]
 */
export function sitemapXmlResponse(body, maxAge = 86400) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    },
  });
}
