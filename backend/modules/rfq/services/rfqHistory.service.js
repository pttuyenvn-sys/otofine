import { rfqFlags, rfqHistorySessionTtlDays } from "../../../config/rfq.config.js";
import * as otpRepo from "../repositories/rfqHistoryOtp.repository.js";
import * as sessionRepo from "../repositories/rfqHistorySession.repository.js";
import * as reqRepo from "../repositories/rfqRequest.repository.js";
import * as profileRepo from "../repositories/customerProfile.repository.js";
import {
  generateHistoryToken,
  hashHistoryToken,
  hashOtpCode,
  sha256Hex,
  generateViewerToken,
  hashViewerToken,
} from "../utils/tokenHash.js";
import {
  normalizePhoneVN,
  isValidVietnamMobileE164,
} from "../utils/rfqCreateValidation.js";
import { formatRfqOtpSmsBody } from "../utils/rfqOtpSms.js";
import { getRfqForViewer } from "./rfqPublic.service.js";
import { buildBuyerEngagementPayload } from "../utils/rfqBuyerEngagement.js";
import { rfqLog } from "../utils/rfqLogger.js";

function randomOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskPhoneE164(phoneE164) {
  const p = String(phoneE164 || "");
  if (p.length < 8) return p;
  return `${p.slice(0, 4)}***${p.slice(-3)}`;
}

function parseJsonField(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function firstImageUrl(imagesJson) {
  const imgs = parseJsonField(imagesJson, []);
  if (!Array.isArray(imgs) || !imgs.length) return null;
  const u = String(imgs[0] || "").trim();
  return u || null;
}

function buildLatestMessagePreview(msgRow) {
  if (!msgRow) return null;
  const who = msgRow.sender_type === "shop" ? "Shop" : "Bạn";
  if (msgRow.message_type === "quote") return { who: "Shop", text: "Đã gửi báo giá" };
  if (msgRow.message_type === "image") return { who, text: "Ảnh đính kèm" };
  const text = String(msgRow.message_text || "").trim();
  if (!text) return null;
  return { who, text: text.length > 120 ? `${text.slice(0, 117)}…` : text };
}

function mapHistoryListItem(row, extras = {}) {
  const vehicle = parseJsonField(row.vehicle_json, null);
  const engagement = buildBuyerEngagementPayload(row, {
    dispatchCount: Number(row.shop_count || 0),
    quoteCount: Number(row.quote_count || 0),
  });

  return {
    publicId: row.public_id,
    status: row.status,
    buyerPhase: engagement.buyerPhase,
    vehicle,
    partDescription: row.part_description,
    image: firstImageUrl(row.images_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestMessageAt: row.latest_message_at || row.updated_at || row.created_at,
    latestMessagePreview: buildLatestMessagePreview(extras.latestMsg),
    shopCount: Number(row.shop_count || 0),
    quoteCount: Number(row.quote_count || 0),
    unreadCount: Number(extras.unreadCount || 0),
    expiresAt: row.expires_at,
  };
}

export async function requestHistoryOtp(body) {
  const phoneE164 = normalizePhoneVN(body?.phone);
  if (!phoneE164 || !isValidVietnamMobileE164(phoneE164)) {
    throw Object.assign(new Error("INVALID_PHONE"), { status: 400 });
  }

  const phoneHash = sha256Hex(phoneE164);
  const code = randomOtp6();
  const otpHash = hashOtpCode(code, phoneE164);
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

  await otpRepo.upsertChallenge(null, {
    phone_e164: phoneE164,
    phone_hash: phoneHash,
    otp_code_hash: otpHash,
    otp_expires_at: otpExpires,
  });

  rfqLog.info("rfq.history.otp_requested", {
    phone_masked: maskPhoneE164(phoneE164),
  });

  console.info(`[RFQ History] OTP for ${phoneE164}: ${code}`);
  console.info(`[RFQ History] OTP SMS preview:\n${formatRfqOtpSmsBody(code)}`);

  const out = {
    ok: true,
    phoneMasked: maskPhoneE164(phoneE164),
    otpExpiresAt: otpExpires.toISOString(),
  };

  if (rfqFlags.RFQ_OTP_DEV_RETURN) {
    out.devOtpCode = code;
  }

  return out;
}

export async function verifyHistoryOtp(body) {
  const phoneE164 = normalizePhoneVN(body?.phone);
  const code = String(body?.otp || body?.code || "").trim();

  if (!phoneE164 || !isValidVietnamMobileE164(phoneE164) || code.length < 4) {
    throw Object.assign(new Error("INVALID_INPUT"), { status: 400 });
  }

  const phoneHash = sha256Hex(phoneE164);
  const challenge = await otpRepo.findChallengeByPhoneHash(phoneHash);
  if (!challenge) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  if (!challenge.otp_expires_at || new Date(challenge.otp_expires_at) < new Date()) {
    throw Object.assign(new Error("OTP_EXPIRED"), { status: 400 });
  }

  if ((challenge.otp_attempts ?? 0) >= 8) {
    throw Object.assign(new Error("OTP_LOCKED"), { status: 429 });
  }

  const expected = hashOtpCode(code, phoneE164);
  if (expected !== challenge.otp_code_hash) {
    await otpRepo.bumpChallengeAttempt(null, challenge.id);
    throw Object.assign(new Error("OTP_WRONG"), { status: 400 });
  }

  await profileRepo.upsertVerifiedProfile(null, {
    phoneE164,
    phoneHash,
  });

  const rawToken = generateHistoryToken();
  const tokenHash = hashHistoryToken(rawToken);
  const expiresAt = new Date(Date.now() + rfqHistorySessionTtlDays() * 24 * 3600 * 1000);

  await sessionRepo.insertSession(null, {
    phone_e164: phoneE164,
    phone_hash: phoneHash,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  await otpRepo.deleteChallengeByPhoneHash(null, phoneHash);

  const rows = await reqRepo.listBuyerHistoryByPhoneHash(phoneHash, { limit: 1 });
  const rfqCount = await reqRepo.countBuyerHistoryByPhoneHash(phoneHash);

  rfqLog.info("rfq.history.otp_verified", {
    phone_masked: maskPhoneE164(phoneE164),
    rfq_count_hint: rows.length,
  });

  return {
    historyToken: rawToken,
    expiresAt: expiresAt.toISOString(),
    phoneMasked: maskPhoneE164(phoneE164),
    buyerSummary: {
      rfqCount,
    },
  };
}

export async function listHistoryRequests(session) {
  const rows = await reqRepo.listBuyerHistoryByPhoneHash(session.phone_hash, { limit: 50 });
  const ids = rows.map((r) => r.id);
  const latestMap = await reqRepo.latestMessagesForRequestIds(ids);
  const unreadMap = await reqRepo.countUnreadByRequestIds(ids);

  const items = rows.map((row) =>
    mapHistoryListItem(row, {
      latestMsg: latestMap.get(Number(row.id)),
      unreadCount: unreadMap.get(Number(row.id)) || 0,
    }),
  );

  return {
    items,
    total: items.length,
    phoneMasked: maskPhoneE164(session.phone_e164),
    expiresAt: session.expires_at,
    summary: buildHistorySummaryFromItems(items),
  };
}

function buildHistorySummaryFromItems(items) {
  let totalUnread = 0;
  let latestActivityAt = null;
  for (const item of items) {
    totalUnread += Number(item.unreadCount || 0);
    const act = item.latestMessageAt || item.updatedAt;
    if (act && (!latestActivityAt || new Date(act) > new Date(latestActivityAt))) {
      latestActivityAt = act;
    }
  }
  const recentMs = latestActivityAt ? Date.now() - new Date(latestActivityAt).getTime() : null;
  return {
    rfqCount: items.length,
    totalUnread,
    latestActivityAt,
    hasRecentActivity: recentMs != null && recentMs < 7 * 24 * 3600 * 1000,
  };
}

/** Lightweight counts for entry-point badges (no full list payload). */
export async function getHistorySummary(session) {
  const rows = await reqRepo.listBuyerHistoryByPhoneHash(session.phone_hash, { limit: 50 });
  const ids = rows.map((r) => r.id);
  const unreadMap = await reqRepo.countUnreadByRequestIds(ids);

  let totalUnread = 0;
  let latestActivityAt = null;
  for (const row of rows) {
    totalUnread += unreadMap.get(Number(row.id)) || 0;
    const act = row.latest_message_at || row.updated_at || row.created_at;
    if (act && (!latestActivityAt || new Date(act) > new Date(latestActivityAt))) {
      latestActivityAt = act;
    }
  }

  const recentMs = latestActivityAt ? Date.now() - new Date(latestActivityAt).getTime() : null;

  return {
    rfqCount: rows.length,
    totalUnread,
    latestActivityAt,
    hasRecentActivity: recentMs != null && recentMs < 7 * 24 * 3600 * 1000,
    phoneMasked: maskPhoneE164(session.phone_e164),
    expiresAt: session.expires_at,
  };
}

export async function getHistoryRequestDetail(session, publicId) {
  const row = await reqRepo.findByPublicIdAndPhoneHash(publicId, session.phone_hash);
  if (!row) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
  if (row.status === "pending_otp") throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  const detail = await getRfqForViewer(row);
  const unreadCount = await reqRepo.countUnreadForBuyerRequest(row.id);
  const latestMap = await reqRepo.latestMessagesForRequestIds([row.id]);
  const latestMsg = latestMap.get(Number(row.id));

  return {
    ...detail,
    unreadCount,
    latestMessageAt: latestMsg?.created_at || row.updated_at || row.created_at,
    latestMessagePreview: buildLatestMessagePreview(latestMsg),
  };
}

/**
 * Mint a fresh per-RFQ viewer token for reopen (invalidates previous viewer token for that RFQ).
 */
export async function openHistoryRequest(session, publicId) {
  const row = await reqRepo.findByPublicIdAndPhoneHash(publicId, session.phone_hash);
  if (!row) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
  if (["pending_otp", "closed", "expired", "cancelled"].includes(row.status)) {
    throw Object.assign(new Error("INVALID_STATE"), { status: 400 });
  }

  const rawViewer = generateViewerToken();
  const viewerHash = hashViewerToken(rawViewer);
  await reqRepo.rotateViewerTokenHash(null, row.id, viewerHash);

  rfqLog.info("rfq.history.viewer_token_issued", {
    public_id: row.public_id,
    rfq_request_id: row.id,
  });

  rfqLog.info("rfq.history.reopened", {
    public_id: row.public_id,
    rfq_request_id: row.id,
  });

  return {
    viewerToken: rawViewer,
    publicId: row.public_id,
    rfqRequestId: row.id,
  };
}

export async function logoutHistorySession(tokenHash) {
  await sessionRepo.deleteSessionByTokenHash(tokenHash);
  return { ok: true };
}
