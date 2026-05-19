import * as reqRepo from "../repositories/rfqRequest.repository.js";
import { hashViewerToken } from "../utils/tokenHash.js";
import { rfqClientIp } from "../utils/rfqNet.js";
import {
  assertViewerLookupAllowed,
  recordViewerAuthFailure,
  recordViewerAuthSuccess,
} from "../utils/rfqViewerThrottle.js";
import { rfqLog } from "../utils/rfqLogger.js";
import { sendHttpError } from "../utils/httpError.js";

const HDR = "x-rfq-viewer-token";

export async function rfqViewerAuth(req, res, next) {
  const raw =
    req.headers[HDR] ||
    (req.query.token ? String(req.query.token) : "");

  const ip = rfqClientIp(req);

  if (!raw || raw.length < 16) {
    rfqLog.warn("rfq.viewer.invalid", { ip, reason: "missing_short" });
    return res.status(401).json({ message: "Thiếu viewer token" });
  }

  try {
    assertViewerLookupAllowed(ip, raw.trim());
  } catch (e) {
    rfqLog.warn("rfq.viewer.brute_circuit", { ip, reason: e.message });
    return sendHttpError(res, e);
  }

  const hash = hashViewerToken(raw.trim());
  const row = await reqRepo.findByViewerTokenHash(hash);
  if (!row || row.deleted_at) {
    recordViewerAuthFailure(ip, raw.trim());
    rfqLog.warn("rfq.viewer.invalid", { ip, reason: "hash_miss" });
    return res.status(404).json({ message: "Không tìm thấy RFQ" });
  }

  recordViewerAuthSuccess(ip);
  req.rfqRequest = row;
  req.rfqViewerRawToken = raw.trim();
  next();
}
