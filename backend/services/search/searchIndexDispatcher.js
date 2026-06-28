/**
 * SEARCH-INDEX-SYNC-IMPLEMENT-01
 * Queue-ready dispatcher — sync immediately today; swap executor for Redis/BullMQ later.
 */

import {
  isSearchIndexSyncDebug,
  isSearchIndexSyncEnabled,
} from "../../config/searchIndexConfig.js";

/**
 * @typedef {'sync' | 'delete' | 'rebuild'} SearchIndexJobType
 * @typedef {object} SearchIndexJob
 * @property {SearchIndexJobType} type
 * @property {number} productId
 * @property {string} [source]
 * @property {string} [reason]
 */

/**
 * @typedef {object} SearchIndexExecutor
 * @property {(job: SearchIndexJob) => Promise<unknown>} run
 */

/** @type {SearchIndexExecutor | null} */
let executor = null;

/**
 * Register executor (default: immediate in-process). Queue workers replace this only.
 * @param {SearchIndexExecutor} next
 */
export function setSearchIndexExecutor(next) {
  executor = next;
}

async function defaultRun(job) {
  const { syncProduct, deleteProduct, rebuildProduct } = await import(
    "./SearchIndexSyncService.js"
  );
  if (job.type === "delete") {
    return deleteProduct(job.productId, { source: job.source, reason: job.reason });
  }
  if (job.type === "rebuild") {
    return rebuildProduct(job.productId, { source: job.source, reason: job.reason, force: true });
  }
  return syncProduct(job.productId, { source: job.source, reason: job.reason });
}

function getExecutor() {
  if (!executor) {
    executor = { run: defaultRun };
  }
  return executor;
}

/**
 * @param {SearchIndexJob} job
 */
export function enqueueSearchIndexJob(job) {
  if (!isSearchIndexSyncEnabled()) return;
  const pid = Number(job.productId);
  if (!Number.isFinite(pid) || pid <= 0) return;

  const payload = { ...job, productId: pid };
  void getExecutor()
    .run(payload)
    .catch((err) => {
      console.warn(
        "[search-index-sync] job failed",
        JSON.stringify({
          type: payload.type,
          productId: payload.productId,
          source: payload.source,
          reason: payload.reason,
          error: err?.message || String(err),
          retryReady: true,
        }),
      );
    });
}

export function queueSearchIndexSync(productId, meta = {}) {
  enqueueSearchIndexJob({
    type: "sync",
    productId: Number(productId),
    source: meta.source || "unknown",
    reason: meta.reason || "",
  });
}

export function queueSearchIndexDelete(productId, meta = {}) {
  enqueueSearchIndexJob({
    type: "delete",
    productId: Number(productId),
    source: meta.source || "unknown",
    reason: meta.reason || "",
  });
}

export function queueSearchIndexRebuild(productId, meta = {}) {
  enqueueSearchIndexJob({
    type: "rebuild",
    productId: Number(productId),
    source: meta.source || "unknown",
    reason: meta.reason || "",
  });
}

/**
 * Location / shop field changes — resync all products for a shop (fire-and-forget).
 * @param {number|string} shopId
 * @param {{ source?: string, reason?: string }} [meta]
 */
export function queueSearchIndexSyncForShop(shopId, meta = {}) {
  if (!isSearchIndexSyncEnabled()) return;
  const sid = Number(shopId);
  if (!Number.isFinite(sid) || sid <= 0) return;

  void (async () => {
    const { pool } = await import("../../config/db.js");
    const [rows] = await pool.query(`SELECT id FROM products WHERE shopId = ?`, [sid]);
    for (const row of rows) {
      enqueueSearchIndexJob({
        type: "sync",
        productId: Number(row.id),
        source: meta.source || "shop.location",
        reason: meta.reason || "location",
      });
    }
  })().catch((err) => {
    console.warn(
      "[search-index-sync] shop sync failed",
      JSON.stringify({ shopId: sid, error: err?.message || String(err), retryReady: true }),
    );
  });
}

/**
 * @param {object} log
 */
export function logSearchIndexSync(log) {
  if (!isSearchIndexSyncDebug()) return;
  console.log(
    "[search-index-sync]",
    `source=${log.source}`,
    `productId=${log.productId}`,
    `hashChanged=${log.hashChanged ?? "n/a"}`,
    `action=${log.action}`,
    `durationMs=${log.durationMs}`,
    log.reason ? `reason=${log.reason}` : "",
  );
}
