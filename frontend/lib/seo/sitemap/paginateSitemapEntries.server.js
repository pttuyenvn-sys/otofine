import { MAX_URLS_PER_FILE } from "./constants.server.js";

/**
 * Stable sort + slice sitemap rows for autoscale partitions.
 *
 * @param {import('next').MetadataRoute.Sitemap} entries
 * @param {number} [maxPerFile]
 * @returns {import('next').MetadataRoute.Sitemap[]}
 */
export function paginateSitemapEntries(entries, maxPerFile = MAX_URLS_PER_FILE) {
  const sorted = [...(entries || [])].sort((a, b) =>
    String(a.url).localeCompare(String(b.url)),
  );

  if (sorted.length === 0) return [[]];

  const pages = [];
  for (let i = 0; i < sorted.length; i += maxPerFile) {
    pages.push(sorted.slice(i, i + maxPerFile));
  }
  return pages;
}

/**
 * @param {number} count
 * @param {number} [maxPerFile]
 */
export function partitionCount(count, maxPerFile = MAX_URLS_PER_FILE) {
  if (count <= 0) return 0;
  if (count <= maxPerFile) return 1;
  return Math.ceil(count / maxPerFile);
}
