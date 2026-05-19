import { pool } from "../../../config/db.js";
import { rfqDedupeWindowHours, rfqFlags } from "../../../config/rfq.config.js";
import * as profileRepo from "../repositories/customerProfile.repository.js";
import * as vehicleRepo from "../repositories/customerVehicle.repository.js";
import * as reqRepo from "../repositories/rfqRequest.repository.js";
import { generateViewerToken, hashViewerToken, hashOtpCode, sha256Hex } from "../utils/tokenHash.js";
import { buildDedupeFingerprint } from "../utils/rfqFingerprint.js";
import { rfqLog } from "../utils/rfqLogger.js";
import * as audit from "./rfqAudit.service.js";
import { rfqCounterInc } from "./rfqObservability.service.js";
import { generatePublicId, runDispatchForOpenRequest } from "./rfqDispatch.service.js";
import { scheduleInitialAutoWaveJob } from "./rfqAutoWave.schedule.js";
import {
  normalizePhoneVN,
  validateRfqCreateBody,
} from "../utils/rfqCreateValidation.js";

function randomOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function mergeImageLists(existingJson, incomingUrls) {
  let prev = [];
  try {
    prev =
      typeof existingJson === "string"
        ? JSON.parse(existingJson)
        : Array.isArray(existingJson)
          ? existingJson
          : [];
  } catch {
    prev = [];
  }
  const incoming = Array.isArray(incomingUrls) ? incomingUrls : [];
  const seen = new Set();
  const out = [];
  for (const u of [...prev, ...incoming]) {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function createRfqDraft(body) {
  const validated = validateRfqCreateBody(body || {});
  if (!validated.ok) {
    throw Object.assign(new Error(validated.code), { status: 400 });
  }

  const { phoneE164, partDescription, vehicle, imageUrls } = validated;

  const fp = buildDedupeFingerprint({
    phoneE164,
    vehicle,
    partDescription,
  });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const dup = await reqRepo.lockRecentByFingerprint(conn, fp, rfqDedupeWindowHours);

    if (dup) {
      if (dup.status === "pending_otp") {
        const code = randomOtp6();
        const otpHash = hashOtpCode(code, phoneE164);
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        const mergedImages = mergeImageLists(dup.images_json, imageUrls);

        await reqRepo.mergePendingOtp(conn, dup.id, {
          part_description_append: partDescription,
          vehicle_json: vehicle,
          images_json: mergedImages,
          otp_code_hash: otpHash,
          otp_expires_at: otpExpires,
          category_key: body.categoryKey ?? null,
          location_json: body.location ?? null,
        });

        await audit.audit(conn, {
          rfq_request_id: dup.id,
          from_status: "pending_otp",
          to_status: "pending_otp",
          actor_type: "customer",
          metadata_json: {
            dedupeSoftMerge: true,
            fingerprintPrefix: fp.slice(0, 12),
          },
        });

        await conn.commit();

        rfqLog.info("rfq.request.dedupe_merged", {
          rfq_request_id: dup.id,
          fingerprint_prefix: fp.slice(0, 12),
        });

        const out = {
          publicId: dup.public_id,
          otpExpiresAt: otpExpires.toISOString(),
          dedupeMerged: true,
        };

        if (rfqFlags.RFQ_OTP_DEV_RETURN) {
          out.devOtpCode = code;
        }

        console.info(`[RFQ] OTP merge ${phoneE164} (publicId=${dup.public_id}): ${code}`);
        return out;
      }

      if (["open", "dispatching", "quoted"].includes(dup.status)) {
        throw Object.assign(new Error("DEDUPE_COOLDOWN"), {
          status: 429,
          existingPublicId: dup.public_id,
        });
      }
    }

    const publicId = generatePublicId();
    const guestPhoneHash = sha256Hex(phoneE164);
    const code = randomOtp6();
    const otpHash = hashOtpCode(code, phoneE164);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    const rfqExpires = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const rid = await reqRepo.insertRequest(conn, {
      public_id: publicId,
      status: "pending_otp",
      guest_phone_e164: phoneE164,
      guest_phone_hash: guestPhoneHash,
      dedupe_fingerprint: fp,
      otp_code_hash: otpHash,
      otp_expires_at: otpExpires,
      vehicle_json: vehicle,
      part_description: partDescription,
      category_key: body.categoryKey ?? null,
      location_json: body.location ?? null,
      images_json: imageUrls,
      expires_at: rfqExpires,
    });

    await audit.audit(conn, {
      rfq_request_id: rid,
      from_status: null,
      to_status: "pending_otp",
      actor_type: "customer",
      metadata_json: { publicId, fingerprintPrefix: fp.slice(0, 12) },
    });

    await conn.commit();

    rfqLog.metric("rfq.request.created", {
      rfq_request_id: rid,
      fingerprint_prefix: fp.slice(0, 12),
    });
    rfqCounterInc("rfq_created");

    const out = {
      publicId,
      otpExpiresAt: otpExpires.toISOString(),
    };

    if (rfqFlags.RFQ_OTP_DEV_RETURN) {
      out.devOtpCode = code;
    }

    console.info(`[RFQ] OTP for ${phoneE164} (publicId=${publicId}): ${code}`);

    return out;
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    throw e;
  } finally {
    if (conn) conn.release();
  }
}

export async function verifyOtp(body) {
  const phoneE164 = normalizePhoneVN(body.phone);
  const publicId = String(body.publicId || "").trim();
  const code = String(body.code || "").trim();
  if (!phoneE164 || !publicId || code.length < 4)
    throw Object.assign(new Error("INVALID_INPUT"), { status: 400 });

  let conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[locked]] = await conn.query(
      `SELECT * FROM rfq_requests WHERE public_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [publicId],
    );

    if (!locked) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    if (locked.status !== "pending_otp") throw Object.assign(new Error("INVALID_STATE"), { status: 400 });
    if (locked.guest_phone_e164 !== phoneE164)
      throw Object.assign(new Error("PHONE_MISMATCH"), { status: 400 });

    if (!locked.otp_expires_at || new Date(locked.otp_expires_at) < new Date())
      throw Object.assign(new Error("OTP_EXPIRED"), { status: 400 });

    if ((locked.otp_attempts ?? 0) >= 8) throw Object.assign(new Error("OTP_LOCKED"), { status: 429 });

    const expected = hashOtpCode(code, phoneE164);
    if (expected !== locked.otp_code_hash) {
      await conn.rollback();
      await reqRepo.bumpOtpAttempt(null, locked.id);
      throw Object.assign(new Error("OTP_WRONG"), { status: 400 });
    }

    const rawViewer = generateViewerToken();
    const viewerHash = hashViewerToken(rawViewer);

    const phoneHash = sha256Hex(phoneE164);
    const profileId = await profileRepo.upsertVerifiedProfile(conn, {
      phoneE164,
      phoneHash,
    });

    if (locked.vehicle_json) {
      try {
        const v =
          typeof locked.vehicle_json === "string"
            ? JSON.parse(locked.vehicle_json)
            : locked.vehicle_json;
        await vehicleRepo.insertVehicle(conn, { customerProfileId: profileId, vehicle: v });
      } catch {
        /* ignore malformed vehicle */
      }
    }

    await reqRepo.verifyAndOpen(conn, locked.id, {
      viewerTokenHash: viewerHash,
      customerProfileId: profileId,
    });

    await audit.audit(conn, {
      rfq_request_id: locked.id,
      from_status: "pending_otp",
      to_status: "open",
      actor_type: "customer",
      metadata_json: { profileId },
    });

    await conn.commit();

    const payload = {
      viewerToken: rawViewer,
      publicId,
      rfqRequestId: locked.id,
    };

    try {
      await runDispatchForOpenRequest(locked.id);
    } catch (err) {
      console.error("[RFQ] dispatch failed post-verify:", err?.message || err, {
        rfq_request_id: locked.id,
      });
    }

    try {
      await scheduleInitialAutoWaveJob(locked.id);
    } catch (err) {
      console.error("[RFQ] auto-wave schedule failed:", err?.message || err);
    }

    return payload;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    conn.release();
  }
}

export async function getRfqForViewer(rfqRow) {
  const quoteRepo = await import("../repositories/rfqQuote.repository.js");
  const quotes = await quoteRepo.listQuotesForRequest(rfqRow.id);
  let vehicle = rfqRow.vehicle_json;
  try {
    vehicle = typeof vehicle === "string" ? JSON.parse(vehicle) : vehicle;
  } catch {
    vehicle = null;
  }
  let images = rfqRow.images_json;
  try {
    images = typeof images === "string" ? JSON.parse(images) : images;
  } catch {
    images = [];
  }

  return {
    publicId: rfqRow.public_id,
    status: rfqRow.status,
    partDescription: rfqRow.part_description,
    vehicle,
    images,
    quotes: quotes.map((q) => ({
      id: q.id,
      dispatchId: q.dispatch_id,
      shopId: q.shop_id,
      shopName: q.shop_name,
      priceAmount: Number(q.price_amount),
      currency: q.currency,
      note: q.note,
      lineType: q.line_type || "unknown",
      submittedAt: q.submitted_at,
    })),
    expiresAt: rfqRow.expires_at,
  };
}
