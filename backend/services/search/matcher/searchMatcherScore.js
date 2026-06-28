/**
 * SEARCH-INDEX-MATCHER-01 — candidate scoring.
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";

/**
 * @param {object} doc — index row
 * @param {object} ctx
 * @param {string} ctx.foldedPhrase
 * @param {string[]} ctx.queryTokens
 * @param {string[]} ctx.expandedTokens
 * @param {object} ctx.facets
 */
export function scoreMatcherDocument(doc, ctx) {
  let score = 0;
  const normBlob = ` ${String(doc.normalized_tokens || "")} `;
  const synBlob = ` ${String(doc.synonym_tokens || "")} `;
  const searchBlob = ` ${foldVi(doc.search_text || "")} `;

  if (ctx.foldedPhrase && searchBlob.includes(` ${ctx.foldedPhrase} `)) score += 120;
  if (ctx.foldedPhrase && normBlob.includes(` ${ctx.foldedPhrase} `)) score += 100;

  let tokenHits = 0;
  for (const token of ctx.queryTokens) {
    const t = foldVi(token);
    if (normBlob.includes(` ${t} `) || synBlob.includes(` ${t} `)) tokenHits += 1;
    else if (searchBlob.includes(` ${t} `)) tokenHits += 0.5;
  }
  if (ctx.queryTokens.length) {
    score += (tokenHits / ctx.queryTokens.length) * 80;
  }

  for (const token of ctx.expandedTokens) {
    const t = foldVi(token);
    if (synBlob.includes(` ${t} `)) score += 4;
  }

  if (ctx.facets?.partNumber) {
    const pn = String(ctx.facets.partNumber).toLowerCase();
    if (String(doc.part_number_norm || "") === pn.replace(/[\s-]/g, "")) score += 200;
    if (String(doc.part_number || "").toLowerCase() === pn) score += 180;
  }

  if (ctx.facets?.brand) {
    const b = foldVi(ctx.facets.brand);
    if (foldVi(doc.brand_name) === b) score += 40;
  }
  if (ctx.facets?.model) {
    const m = foldVi(ctx.facets.model);
    if (foldVi(doc.model_name) === m) score += 40;
  }
  if (ctx.facets?.year != null) {
    const y = Number(ctx.facets.year);
    if (Number.isFinite(y) && y > 0) {
      const yf = Number(doc.year_from) || 0;
      const yt = Number(doc.year_to) || 0;
      if ((yf === 0 || yf <= y) && (yt === 0 || yt >= y)) score += 15;
    }
  }
  if (ctx.facets?.category) {
    const c = foldVi(ctx.facets.category);
    if (foldVi(doc.category_name).includes(c)) score += 25;
  }

  score += Math.min(20, Number(doc.search_priority) || 0);
  score += Math.min(30, (Number(doc.popularity_score) || 0) / 1e12);

  return score;
}

/**
 * @param {object[]} docs
 * @param {object} ctx
 */
export function rankMatcherDocuments(docs, ctx) {
  return [...docs]
    .map((doc) => ({ doc, score: scoreMatcherDocument(doc, ctx) }))
    .sort((a, b) => b.score - a.score || Number(a.doc.product_id) - Number(b.doc.product_id));
}
