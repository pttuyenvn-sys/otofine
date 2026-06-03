/** Max countable window for keyword listing before pagination ceiling (1000+ semantics). */
export const KEYWORD_LISTING_COUNT_CAP = 1001;

/**
 * Derive `total` / `totalPages` for keyword listing without an exact COUNT query.
 *
 * - Short page → exact total (last page or sparse results).
 * - Full page → allow at least one more page (`totalPages = page + 1`).
 * - Empty page → clamp to previous page (exact divisible totals).
 * - At/above cap → freeze at KEYWORD_LISTING_COUNT_CAP pages.
 *
 * @param {{ rows: unknown[], limit: number, offset: number, page: number }} args
 * @returns {{ total: number, totalPages: number }}
 */
export function resolveKeywordListingPagination({ rows, limit, offset, page }) {
  const pageN = Math.max(1, Number(page) || 1);
  const limitN = Math.max(1, Number(limit) || 16);
  const offsetN = Math.max(0, Number(offset) || 0);
  const rowCount = Array.isArray(rows) ? rows.length : 0;

  if (rowCount === 0) {
    if (pageN <= 1) return { total: 0, totalPages: 1 };
    const total = offsetN;
    return { total, totalPages: Math.max(1, pageN - 1) };
  }

  if (rowCount < limitN) {
    const total = offsetN + rowCount;
    return {
      total,
      totalPages: Math.max(1, Math.ceil(total / limitN)),
    };
  }

  const capPages = Math.max(1, Math.ceil(KEYWORD_LISTING_COUNT_CAP / limitN));
  if (offsetN + rowCount >= KEYWORD_LISTING_COUNT_CAP) {
    return { total: KEYWORD_LISTING_COUNT_CAP, totalPages: capPages };
  }

  return {
    total: offsetN + rowCount + 1,
    totalPages: Math.min(capPages, pageN + 1),
  };
}
