/**
 * SEARCH-INVERTED-RUNTIME-CANARY-01 — append-only canary logs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSearchCanaryAuditDir, getSearchCanaryLogDir } from "../../../config/searchCanaryConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");

function resolveDir(rel) {
  return path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(filePath, row) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function getCanaryPaths(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const logDir = resolveDir(getSearchCanaryLogDir());
  const auditDir = resolveDir(getSearchCanaryAuditDir());
  return {
    logDir,
    auditDir,
    metricsJsonl: path.join(logDir, `canary-metrics-${day}.jsonl`),
    mismatchesJsonl: path.join(logDir, `canary-mismatches-${day}.jsonl`),
    summaryJson: path.join(auditDir, "canary-summary.json"),
    mismatchesReportJson: path.join(auditDir, "canary-mismatches.json"),
    latencyJson: path.join(auditDir, "latency-report.json"),
    dailyReportMd: path.join(auditDir, "daily-report.md"),
  };
}

/**
 * @param {object} row
 */
export function appendCanaryMetric(row) {
  const { metricsJsonl } = getCanaryPaths();
  appendJsonl(metricsJsonl, row);
}

/**
 * @param {object} row
 */
export function appendCanaryMismatch(row) {
  const { mismatchesJsonl } = getCanaryPaths();
  appendJsonl(mismatchesJsonl, row);
}

export function readCanaryMetricsForDate(date = new Date()) {
  return readJsonl(getCanaryPaths(date).metricsJsonl);
}

export function readCanaryMismatchesForDate(date = new Date()) {
  return readJsonl(getCanaryPaths(date).mismatchesJsonl);
}

export function writeCanaryArtifacts(payload) {
  const paths = getCanaryPaths();
  ensureDir(paths.auditDir);
  fs.writeFileSync(paths.summaryJson, `${JSON.stringify(payload.summary, null, 2)}\n`);
  fs.writeFileSync(paths.mismatchesReportJson, `${JSON.stringify(payload.mismatches, null, 2)}\n`);
  fs.writeFileSync(paths.latencyJson, `${JSON.stringify(payload.latency, null, 2)}\n`);
  fs.writeFileSync(paths.dailyReportMd, payload.dailyReportMd);
}
