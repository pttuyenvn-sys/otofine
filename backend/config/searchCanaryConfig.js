/**
 * SEARCH-INVERTED-RUNTIME-CANARY-01 — shadow canary (legacy vs inverted).
 */

import { getSearchRuntimeMode, isSearchLegacyRuntime } from "./searchRuntimeConfig.js";

/** @typedef {100 | 10 | 5 | 1} SearchCanarySamplePct */

export function isSearchCanaryEnabled() {
  const raw = String(process.env.SEARCH_CANARY ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

/**
 * Shadow mode: user always receives legacy; inverted evaluated in background.
 * Stage 1: SEARCH_CANARY=1 + SEARCH_RUNTIME=legacy
 */
export function isSearchCanaryShadowMode() {
  return isSearchCanaryEnabled() && isSearchLegacyRuntime();
}

/**
 * @returns {SearchCanarySamplePct}
 */
export function getSearchCanarySampleRate() {
  const raw = Number(process.env.SEARCH_CANARY_SAMPLE_RATE ?? 100);
  if (raw <= 1) return 1;
  if (raw <= 5) return 5;
  if (raw <= 10) return 10;
  return 100;
}

export function shouldSampleCanary() {
  const pct = getSearchCanarySampleRate();
  if (pct >= 100) return true;
  return Math.random() * 100 < pct;
}

export function getSearchCanaryLogDir() {
  return String(process.env.SEARCH_CANARY_LOG_DIR || "audit/search-inverted-runtime-canary-01/logs").trim();
}

export function getSearchCanaryAuditDir() {
  return String(process.env.SEARCH_CANARY_AUDIT_DIR || "audit/search-inverted-runtime-canary-01").trim();
}

export function getActiveRuntimeForCanary() {
  return getSearchRuntimeMode();
}
