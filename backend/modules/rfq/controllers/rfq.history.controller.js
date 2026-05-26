import * as history from "../services/rfqHistory.service.js";
import * as attrSvc from "../services/rfqReminderAttribution.service.js";
import { sendHttpError } from "../utils/httpError.js";

export async function rfqHistoryRequestOtp(req, res) {
  try {
    const data = await history.requestHistoryOtp(req.body || {});
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqHistoryVerifyOtp(req, res) {
  try {
    const data = await history.verifyHistoryOtp(req.body || {});
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqHistoryListRequests(req, res) {
  try {
    const data = await history.listHistoryRequests(req.rfqHistorySession);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqHistorySummary(req, res) {
  try {
    const data = await history.getHistorySummary(req.rfqHistorySession);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqHistoryGetRequest(req, res) {
  try {
    const publicId = String(req.params.publicId || "").trim();
    const data = await history.getHistoryRequestDetail(req.rfqHistorySession, publicId);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqHistoryOpenRequest(req, res) {
  try {
    const publicId = String(req.params.publicId || "").trim();
    const data = await history.openHistoryRequest(req.rfqHistorySession, publicId);
    if (data?.rfqRequestId) {
      void attrSvc.tryAttributeReminderConversion(data.rfqRequestId, "reopen", {
        source: "history_open",
        public_id: publicId,
      });
    }
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqHistoryLogout(req, res) {
  try {
    await history.logoutHistorySession(req.rfqHistoryTokenHash);
    res.json({ ok: true });
  } catch (e) {
    sendHttpError(res, e);
  }
}
