import * as shopSvc from "../services/rfqShop.service.js";
import { sendHttpError } from "../utils/httpError.js";

export async function rfqShopInbox(req, res) {
  try {
    const shopId = req.shop.id;
    const data = await shopSvc.listInbox(shopId, req.query);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqShopInboxSummary(req, res) {
  try {
    const shopId = req.shop.id;
    const data = await shopSvc.inboxSummary(shopId);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqShopDetail(req, res) {
  try {
    const shopId = req.shop.id;
    const dispatchId = Number(req.params.dispatchId);
    if (!Number.isFinite(dispatchId))
      throw Object.assign(new Error("INVALID_INPUT"), { status: 400 });
    const data = await shopSvc.getDispatchDetail(dispatchId, shopId);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqShopMarkView(req, res) {
  try {
    const shopId = req.shop.id;
    const dispatchId = Number(req.params.dispatchId);
    if (!Number.isFinite(dispatchId))
      throw Object.assign(new Error("INVALID_INPUT"), { status: 400 });
    const data = await shopSvc.markDispatchViewed(dispatchId, shopId);
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqShopQuote(req, res) {
  try {
    const shopId = req.shop.id;
    const dispatchId = Number(req.params.dispatchId);
    if (!Number.isFinite(dispatchId))
      throw Object.assign(new Error("INVALID_INPUT"), { status: 400 });
    const result = await shopSvc.submitQuote(dispatchId, shopId, req.body || {});
    res.status(result.idempotent ? 200 : 201).json(result);
  } catch (e) {
    sendHttpError(res, e);
  }
}
