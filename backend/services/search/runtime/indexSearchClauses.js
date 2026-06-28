/**
 * Shared product_search_index WHERE clause builders (index runtime + matcher).
 */

import {
  buildKeywordRelevanceOrderSql,
  foldVi,
  normalizeSearchText,
} from "../../../utils/keywordRelevanceRanking.js";
import { normalizePartNumber } from "../../../utils/listingQueryNormalize.js";

function sqlLowerTrim(expr) {
  return `LOWER(TRIM(${expr}))`;
}

function sqlFoldVi(expr) {
  const replacements = [
    ["đ", "d"], ["à", "a"], ["á", "a"], ["ạ", "a"], ["ả", "a"], ["ã", "a"],
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

export function buildIndexStructuredClause(facets, rawQuery = {}) {
  let where = "";
  const params = [];

  const cityId = facets.cityId ?? rawQuery.cityId;
  if (cityId != null) {
    const cid = Number(cityId);
    if (Number.isFinite(cid) && cid > 0) {
      where += ` AND psi.location_id = ? `;
      params.push(cid);
    }
  } else if (facets.location) {
    where += ` AND (${sqlFoldVi("psi.location_name")} LIKE ?) `;
    params.push(`%${foldVi(facets.location)}%`);
  }

  if (facets.brand) {
    where += ` AND ${sqlLowerTrim("psi.brand_name")} = ? `;
    params.push(String(facets.brand).trim().toLowerCase());
  }
  if (facets.model) {
    where += ` AND ${sqlLowerTrim("psi.model_name")} = ? `;
    params.push(String(facets.model).trim().toLowerCase());
  }
  if (facets.year != null) {
    const yearStr = String(facets.year).trim();
    if (yearStr.includes("-")) {
      const parts = yearStr.split("-").map((p) => Number(p.trim()));
      const lo = Math.min(parts[0], parts[1]);
      const hi = Math.max(parts[0], parts[1]);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        where += ` AND (psi.year_from = 0 OR psi.year_from <= ?) AND (psi.year_to = 0 OR psi.year_to >= ?) `;
        params.push(hi, lo);
      }
    } else if (Number.isFinite(Number(yearStr))) {
      const y = Number(yearStr);
      where += ` AND (psi.year_from = 0 OR psi.year_from <= ?) AND (psi.year_to = 0 OR psi.year_to >= ?) `;
      params.push(y, y);
    }
  }
  if (facets.category) {
    const cf = foldVi(facets.category);
    where += ` AND (${sqlFoldVi("psi.category_name")} LIKE ?) `;
    params.push(`%${cf}%`);
  }
  return { where, params };
}

export function buildIndexExactClause(facets) {
  const partNumber = String(facets.partNumber || "").trim();
  if (!partNumber) return { where: "", params: [], keywordOrder: "", active: false };
  const normalized = normalizePartNumber(partNumber);
  const relevance = buildKeywordRelevanceOrderSql({
    titleExpr: "psi.product_name",
    partNumberExpr: "psi.part_number",
    shortDescExpr: "psi.search_text",
    descExpr: "psi.search_text",
    query: partNumber,
  });
  return {
    where: ` AND (
      psi.part_number_norm = ?
      OR REPLACE(REPLACE(LOWER(psi.part_number), '-', ''), ' ', '') = ?
      OR LOWER(TRIM(psi.part_number)) = ?
    ) `,
    params: [normalized, normalized, partNumber.toLowerCase()],
    keywordOrder: relevance ? `${relevance},` : "",
    active: true,
  };
}

export function buildIndexPartNumberNormClause(partNumberNorm, rawPart = "") {
  if (!partNumberNorm) return { where: "", params: [], keywordOrder: "", active: false };
  const relevance = buildKeywordRelevanceOrderSql({
    titleExpr: "psi.product_name",
    partNumberExpr: "psi.part_number",
    shortDescExpr: "psi.search_text",
    descExpr: "psi.search_text",
    query: rawPart || partNumberNorm,
  });
  return {
    where: ` AND (
      psi.part_number_norm = ?
      OR REPLACE(REPLACE(LOWER(psi.part_number), '-', ''), ' ', '') = ?
    ) `,
    params: [partNumberNorm, partNumberNorm],
    keywordOrder: relevance ? `${relevance},` : "",
    active: true,
  };
}

export function buildIndexFulltextClause(textQuery) {
  const kw = normalizeSearchText(textQuery);
  const words = kw.split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return { where: "", params: [], keywordOrder: "", active: false };
  const booleanQuery = words.map((w) => `+${w}*`).join(" ");
  const relevance = buildKeywordRelevanceOrderSql({
    titleExpr: "psi.product_name",
    partNumberExpr: "psi.part_number",
    shortDescExpr: "psi.search_text",
    descExpr: "psi.search_text",
    query: kw,
  });
  return {
    where: ` AND MATCH(psi.search_text) AGAINST (? IN BOOLEAN MODE) `,
    params: [booleanQuery],
    keywordOrder: relevance ? `${relevance},` : "",
    active: true,
  };
}

export function buildIndexLikeClause(keyword) {
  const kw = foldVi(String(keyword || "").trim());
  if (!kw) return { where: "", params: [], keywordOrder: "", active: false };
  const tokens = kw.split(/\s+/).filter((t) => t.length >= 2);
  const parts = tokens.length ? tokens : [kw];
  const clauses = [];
  const params = [];
  for (const t of parts) {
    clauses.push(`(
      ${sqlFoldVi("psi.product_name")} LIKE ?
      OR ${sqlFoldVi("psi.part_number")} LIKE ?
      OR ${sqlFoldVi("psi.search_keywords")} LIKE ?
      OR ${sqlFoldVi("psi.search_text")} LIKE ?
      OR ${sqlFoldVi("psi.category_name")} LIKE ?
      OR ${sqlFoldVi("psi.brand_name")} LIKE ?
      OR ${sqlFoldVi("psi.model_name")} LIKE ?
    )`);
    const p = `%${t}%`;
    params.push(p, p, p, p, p, p, p);
  }
  const relevance = buildKeywordRelevanceOrderSql({
    titleExpr: "psi.product_name",
    partNumberExpr: "psi.part_number",
    shortDescExpr: "psi.search_text",
    descExpr: "psi.search_text",
    query: kw,
  });
  return {
    where: ` AND (${clauses.join(" AND ")}) `,
    params,
    keywordOrder: relevance ? `${relevance},` : "",
    active: true,
  };
}
