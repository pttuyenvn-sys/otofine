/**
 * SEARCH-RANKING-PARITY-01 — load configurable ranking weights.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSearchRankingWeightsPath } from "../../../config/searchRankingConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../");

/** @type {Record<string, Record<string, number>> | null} */
let cached = null;
/** @type {string | null} */
let cachedPath = null;

function resolveWeightsPath() {
  const rel = getSearchRankingWeightsPath();
  return path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
}

/**
 * @param {string} [mode]
 */
export function loadSearchRankingWeights(mode = "weighted_v2") {
  const filePath = resolveWeightsPath();
  if (!cached || cachedPath !== filePath) {
    cached = JSON.parse(fs.readFileSync(filePath, "utf8"));
    cachedPath = filePath;
  }
  return { ...(cached[mode] || cached.weighted_v2 || {}) };
}

/**
 * @param {Record<string, number>} weights
 * @param {string} [mode]
 */
export function saveSearchRankingWeights(weights, mode = "weighted_v2") {
  const filePath = resolveWeightsPath();
  let payload = {};
  try {
    payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    payload = {};
  }
  payload[mode] = weights;
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  cached = payload;
  cachedPath = filePath;
}

export function resetSearchRankingWeightsCache() {
  cached = null;
  cachedPath = null;
}
