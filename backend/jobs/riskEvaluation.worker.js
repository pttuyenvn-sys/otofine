#!/usr/bin/env node
/**
 * Governance risk evaluation worker — SAFE MODE.
 * Evaluates pending products on a 5–10 minute interval; flags only (no bans/actions).
 *
 * PM2: pm2 start ecosystem.config.cjs --only governance-risk-worker
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

import { logInfo, logWarn, logError } from "../utils/syncLogger.js";
import { runRiskEvaluationWorkerBatch } from "../modules/governance/services/riskEvaluation.service.js";
import { recordEvaluationRun } from "../modules/governance/services/governanceMetrics.service.js";
import { invalidateGovernanceDashboardCache } from "../modules/governance/services/governanceDashboardCache.server.js";
import { writeWorkerHeartbeat } from "../modules/governance/services/governanceWorkerHeartbeat.server.js";
import { logWorkerRun } from "../modules/governance/services/governanceLogger.server.js";
import {
  tryAcquireWorkerLock,
  releaseWorkerLock,
} from "../modules/governance/services/governanceWorkerLock.server.js";

const SCOPE = "governance-risk-worker";
const __filename = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

function isEnabled() {
  const raw = process.env.GOVERNANCE_RISK_WORKER_ENABLED;
  if (raw == null || raw === "") return true;
  return String(raw).toLowerCase() === "true" || raw === "1";
}

function nextPollDelayMs() {
  const minMs = Math.max(60_000, Number(process.env.GOVERNANCE_RISK_POLL_MIN_MS || 300_000));
  const maxMs = Math.max(minMs, Number(process.env.GOVERNANCE_RISK_POLL_MAX_MS || 600_000));
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

async function tick() {
  if (!isEnabled()) {
    logWarn(SCOPE, "worker disabled via GOVERNANCE_RISK_WORKER_ENABLED");
    writeWorkerHeartbeat({ status: "disabled", lastRunAt: new Date().toISOString() });
    return;
  }

  const lockResult = tryAcquireWorkerLock();
  if (!lockResult.acquired) {
    writeWorkerHeartbeat({
      status: "locked",
      lastRunAt: new Date().toISOString(),
      lastError: "worker lock held by another process",
    });
    return;
  }

  const started = Date.now();
  const lastRunAt = new Date().toISOString();
  writeWorkerHeartbeat({ status: "running", lastRunAt, lastError: null });

  try {
    const result = await runRiskEvaluationWorkerBatch();
    recordEvaluationRun({
      durationMs: result.durationMs,
      productsScanned: result.productsScanned,
      productsSkipped: result.productsSkipped,
      flagsGenerated: result.flagsGenerated,
      failures: result.productsFailed || 0,
    });

    invalidateGovernanceDashboardCache();

    const meta = {
      durationMs: result.durationMs,
      queueSize: result.queueSize,
      productsScanned: result.productsScanned,
      productsFailed: result.productsFailed || 0,
      productsSkipped: result.productsSkipped,
      flagsGenerated: result.flagsGenerated,
      partialSuccess: Boolean(result.partialSuccess),
      highRiskShops: result.alerts?.highRiskShops?.length || 0,
      highRiskProducts: result.alerts?.highRiskProducts?.length || 0,
      tickOverheadMs: Date.now() - started,
    };

    logWorkerRun(meta);
    logInfo(SCOPE, "batch complete", meta);

    writeWorkerHeartbeat({
      status: result.productsFailed ? "degraded" : "idle",
      lastRunAt,
      lastSuccessAt: new Date().toISOString(),
      lastError: result.alertError || (result.productsFailed ? `${result.productsFailed} item failures` : null),
      lastBatch: {
        productsScanned: result.productsScanned,
        productsFailed: result.productsFailed || 0,
        flagsGenerated: result.flagsGenerated,
        queueSize: result.queueSize,
      },
    });
  } catch (err) {
    const message = String(err?.message || err);
    logError(SCOPE, "batch failed", { err: message });
    logWorkerRun({ ok: false, error: message, durationMs: Date.now() - started });
    writeWorkerHeartbeat({
      status: "error",
      lastRunAt,
      lastError: message,
    });
  } finally {
    releaseWorkerLock(process.pid);
  }
}

function scheduleNext() {
  const delayMs = nextPollDelayMs();
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  writeWorkerHeartbeat({ nextRunAt, status: "scheduled" });
  logInfo(SCOPE, "next run scheduled", { delayMs, nextRunAt });
  setTimeout(async () => {
    await tick();
    scheduleNext();
  }, delayMs);
}

if (isMain) {
  writeWorkerHeartbeat({ status: "starting", startedAt: new Date().toISOString() });
  logInfo(SCOPE, "starting", {
    enabled: isEnabled(),
    pollMinMs: Number(process.env.GOVERNANCE_RISK_POLL_MIN_MS || 300_000),
    pollMaxMs: Number(process.env.GOVERNANCE_RISK_POLL_MAX_MS || 600_000),
    batch: Number(process.env.GOVERNANCE_RISK_BATCH || 50),
    skipMinutes: Number(process.env.GOVERNANCE_RISK_SKIP_MINUTES || 10),
  });

  tick()
    .catch((err) => logError(SCOPE, "initial tick failed", { err: String(err?.message || err) }))
    .finally(() => scheduleNext());
}
