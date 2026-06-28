/**
 * Parse trailing year or year-range tokens from vehicle listing slug remainder.
 */

function isYearToken(token) {
  return /^(19|20)\d{2}$/.test(String(token || ""));
}

/**
 * @param {string[]} tokens
 * @returns {{ year: string, tokens: string[] }}
 */
export function parseVehicleYearSuffix(tokens = []) {
  const list = [...tokens].filter(Boolean);
  if (
    list.length >= 2 &&
    isYearToken(list[list.length - 1]) &&
    isYearToken(list[list.length - 2])
  ) {
    const yearTo = list.pop();
    const yearFrom = list.pop();
    return { year: `${yearFrom}-${yearTo}`, tokens: list };
  }

  if (list.length >= 1 && isYearToken(list[list.length - 1])) {
    const year = list.pop();
    return { year, tokens: list };
  }

  return { year: "", tokens: list };
}

/**
 * @param {string} slug
 * @returns {boolean}
 */
export function looksLikeVehicleYearRangeSlug(slug = "") {
  return /^phu-tung-[a-z0-9-]+-\d{4}-\d{4}$/i.test(String(slug || "").trim());
}
