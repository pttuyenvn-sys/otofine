/**
 * Structured indexed WHERE for brand, model, year, category — never LIKE-concatenated.
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";

function sqlLowerTrim(expr) {
  return `LOWER(TRIM(${expr}))`;
}

function sqlFoldVi(expr) {
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
 * @param {Awaited<ReturnType<typeof import('../../../utils/productsTableColumns.server.js').getProductsColumnsResolved>>} _pc
 * @param {import('./searchFacetResolver.js').resolveSearchFacets extends (...args: any[]) => Promise<infer R> ? R : never} facets
 * @param {Record<string, unknown>} rawQuery
 */
export function buildStructuredSearchClause(_pc, facets, rawQuery = {}) {
  let where = "";
  const params = [];

  const cityId = facets.cityId ?? rawQuery.cityId;
  if (cityId != null) {
    const cid = Number(cityId);
    if (Number.isFinite(cid) && cid > 0) {
      where += ` AND s.provinceId = ? `;
      params.push(cid);
    }
  } else if (facets.location) {
    const locationFolded = foldVi(facets.location);
    where += ` AND (${sqlFoldVi("a.tinh_tp")} LIKE ?) `;
    params.push(`%${locationFolded}%`);
  }

  if (facets.brand) {
    where += ` AND ${sqlLowerTrim("cm.hang_xe")} = ? `;
    params.push(String(facets.brand).trim().toLowerCase());
  }

  if (facets.model) {
    where += ` AND ${sqlLowerTrim("cm.ten_xe")} = ? `;
    params.push(String(facets.model).trim().toLowerCase());
  }

  if (facets.year != null) {
    const yearStr = String(facets.year).trim();
    if (yearStr.includes("-")) {
      const parts = yearStr.split("-").map((part) => Number(part.trim()));
      const yearFrom = parts[0];
      const yearTo = parts[1];
      if (Number.isFinite(yearFrom) && Number.isFinite(yearTo)) {
        const lo = Math.min(yearFrom, yearTo);
        const hi = Math.max(yearFrom, yearTo);
        where += `
      AND (
        (pa.year_from IS NULL OR pa.year_from <= ?)
        AND
        (pa.year_to IS NULL OR pa.year_to >= ?)
      )
    `;
        params.push(hi, lo);
      }
    } else if (Number.isFinite(Number(yearStr))) {
      const y = Number(yearStr);
      where += `
      AND (
        (pa.year_from IS NULL OR pa.year_from <= ?)
        AND
        (pa.year_to IS NULL OR pa.year_to >= ?)
      )
    `;
      params.push(y, y);
    }
  }

  if (facets.category) {
    const categoryFolded = foldVi(facets.category);
    where += ` AND (
      ${sqlFoldVi("pc.category_name")} LIKE ?
      OR (
        NULLIF(TRIM(pc.canonical_name), '') IS NOT NULL
        AND ${sqlFoldVi("pc.canonical_name")} LIKE ?
      )
    ) `;
    params.push(`%${categoryFolded}%`, `%${categoryFolded}%`);
  }

  return {
    where,
    params,
    active: Boolean(where),
  };
}
