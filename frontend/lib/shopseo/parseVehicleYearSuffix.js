/**
 * ARCH-07.1 — Year suffix parser (shop SEO copy, independent from marketplace).
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
    // Require at least brand + model + year_from + year_to tokens to
    // avoid misclassifying numeric model names (e.g. Peugeot 2008).
    list.length >= 4 &&
    isYearToken(list[list.length - 1]) &&
    isYearToken(list[list.length - 2])
  ) {
    const yearTo = list.pop();
    const yearFrom = list.pop();
    return { year: `${yearFrom}-${yearTo}`, tokens: list };
  }

  // Require brand + model + year to avoid treating numeric model names
  // (e.g. Peugeot 2008) as year pages.
  if (list.length >= 3 && isYearToken(list[list.length - 1])) {
    const year = list.pop();
    return { year, tokens: list };
  }

  return { year: "", tokens: list };
}
