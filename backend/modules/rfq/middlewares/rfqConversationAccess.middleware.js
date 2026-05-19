import { requireAuth, requireShop } from "../../../middlewares/auth.js";
import { pool } from "../../../config/db.js";
import * as reqRepo from "../repositories/rfqRequest.repository.js";
import { hashViewerToken } from "../utils/tokenHash.js";
import { rfqClientIp } from "../utils/rfqNet.js";
import {
  assertViewerLookupAllowed,
  recordViewerAuthFailure,
  recordViewerAuthSuccess,
} from "../utils/rfqViewerThrottle.js";
import * as dispatchRepo from "../repositories/rfqDispatch.repository.js";

const VIEWER_HDR = "x-rfq-viewer-token";

function parseDispatchId(req) {
  const dispatchId = Number(req.params.dispatchId);
  if (!Number.isFinite(dispatchId) || dispatchId <= 0) return null;
  return dispatchId;
}

/**
 * Conversation APIs: shop JWT or buyer viewer token (x-rfq-viewer-token).
 * Used for GET/POST messages. Unread counts and websocket reuse this model later.
 */
export function rfqConversationAccess(req, res, next) {
  const dispatchId = parseDispatchId(req);
  if (!dispatchId) {
    return res.status(400).json({ message: "dispatchId không hợp lệ" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    return requireAuth(req, res, () => {
      if (!req.user || req.user.role !== "shop") {
        return res.status(403).json({ message: "Chỉ tài khoản shop" });
      }
      return requireShop(req, res, async () => {
        try {
          const dispatch = await dispatchRepo.findDispatchForShop(
            dispatchId,
            req.shop.id,
          );
          if (!dispatch) {
            return res.status(404).json({ message: "Không tìm thấy" });
          }
          req.conversationAccess = {
            type: "shop",
            shopId: req.shop.id,
            dispatchId,
          };
          next();
        } catch (e) {
          next(e);
        }
      });
    });
  }

  const raw =
    req.headers[VIEWER_HDR] ||
    (req.query.token ? String(req.query.token) : "");

  if (raw && raw.length >= 16) {
    return authorizeViewer(req, res, next, dispatchId, raw.trim());
  }

  return res.status(401).json({
    message: "Cần đăng nhập shop hoặc viewer token",
  });
}

async function authorizeViewer(req, res, next, dispatchId, raw) {
  const ip = rfqClientIp(req);

  try {
    assertViewerLookupAllowed(ip, raw);
  } catch (e) {
    return res.status(e.status || 429).json({ message: e.message });
  }

  const hash = hashViewerToken(raw);
  const row = await reqRepo.findByViewerTokenHash(hash);
  if (!row || row.deleted_at) {
    recordViewerAuthFailure(ip, raw);
    return res.status(404).json({ message: "Không tìm thấy RFQ" });
  }

  const [[d]] = await pool.query(
    `SELECT id, rfq_request_id FROM rfq_dispatches WHERE id = ? LIMIT 1`,
    [dispatchId],
  );
  if (!d || Number(d.rfq_request_id) !== Number(row.id)) {
    recordViewerAuthFailure(ip, raw);
    return res.status(404).json({ message: "Không tìm thấy" });
  }

  recordViewerAuthSuccess(ip);
  req.rfqRequest = row;
  req.conversationAccess = {
    type: "buyer",
    rfqRequestId: row.id,
    dispatchId,
  };
  next();
}

/**
 * Buyer-only RFQ scope (no dispatchId) — for unread-summary batch queries.
 */
export function rfqBuyerRfqAccess(req, res, next) {
  const raw =
    req.headers[VIEWER_HDR] ||
    (req.query.token ? String(req.query.token) : "");

  if (!raw || raw.length < 16) {
    return res.status(401).json({ message: "Cần viewer token" });
  }

  return authorizeViewerForRfq(req, res, next, raw.trim());
}

async function authorizeViewerForRfq(req, res, next, raw) {
  const ip = rfqClientIp(req);

  try {
    assertViewerLookupAllowed(ip, raw);
  } catch (e) {
    return res.status(e.status || 429).json({ message: e.message });
  }

  const hash = hashViewerToken(raw);
  const row = await reqRepo.findByViewerTokenHash(hash);
  if (!row || row.deleted_at) {
    recordViewerAuthFailure(ip, raw);
    return res.status(404).json({ message: "Không tìm thấy RFQ" });
  }

  recordViewerAuthSuccess(ip);
  req.rfqRequest = row;
  req.conversationAccess = {
    type: "buyer",
    rfqRequestId: row.id,
  };
  next();
}
