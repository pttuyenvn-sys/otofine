/**
 * SEARCH-GROUPING-PARITY-01 — load configurable grouping quality weights.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSearchGroupingWeightsPath } from "../../../config/searchGroupingConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../");

/** @type {Record<string, Record<string, number>> | null} */
let cached = null;
/** @type {string | null} */
let cachedPath = null;

function resolveWeightsPath() {
  const rel = getSearchGroupingWeightsPath();
  return path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
}

/**
 * @param {string} [mode]
 */
export function loadSearchGroupingWeights(mode = "quality_gate_v2") {
  const filePath = resolveWeightsPath();
  if (!cached || cachedPath !== filePath) {
    cached = JSON.parse(fs.readFileSync(filePath, "utf8"));
    cachedPath = filePath;
  }
  return { ...(cached[mode] || cached.quality_gate_v2 || {}) };
}

export function resetSearchGroupingWeightsCache() {
  cached = null;
  cachedPath = null;
}
