/**
 * SEARCH-MULTI-CATEGORY-PREVIEW-01 — view-all CTA from resolved search scope.
 */

function foldVi(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function labelIncludesToken(label, token) {
  const t = foldVi(token);
  if (!t) return false;
  return foldVi(label).split(/\s+/).some((part) => part === t || part.includes(t));
}

/**
 * @param {{ brand?: string, model?: string, year?: string, modelAll?: boolean }} scope
 * @param {string} apiKeyword
 */
export function buildSuggestViewAllLabel(scope = {}, apiKeyword = "") {
  const parts = [];
  const kw = String(apiKeyword || scope.remainingKeywords || "").trim();
  if (kw) parts.push(kw);
  if (scope.brand && !labelIncludesToken(kw, scope.brand)) parts.push(scope.brand);
  if (scope.model && !labelIncludesToken(kw, scope.model)) parts.push(scope.model);
  if (scope.year && !String(kw).includes(String(scope.year))) parts.push(scope.year);

  const label = parts.filter(Boolean).join(" ").trim();
  if (!label) return "Xem tất cả phụ tùng";

  if (scope.model) {
    return `Xem tất cả ${label}`;
  }
  return `Xem tất cả phụ tùng ${label}`;
}
