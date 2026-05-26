import * as pub from "../services/rfqPublic.service.js";
import * as uxTrack from "../services/rfqUxTracking.service.js";
import * as attrSvc from "../services/rfqReminderAttribution.service.js";
import * as reqRepo from "../repositories/rfqRequest.repository.js";
import { sendHttpError } from "../utils/httpError.js";
import { saveRfqImageBuffer } from "../utils/rfqImagePersist.js";
import { buildRfqImageUploadResponse } from "../utils/rfqImageUrls.js";
import { rfqLog } from "../utils/rfqLogger.js";

export async function rfqCreate(req, res) {
  try {
    const data = await pub.createRfqDraft(req.body || {});
    res.status(201).json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqVerifyOtp(req, res) {
  try {
    const data = await pub.verifyOtp(req.body || {});
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqGetByToken(req, res) {
  try {
    const payload = await pub.getRfqForViewer(req.rfqRequest);
    uxTrack.trackCustomerRfqOpen(req.rfqRequest.id, {
      quoteCount: payload.quotes?.length ?? 0,
      status: payload.status,
    });
    void attrSvc.tryAttributeReminderConversion(req.rfqRequest.id, "reopen", {
      source: "viewer_token",
    });
    if ((payload.quotes?.length ?? 0) > 0) {
      void attrSvc.tryAttributeReminderConversion(req.rfqRequest.id, "quote_view", {
        source: "viewer_token",
      });
    }
    res.json(payload);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function rfqUploadImage(req, res) {
  const publicId = String(req.body?.publicId || "").trim();
  try {
    rfqLog.info("rfq.upload.image_start", {
      public_id: publicId || null,
      has_file: Boolean(req.file?.buffer),
      mime: req.file?.mimetype ?? null,
      bytes: req.file?.size ?? null,
    });

    if (!publicId) throw Object.assign(new Error("MISSING_PUBLIC_ID"), { status: 400 });
    if (!req.file?.buffer) throw Object.assign(new Error("MISSING_FILE"), { status: 400 });

    const row = await reqRepo.findByPublicId(publicId);
    if (!row || row.status !== "pending_otp") {
      throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    }

    const saved = await saveRfqImageBuffer(req.file.buffer, {
      category: "request",
      requestType: "request",
      mime: req.file?.mimetype ?? null,
      input_bytes: req.file?.size ?? null,
      meta: { public_id: publicId },
    });
    const payload = buildRfqImageUploadResponse(saved);

    await reqRepo.appendImages(publicId, [payload.url]);

    rfqLog.info("rfq.upload.image_done", {
      public_id: publicId,
      url: payload.url,
      storage: saved.storage,
      has_thumbnails: Boolean(payload.thumbnails?.small || payload.thumbnails?.medium),
    });

    res.status(201).json(payload);
  } catch (e) {
    rfqLog.error("rfq.upload.image_failed", {
      public_id: publicId || null,
      code: String(e?.message || "INTERNAL"),
      status: e?.status ?? 500,
      err: String(e?.message || e),
    });
    sendHttpError(res, e);
  }
}
