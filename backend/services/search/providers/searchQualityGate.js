/**
 * HYBRID-SEARCH-QUALITY-GATE-01 — quality-based FULLTEXT vs LIKE decision.
 * Decision layer only; providers unchanged.
 */

import { foldVi, normalizeSearchText } from "../../../utils/keywordRelevanceRanking.js";
import { normalizePartNumber } from "../../../utils/listingQueryNormalize.js";
import {
  getQualityGateThreshold,
  getQualityWeights,
  isSearchEngineDebug,
} from "../../../config/searchEngineConfig.js";

/**
 * @typedef {'low' | 'high'} RiskLevel
 * @typedef {'high' | 'medium' | 'low'} ParserConfidence
 */

/**
 * @typedef {object} ParserRiskAssessment
 * @property {RiskLevel} level
 * @property {ParserConfidence} confidence
 * @property {string} reason
 */

/**
 * @typedef {object} QualitySampleRow
 * @property {number} id
 * @property {string} title
 * @property {string} partNumber
 * @property {string} category_name
 * @property {string} brand
 * @property {string} model
 * @property {number | null} year_from
 * @property {number | null} year_to
 */

/**
 * @param {import('./searchFacetResolver.js').resolveSearchFacets extends (...args: any[]) => Promise<infer R> ? R : never} facets
 * @param {string} keyword
 */
export function assessParserRisk(facets, keyword) {
  const words = normalizeSearchText(keyword).split(/\s+/).filter(Boolean);

  if (facets.partNumber) {
    return { level: "low", confidence: "high", reason: "part-number" };
  }

  if (facets.brand && facets.model) {
    return { level: "low", confidence: "high", reason: "brand+model" };
  }

  if (facets.brand && words.length <= 1) {
    return { level: "low", confidence: "high", reason: "brand+keyword" };
  }

  if (words.length >= 2 && facets.hasStructuredFacets) {
    return { level: "low", confidence: "high", reason: "structured+multi-word" };
  }

  if (words.length === 1 && !facets.brand && !facets.model && !facets.category) {
    return { level: "high", confidence: "low", reason: "single-word-unscoped" };
  }

  if (facets.brand && !facets.model) {
    return { level: "high", confidence: "medium", reason: "brand-only-broad" };
  }

  if (words.length === 1) {
    return { level: "high", confidence: "low", reason: "single-word" };
  }

  return { level: "high", confidence: "low", reason: "default" };
}

/**
 * @param {QualitySampleRow[]} rows
 * @param {string} target
 */
function foldMatchRate(rows, target, matcher) {
  if (!rows.length || !target) return 0;
  const hits = rows.filter((row) => matcher(row, target)).length;
  return hits / rows.length;
}

/**
 * @param {import('./searchFacetResolver.js').resolveSearchFacets extends (...args: any[]) => Promise<infer R> ? R : never} facets
 * @param {string} keyword
 * @param {QualitySampleRow[]} rows
 */
export function computeQualityScore(facets, keyword, rows) {
  const weights = getQualityWeights();
  const kwFold = foldVi(keyword);
  const words = normalizeSearchText(keyword).split(/\s+/).filter(Boolean);

  /** @type {Record<string, number>} */
  const breakdown = {};
  let earned = 0;
  let applicable = 0;

  if (!rows.length) {
    return { score: 0, breakdown, productCount: 0, structuredCoverage: 0 };
  }

  const n = rows.length;

  if (facets.category) {
    const target = foldVi(facets.category);
    const rate = foldMatchRate(rows, target, (row) => {
      const cat = foldVi(row.category_name);
      return cat.includes(target) || target.includes(cat);
    });
    breakdown.category = Math.round(weights.category * rate);
    earned += breakdown.category;
    applicable += weights.category;
  } else if (!(facets.brand && facets.model) && words.length >= 1) {
    const phrase = words.join(" ");
    const rate = rows.filter((row) => {
      const cat = foldVi(row.category_name);
      if (phrase.length >= 4 && cat.includes(phrase)) return true;
      return words.filter((w) => w.length >= 2).every((w) => cat.includes(w));
    }).length / n;
    breakdown.category = Math.round(weights.category * rate);
    earned += breakdown.category;
    applicable += weights.category;
  }

  if (facets.brand) {
    const target = foldVi(facets.brand);
    const rate = foldMatchRate(rows, target, (row) => foldVi(row.brand) === target);
    breakdown.brand = Math.round(weights.brand * rate);
    earned += breakdown.brand;
    applicable += weights.brand;
  }

  if (facets.model) {
    const target = foldVi(facets.model);
    const rate = foldMatchRate(rows, target, (row) => foldVi(row.model) === target);
    breakdown.model = Math.round(weights.model * rate);
    earned += breakdown.model;
    applicable += weights.model;
  }

  if (facets.year != null) {
    const y = Number(facets.year);
    const rate = rows.filter(
      (row) =>
        (!row.year_from || Number(row.year_from) <= y)
        && (!row.year_to || Number(row.year_to) >= y),
    ).length / n;
    breakdown.year = Math.round(weights.year * rate);
    earned += breakdown.year;
    applicable += weights.year;
  }

  if (facets.partNumber) {
    const norm = facets.normalizedPartNumber;
    const rate = rows.filter((row) => normalizePartNumber(row.partNumber) === norm).length / n;
    breakdown.partNumber = Math.round(weights.partNumber * rate);
    earned += breakdown.partNumber;
    applicable += weights.partNumber;
  }

  if (keyword) {
    const rate = rows.filter((row) => {
      const title = foldVi(row.title);
      if (kwFold && (title.includes(kwFold) || kwFold.includes(title))) return true;
      const significant = words.filter((w) => w.length >= 2);
      return significant.length > 0 && significant.every((w) => title.includes(w));
    }).length / n;
    breakdown.phrase = Math.round(weights.phrase * rate);
    earned += breakdown.phrase;
    applicable += weights.phrase;
  }

  let structuredCoverage = 100;
  const structuredChecks = [];
  if (facets.brand) {
    structuredChecks.push(
      rows.filter((row) => foldVi(row.brand) === foldVi(facets.brand)).length / n,
    );
  }
  if (facets.model) {
    structuredChecks.push(
      rows.filter((row) => foldVi(row.model) === foldVi(facets.model)).length / n,
    );
  }
  if (facets.category) {
    const target = foldVi(facets.category);
    structuredChecks.push(
      rows.filter((row) => foldVi(row.category_name).includes(target)).length / n,
    );
  }
  if (structuredChecks.length) {
    structuredCoverage = Math.round(
      (structuredChecks.reduce((a, b) => a + b, 0) / structuredChecks.length) * 100,
    );
    const coverageBonus = Math.round((structuredCoverage / 100) * 5);
    breakdown.structuredCoverage = coverageBonus;
    earned += coverageBonus;
    applicable += 5;
  }

  const productCountPenalty =
    words.length === 1 && !facets.brand && n >= 60 ? 10 : 0;
  if (productCountPenalty > 0) {
    breakdown.productCountPenalty = -productCountPenalty;
    earned = Math.max(0, earned - productCountPenalty);
  }

  const score = applicable > 0 ? Math.min(100, Math.round((earned / applicable) * 100)) : 0;

  return {
    score,
    breakdown,
    productCount: n,
    structuredCoverage,
    applicableWeight: applicable,
    earned,
  };
}

/**
 * @param {object} input
 * @param {number} input.qualityScore
 * @param {ParserRiskAssessment} input.risk
 * @param {boolean | null} input.parityOk
 * @param {number} [input.threshold]
 */
export function decideFulltextUsage({ qualityScore, risk, parityOk, threshold }) {
  const minScore = threshold ?? getQualityGateThreshold();
  if (qualityScore < minScore) {
    return { useFulltext: false, reason: "quality-below-threshold" };
  }
  if (risk.level === "low") {
    return { useFulltext: true, reason: "quality-pass-low-risk" };
  }
  if (parityOk === true) {
    return { useFulltext: true, reason: "quality-pass-parity-pass" };
  }
  if (parityOk === false) {
    return { useFulltext: false, reason: "quality-pass-parity-fail" };
  }
  return { useFulltext: false, reason: "parity-required" };
}

/**
 * @param {object} log
 */
export function logQualityGateDecision(log) {
  if (!isSearchEngineDebug()) return;
  const parts = [
    "[search-quality-gate]",
    `query=${JSON.stringify(log.query)}`,
    `score=${log.qualityScore}`,
    `provider=${log.provider}`,
    `parity=${log.parityUsed ? "Used" : "Skipped"}`,
    `risk=${log.risk?.level}/${log.risk?.reason}`,
    `reason=${log.decisionReason}`,
  ];
  if (log.breakdown) {
    parts.push(`breakdown=${JSON.stringify(log.breakdown)}`);
  }
  console.log(parts.join(" "));
}
