import crypto from "crypto";
import { pool } from "../../../config/db.js";
import {
  buildDeterministicIdempotencyKey,
  createGovernanceActionId,
} from "./governanceActionId.server.js";
import {
  logDuplicateActionPrevented,
  logModerationAction,
  logRetrySafe,
} from "./governanceLogger.server.js";

/** @type {Promise<boolean> | null} */
let tableCache = null;

/** In-memory fallback when migration not yet applied (single-process dev). */
const memoryStore = new Map();
const MEMORY_MAX = 500;

async function hasIdempotencyTable() {
  if (!tableCache) {
    tableCache = (async () => {
      const [rows] = await pool.query(
        `
        SELECT COUNT(*) AS n
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'governance_action_idempotency'
      `,
      );
      return Number(rows?.[0]?.n || 0) > 0;
    })();
  }
  return tableCache;
}

function memoryKey(shopId, action, idempotencyKey) {
  return `${shopId}:${action}:${idempotencyKey}`;
}

export function resolveIdempotencyKey({ shopId, action, note, adminId, clientKey }) {
  const trimmed = typeof clientKey === "string" ? clientKey.trim() : "";
  if (trimmed) return trimmed.slice(0, 191);
  return buildDeterministicIdempotencyKey({ shopId, action, note, adminId });
}

export async function findIdempotentGovernanceResponse({ shopId, action, idempotencyKey }) {
  const hasTable = await hasIdempotencyTable();

  if (hasTable) {
    const [rows] = await pool.query(
      `
        SELECT action_id AS actionId, response_json AS responseJson
        FROM governance_action_idempotency
        WHERE idempotency_key = ? AND shop_id = ? AND action = ?
        LIMIT 1
      `,
      [idempotencyKey, shopId, action],
    );
    if (!rows?.length) return null;
    const row = rows[0];
    let response = null;
    try {
      response = typeof row.responseJson === "string" ? JSON.parse(row.responseJson) : row.responseJson;
    } catch {
      response = null;
    }
    return { actionId: row.actionId, response };
  }

  const hit = memoryStore.get(memoryKey(shopId, action, idempotencyKey));
  return hit || null;
}

export async function saveIdempotentGovernanceResponse({
  shopId,
  action,
  idempotencyKey,
  actionId,
  response,
}) {
  const payload = { ...response, actionId, idempotent: false };
  const hasTable = await hasIdempotencyTable();

  if (hasTable) {
    await pool.query(
      `
        INSERT INTO governance_action_idempotency
          (idempotency_key, shop_id, action, action_id, response_json)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          action_id = VALUES(action_id),
          response_json = VALUES(response_json)
      `,
      [idempotencyKey, shopId, action, actionId, JSON.stringify(payload)],
    );
    return payload;
  }

  const key = memoryKey(shopId, action, idempotencyKey);
  memoryStore.set(key, { actionId, response: payload });
  if (memoryStore.size > MEMORY_MAX) {
    const first = memoryStore.keys().next().value;
    if (first) memoryStore.delete(first);
  }
  return payload;
}

/**
 * Execute a governance action with idempotency protection.
 * @param {object} params
 * @param {number} params.shopId
 * @param {string} params.action
 * @param {string} params.note
 * @param {number|null} params.adminId
 * @param {string} [params.idempotencyKey]
 * @param {(actionId: string) => Promise<object>} params.handler
 */
export async function withGovernanceIdempotency({
  shopId,
  action,
  note,
  adminId,
  idempotencyKey: clientKey,
  handler,
}) {
  const idempotencyKey = resolveIdempotencyKey({
    shopId,
    action,
    note,
    adminId,
    clientKey,
  });

  const existing = await findIdempotentGovernanceResponse({ shopId, action, idempotencyKey });
  if (existing?.response) {
    logDuplicateActionPrevented({
      shopId,
      action,
      actionId: existing.actionId,
      idempotencyKey,
    });
    logRetrySafe({
      shopId,
      action,
      actionId: existing.actionId,
      idempotencyKey,
      outcome: "returned_cached_response",
    });
    return { ...existing.response, actionId: existing.actionId, idempotent: true };
  }

  const actionId = createGovernanceActionId();
  const result = await handler(actionId);
  const response = await saveIdempotentGovernanceResponse({
    shopId,
    action,
    idempotencyKey,
    actionId,
    response: result,
  });

  logModerationAction({
    source: "shopGovernanceAction",
    shopId,
    action,
    actionId,
    idempotencyKey,
    moderatorAdminId: adminId,
    ...result,
  });

  return response;
}

/** Hash note content for soft duplicate detection within notes table. */
export function hashNoteContent(content) {
  return crypto.createHash("sha256").update(String(content || "").trim()).digest("hex");
}
