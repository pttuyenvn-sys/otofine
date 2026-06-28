/**
 * SEARCH-INVERTED-RUNTIME-CANARY-01 — shadow execution + comparison (async, no user impact).
 */

import { performance } from "node:perf_hooks";
import { LegacySearchRuntime } from "../runtime/LegacySearchRuntime.js";
import { InvertedSearchRuntime } from "../runtime/InvertedSearchRuntime.js";
import { resetInvertedSearchCache } from "../runtime/invertedSearchCache.js";
import {
  buildCompareSnapshot,
  compareSnapshots,
  candidateRecall,
} from "./searchCanaryCompare.js";
import { appendCanaryMetric, appendCanaryMismatch } from "./searchCanaryLogger.js";
import { getActiveRuntimeForCanary } from "../../../config/searchCanaryConfig.js";

/**
 * @param {Record<string, unknown>} rawQuery
 */
async function benchLegacy(rawQuery) {
  const t0 = performance.now();
  const suggest = await LegacySearchRuntime.searchSuggest(rawQuery);
  const suggestMs = performance.now() - t0;

  const t1 = performance.now();
  const top100 = await LegacySearchRuntime.searchTopProductIds(rawQuery, 100);
  const rankingMs = performance.now() - t1;

  const t2 = performance.now();
  const inventory = await LegacySearchRuntime.searchInventory(rawQuery);
  const groupingMs = performance.now() - t2;

  return {
    suggest,
    topIds: top100.ids,
    provider: top100.provider,
    inventory,
    latency: {
      total_ms: Math.round((suggestMs) * 100) / 100,
      ranking_ms: Math.round(rankingMs * 100) / 100,
      grouping_ms: Math.round(groupingMs * 100) / 100,
      popup_ms: Math.round(Math.max(0, suggestMs - rankingMs - groupingMs) * 100) / 100,
      retrieval_ms: null,
    },
  };
}

/**
 * @param {Record<string, unknown>} rawQuery
 */
async function benchInverted(rawQuery) {
  const keyword = String(rawQuery.query || rawQuery.keyword || rawQuery.q || "").trim();
  const { buildInvertedQueryPlan } = await import("../runtime/invertedSearchQuery.js");
  const {
    fetchInvertedCandidatesByTokens,
    resolveInvertedSearchExecution,
  } = await import("../runtime/invertedSearchExecution.js");
  const {
    fetchInvertedSharedGroupedInventory,
  } = await import("../runtime/invertedInventoryQuery.js");

  const t0 = performance.now();
  const plan = await buildInvertedQueryPlan(rawQuery, keyword);
  const normalizeMs = performance.now() - t0;

  const t1 = performance.now();
  const candidates = await fetchInvertedCandidatesByTokens(plan.queryTokens);
  const retrievalMs = performance.now() - t1;

  const t2 = performance.now();
  const exec = await resolveInvertedSearchExecution({ ...rawQuery, keyword, query: keyword });
  const rankingMs = performance.now() - t2;

  const t3 = performance.now();
  const { vehicleGroups, categoryGroups } = await fetchInvertedSharedGroupedInventory(
    rawQuery,
    keyword,
  );
  const groupingMs = performance.now() - t3;

  const t4 = performance.now();
  const suggest = await InvertedSearchRuntime.searchSuggest(rawQuery);
  const popupMs = performance.now() - t4;

  const inventory = {
    vehicleGroups,
    categoryGroups,
    provider: exec.provider,
  };

  const top100 = await InvertedSearchRuntime.searchTopProductIds(rawQuery, 100);
  const candidateIds = exec.candidateProductIds || candidates.map((c) => c.product_id);

  return {
    suggest,
    topIds: top100.ids,
    candidateIds,
    provider: exec.provider,
    inventory,
    latency: {
      normalize_ms: Math.round(normalizeMs * 100) / 100,
      retrieval_ms: Math.round(retrievalMs * 100) / 100,
      ranking_ms: Math.round(rankingMs * 100) / 100,
      grouping_ms: Math.round(groupingMs * 100) / 100,
      popup_ms: Math.round(popupMs * 100) / 100,
      total_ms: Math.round((normalizeMs + retrievalMs + rankingMs + groupingMs + popupMs) * 100) / 100,
      candidates: candidateIds.length,
    },
  };
}

function queryLabel(rawQuery) {
  const q = String(rawQuery.query || rawQuery.keyword || rawQuery.q || "").trim();
  const parts = [q];
  if (rawQuery.brand) parts.push(String(rawQuery.brand));
  if (rawQuery.model) parts.push(String(rawQuery.model));
  if (rawQuery.year) parts.push(String(rawQuery.year));
  if (rawQuery.location) parts.push(String(rawQuery.location));
  return parts.filter(Boolean).join(" ");
}

/**
 * Run legacy + inverted comparison (background). Never throws to caller.
 * @param {Record<string, unknown>} rawQuery
 */
export async function runSearchCanaryComparison(rawQuery) {
  resetInvertedSearchCache();

  const started = performance.now();
  const legacy = await benchLegacy(rawQuery);
  const inverted = await benchInverted(rawQuery);

  const legacySnap = buildCompareSnapshot(legacy.suggest, legacy.topIds, legacy.inventory);
  const invertedSnap = buildCompareSnapshot(inverted.suggest, inverted.topIds, inverted.inventory);
  const comparison = compareSnapshots(legacySnap, invertedSnap);
  const recall = candidateRecall(legacySnap.topIds, inverted.candidateIds);

  const row = {
    timestamp: new Date().toISOString(),
    query: queryLabel(rawQuery),
    raw_query: {
      query: rawQuery.query || rawQuery.keyword || rawQuery.q,
      brand: rawQuery.brand,
      model: rawQuery.model,
      year: rawQuery.year,
      location: rawQuery.location,
    },
    active_runtime: getActiveRuntimeForCanary(),
    legacy_ms: legacy.latency.total_ms,
    inverted_ms: inverted.latency.total_ms,
    legacy_latency: legacy.latency,
    inverted_latency: inverted.latency,
    top10_overlap: Math.round(comparison.parity.top10 * 10000) / 100,
    top20_overlap: Math.round(comparison.parity.top20 * 10000) / 100,
    top1_overlap: Math.round(comparison.parity.top1 * 10000) / 100,
    top3_overlap: Math.round(comparison.parity.top3 * 10000) / 100,
    top5_overlap: Math.round(comparison.parity.top5 * 10000) / 100,
    candidate_recall: Math.round(recall * 10000) / 100,
    mismatch_types: comparison.mismatchTypes,
    mismatch_reason: comparison.mismatchReasons.join("; ") || null,
    duration_ms: Math.round((performance.now() - started) * 100) / 100,
  };

  appendCanaryMetric(row);

  if (comparison.shouldLog) {
    appendCanaryMismatch({
      ...row,
      legacy_top20: legacySnap.topIds.slice(0, 20),
      inverted_top20: invertedSnap.topIds.slice(0, 20),
      legacy_view_all: legacySnap.viewAll,
      inverted_view_all: invertedSnap.viewAll,
    });
  }

  return row;
}

/**
 * Fire-and-forget canary (sampled). Never blocks user response.
 * @param {Record<string, unknown>} rawQuery
 */
export function scheduleSearchCanaryComparison(rawQuery) {
  setImmediate(() => {
    runSearchCanaryComparison(rawQuery).catch((err) => {
      console.error("[search-canary] comparison failed:", err?.message || err);
    });
  });
}
