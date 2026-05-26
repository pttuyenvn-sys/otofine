import * as sessionRepo from "../repositories/rfqHistorySession.repository.js";
import { hashHistoryToken } from "../utils/tokenHash.js";
import { sendHttpError } from "../utils/httpError.js";

const HDR = "x-rfq-history-token";

export async function rfqHistoryAuth(req, res, next) {
  const raw =
    req.headers[HDR] ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "");

  const token = String(raw || "").trim();
  if (!token || token.length < 16) {
    return res.status(401).json({ message: "Thiếu history token", code: "HISTORY_TOKEN_MISSING" });
  }

  try {
    const hash = hashHistoryToken(token);
    const row = await sessionRepo.findByTokenHash(hash);
    if (!row) {
      return res.status(401).json({ message: "Phiên đăng nhập hết hạn", code: "HISTORY_TOKEN_INVALID" });
    }

    req.rfqHistorySession = row;
    req.rfqHistoryRawToken = token;
    req.rfqHistoryTokenHash = hash;

    void sessionRepo.touchSession(row.id);
    next();
  } catch (e) {
    return sendHttpError(res, e);
  }
}
