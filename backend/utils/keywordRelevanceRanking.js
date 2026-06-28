import mysql from "mysql2";

/** Fold Vietnamese text for loose title matching (giảm → giam). */
export function foldVi(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalize search text (ascii-ish, no diacritics). */
export function normalizeSearchText(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** SQL expression: fold Vietnamese diacritics on a column. */
export function sqlFoldVi(expr) {
  const replacements = [
    ["đ", "d"],
    ["à", "a"], ["á", "a"], ["ạ", "a"], ["ả", "a"], ["ã", "a"],
    ["â", "a"], ["ầ", "a"], ["ấ", "a"], ["ậ", "a"], ["ẩ", "a"], ["ẫ", "a"],
    ["ă", "a"], ["ằ", "a"], ["ắ", "a"], ["ặ", "a"], ["ẳ", "a"], ["ẵ", "a"],
    ["è", "e"], ["é", "e"], ["ẹ", "e"], ["ẻ", "e"], ["ẽ", "e"],
    ["ê", "e"], ["ề", "e"], ["ế", "e"], ["ệ", "e"], ["ể", "e"], ["ễ", "e"],
    ["ì", "i"], ["í", "i"], ["ị", "i"], ["ỉ", "i"], ["ĩ", "i"],
    ["ò", "o"], ["ó", "o"], ["ọ", "o"], ["ỏ", "o"], ["õ", "o"],
    ["ô", "o"], ["ồ", "o"], ["ố", "o"], ["ộ", "o"], ["ổ", "o"], ["ỗ", "o"],
    ["ơ", "o"], ["ờ", "o"], ["ớ", "o"], ["ợ", "o"], ["ở", "o"], ["ỡ", "o"],
    ["ù", "u"], ["ú", "u"], ["ụ", "u"], ["ủ", "u"], ["ũ", "u"],
    ["ư", "u"], ["ừ", "u"], ["ứ", "u"], ["ự", "u"], ["ử", "u"], ["ữ", "u"],
    ["ỳ", "y"], ["ý", "y"], ["ỵ", "y"], ["ỷ", "y"], ["ỹ", "y"],
  ];
  return replacements.reduce(
    (acc, [from, to]) => `REPLACE(${acc}, '${from}', '${to}')`,
    `LOWER(TRIM(${expr}))`,
  );
}

/**
 * Keyword relevance tier (lower = better).
 * 1 title starts with query
 * 2 exact phrase / title equality
 * 3 title contains query (not at start)
 * 4 part number
 * 5 other fields
 * 9 fallback
 */
export function scoreKeywordRelevance({
  title = "",
  partNumber = "",
  shortDescription = "",
  description = "",
  query = "",
}) {
  const qFold = foldVi(query);
  const qNorm = normalizeSearchText(query);
  if (!qFold && !qNorm) return 9;

  const titleFold = foldVi(title);
  const titleNorm = normalizeSearchText(title);

  if (titleFold.startsWith(qFold) || titleNorm.startsWith(qNorm)) return 1;

  if (titleFold === qFold || titleNorm === qNorm) return 2;

  if (qFold.includes(" ") && titleFold.includes(qFold)) return 2;

  if (titleFold.includes(qFold) || titleNorm.includes(qNorm)) return 3;

  const pn = normalizeSearchText(partNumber).replace(/[\s-]/g, "");
  const qPn = qNorm.replace(/[\s-]/g, "");
  if (pn && qPn && (pn === qPn || pn.includes(qPn))) return 4;

  const sd = normalizeSearchText(shortDescription);
  const de = normalizeSearchText(description);
  if ((sd && sd.includes(qNorm)) || (de && de.includes(qNorm))) return 5;

  return 9;
}

/**
 * ORDER BY CASE expression for keyword relevance.
 * @returns {string} SQL fragment (CASE ... END) or empty string
 */
export function buildKeywordRelevanceOrderSql({
  titleExpr,
  partNumberExpr,
  shortDescExpr,
  descExpr,
  query,
}) {
  const qFold = foldVi(query);
  const qNorm = normalizeSearchText(query);
  if (!qFold && !qNorm) return "";

  const titleFold = sqlFoldVi(titleExpr);
  const esc = (v) => mysql.escape(v);

  const startsLike = esc(`${qFold}%`);
  const containsLike = esc(`%${qFold}%`);
  const qFoldExact = esc(qFold);
  const qNormExact = esc(qNorm);
  const pnLike = esc(`%${qNorm}%`);
  const otherLike = esc(`%${qFold}%`);

  const phraseTier =
    qFold.includes(" ")
      ? `WHEN ${titleFold} LIKE ${containsLike} AND ${titleFold} NOT LIKE ${startsLike} THEN 2`
      : `WHEN ${titleFold} = ${qFoldExact} OR LOWER(${titleExpr}) = ${qNormExact} THEN 2`;

  return `
    CASE
      WHEN ${titleFold} LIKE ${startsLike} THEN 1
      ${phraseTier}
      WHEN ${titleFold} LIKE ${containsLike} THEN 3
      WHEN LOWER(${partNumberExpr}) LIKE ${pnLike} THEN 4
      WHEN LOWER(${shortDescExpr}) LIKE ${otherLike} OR LOWER(${descExpr}) LIKE ${otherLike} THEN 5
      ELSE 9
    END`;
}

/**
 * @param {string} caseSql - from buildKeywordRelevanceOrderSql
 * @param {boolean} [aggregate] - wrap with MIN() for GROUP BY queries
 */
export function formatKeywordRelevanceOrderPrefix(caseSql, aggregate = false) {
  if (!caseSql) return "";
  const expr = aggregate ? `MIN(${caseSql.trim()})` : caseSql.trim();
  return `${expr},`;
}
