import * as adminSvc from "../services/rfqAdminHealth.service.js";
import * as rfqObs from "../services/rfqObservability.service.js";
import * as analyticsSvc from "../services/rfqAnalytics.service.js";
import * as opsSvc from "../services/rfqAdminOps.service.js";
import * as jobRepo from "../repositories/rfqEscalationJob.repository.js";
import { sendHttpError } from "../utils/httpError.js";

export async function rfqAdminHealth(req, res) {
  try {
    const snapshot = await adminSvc.getRfqAdminHealthSnapshot();
    const deadOrSkipped = await jobRepo.listRecentDeadOrSkipped(40);
    res.json({
      counters: rfqObs.getRfqCountersSnapshot(),
      snapshot,
      recent_escalations: deadOrSkipped,
    });
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminMetrics(req, res) {
  try {
    const snapshot = await adminSvc.getRfqAdminHealthSnapshot();
    res.json({
      counters: rfqObs.getRfqCountersSnapshot(),
      funnel24h: snapshot.last24h,
      backlog: snapshot.backlog,
      latency_seconds_7d: snapshot.latency_seconds_7d,
    });
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminAnalyticsFunnel(req, res) {
  try {
    const days = req.query.days;
    const data = await analyticsSvc.getRfqFunnelAnalytics(days);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminAnalyticsSellers(req, res) {
  try {
    const days = req.query.days;
    const limit = req.query.limit;
    const rows = await analyticsSvc.getSellerPerformanceAnalytics(days, limit);
    res.json({ sellers: rows });
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminAnalyticsUx(req, res) {
  try {
    const days = req.query.days;
    const data = await analyticsSvc.getRfqUxAnalytics(days);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminOpsReplayEscalation(req, res) {
  try {
    const dispatchId = Number(req.params.dispatchId);
    const data = await opsSvc.opsReplayEscalation(dispatchId);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminOpsDispatchAppend(req, res) {
  try {
    const rfqRequestId = Number(req.params.rfqRequestId);
    const data = await opsSvc.opsAppendDispatchWave(rfqRequestId);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminOpsSpam(req, res) {
  try {
    const rfqRequestId = Number(req.params.rfqRequestId);
    await opsSvc.opsMarkSpam(rfqRequestId, req.body?.reason);
    res.json({ ok: true });
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminOpsClose(req, res) {
  try {
    const rfqRequestId = Number(req.params.rfqRequestId);
    await opsSvc.opsCloseRfq(rfqRequestId, req.body?.reason);
    res.json({ ok: true });
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqAdminOpsSellerActivity(req, res) {
  try {
    const shopId = Number(req.params.shopId);
    const days = req.query.days;
    const data = await opsSvc.opsSellerActivity(shopId, days);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}
