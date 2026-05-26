/**
 * Zalo Official Account API client — native transport (no webhook bridge).
 * CS consultation messages: POST /v3.0/oa/message/cs
 * ZNS (optional): POST https://business.openapi.zalo.me/message/template
 */
import { rfqLog } from "../modules/rfq/utils/rfqLogger.js";
import {
  SHOP_ZALO_CTA_TITLE,
  buildZaloShopCta,
} from "../modules/rfq/utils/rfqZaloEscalationPayload.js";

const OA_API_BASE = "https://openapi.zalo.me";
const ZNS_API_BASE = "https://business.openapi.zalo.me";
const OAUTH_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";

/** @type {{ accessToken: string | null, refreshToken: string | null, expiresAtMs: number }} */
const tokenCache = {
  accessToken: null,
  refreshToken: null,
  expiresAtMs: 0,
};

function envTrim(name) {
  return String(process.env[name] || "").trim();
}

function requestTimeoutMs() {
  return Math.min(30000, Math.max(3000, Number(process.env.RFQ_ZALO_OA_TIMEOUT_MS || 12000)));
}

function isTokenErrorCode(code) {
  const n = Number(code);
  return n === -124 || n === -216 || n === 124 || n === 216;
}

function maskToken(token) {
  const t = String(token || "");
  if (t.length <= 8) return "***";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function logZalo(event, fields) {
  rfqLog.info(event, fields);
}

function logZaloWarn(event, fields) {
  rfqLog.warn(event, fields);
}

/**
 * OA follower user_id is typically 15–20 digits.
 * Vietnamese mobile numbers are 9–10 digits (after normalization).
 */
export function isLikelyOaUserId(value) {
  const s = String(value || "").trim();
  return /^\d{15,20}$/.test(s);
}

/** shops.zalo column is present and non-empty (any value). */
export function hasShopZaloField(value) {
  return String(value || "").trim().length > 0;
}

/**
 * Normalize VN mobile to 84XXXXXXXXX (no + prefix).
 * Returns null when input cannot be parsed.
 */
export function normalizeVietnamesePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("84")) {
    // already international
  } else if (digits.startsWith("0")) {
    digits = `84${digits.slice(1)}`;
  } else if (digits.length === 9) {
    digits = `84${digits}`;
  } else {
    return null;
  }

  if (digits.length < 11 || digits.length > 12) return null;
  return digits;
}

/**
 * Validate VN mobile before ZNS send.
 * Accepts 03x/05x/07x/08x/09x domestic or 84-prefixed international.
 */
export function validateVietnamesePhone(raw) {
  const normalized = normalizeVietnamesePhone(raw);
  if (!normalized) {
    return { ok: false, phone: null, reason: "empty_or_unparseable" };
  }

  if (!/^84(3|5|7|8|9)\d{8}$/.test(normalized)) {
    return { ok: false, phone: normalized, reason: "invalid_vn_mobile_prefix" };
  }

  return { ok: true, phone: normalized, reason: null };
}

/**
 * Production delivery plan — no getFollowers lookup (-224 package limit).
 *
 * 1. shops.zalo = OA user_id (15–20 digits) → oa_cs
 * 2. shops.zalo empty → zns via shops.phone + RFQ_ZALO_ZNS_TEMPLATE_ID
 * 3. shops.zalo set but not OA user_id → zns fallback (invalid zalo field)
 */
export function selectEscalationChannel({ shopZalo, shopPhone, znsTemplateId } = {}) {
  const zaloRaw = String(shopZalo || "").trim();
  const phoneFromShop = validateVietnamesePhone(shopPhone);
  const templateConfigured = Boolean(String(znsTemplateId || "").trim());

  if (hasShopZaloField(zaloRaw) && isLikelyOaUserId(zaloRaw)) {
    return {
      channel: "oa_cs",
      oaUserId: zaloRaw,
      phone: phoneFromShop.ok ? phoneFromShop.phone : null,
      selectionReason: "shops_zalo_oa_user_id",
      fallbackReason: null,
    };
  }

  if (hasShopZaloField(zaloRaw) && !isLikelyOaUserId(zaloRaw)) {
    if (templateConfigured && phoneFromShop.ok) {
      return {
        channel: "zns",
        oaUserId: null,
        phone: phoneFromShop.phone,
        selectionReason: "zns_phone_fallback",
        fallbackReason: "shops_zalo_not_oa_user_id",
      };
    }
    return {
      channel: null,
      oaUserId: null,
      phone: phoneFromShop.phone,
      selectionReason: "shops_zalo_invalid",
      fallbackReason: null,
      blockReason: templateConfigured ? "invalid_phone_for_zns" : "missing_zns_template_id",
    };
  }

  if (!templateConfigured) {
    return {
      channel: null,
      oaUserId: null,
      phone: phoneFromShop.phone,
      selectionReason: "no_shops_zalo",
      fallbackReason: null,
      blockReason: "missing_zns_template_id",
    };
  }

  if (!phoneFromShop.ok) {
    return {
      channel: null,
      oaUserId: null,
      phone: phoneFromShop.phone,
      selectionReason: "no_shops_zalo",
      fallbackReason: null,
      blockReason: phoneFromShop.reason || "missing_valid_phone",
    };
  }

  return {
    channel: "zns",
    oaUserId: null,
    phone: phoneFromShop.phone,
    selectionReason: "zns_phone_fallback",
    fallbackReason: "no_shops_zalo",
  };
}

/** @deprecated use selectEscalationChannel — kept for tests/back-compat */
export function resolveEscalationRecipient({ shopZalo, shopPhone } = {}) {
  const plan = selectEscalationChannel({ shopZalo, shopPhone, znsTemplateId: "configured" });
  return {
    oaUserId: plan.oaUserId,
    phone: plan.phone,
  };
}

export function buildEscalationMessageText({ shopName, snippet, respondBy, actionUrl } = {}) {
  const lines = [];
  const name = String(shopName || "Shop").trim() || "Shop";
  lines.push(`${name} — có khách hỏi giá phụ tùng trên Otofine.`);
  const part = String(snippet || "").trim();
  if (part) lines.push(`Chi tiết: ${part.slice(0, 240)}`);
  if (respondBy) {
    try {
      const d = new Date(respondBy);
      if (!Number.isNaN(d.getTime())) {
        lines.push(`Hạn phản hồi: ${d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`);
      }
    } catch {
      /* ignore */
    }
  }
  if (actionUrl) {
    lines.push(`Bấm "${SHOP_ZALO_CTA_TITLE}" bên dưới để mở hội thoại.`);
  }
  return lines.join("\n");
}

export function buildCsMessagePayload({ text, cta }) {
  const message = { text: String(text || "").slice(0, 2000) };

  if (cta?.url) {
    message.attachment = {
      type: "template",
      payload: {
        buttons: [
          {
            title: String(cta.title || SHOP_ZALO_CTA_TITLE).slice(0, 100),
            type: "oa.open.url",
            payload: { url: cta.url },
          },
        ],
      },
    };
  }

  return {
    recipient: undefined,
    message,
  };
}

function hydrateTokenCacheFromEnv() {
  if (!tokenCache.accessToken) {
    tokenCache.accessToken = envTrim("ZALO_OA_ACCESS_TOKEN") || null;
  }
  if (!tokenCache.refreshToken) {
    tokenCache.refreshToken = envTrim("ZALO_OA_REFRESH_TOKEN") || null;
  }
}

export async function refreshOaAccessToken() {
  const appId = envTrim("ZALO_OA_APP_ID");
  const secret = envTrim("ZALO_OA_SECRET");
  hydrateTokenCacheFromEnv();
  const refreshToken = tokenCache.refreshToken;

  if (!appId || !secret || !refreshToken) {
    throw new Error("missing_zalo_oauth_config");
  }

  const body = new URLSearchParams({
    app_id: appId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  logZalo("zalo.oa.token.refresh_request", { app_id: appId });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: secret,
    },
    body,
    signal: AbortSignal.timeout(requestTimeoutMs()),
  });

  const json = await res.json().catch(() => ({}));

  logZalo("zalo.oa.token.refresh_response", {
    http_status: res.status,
    error: json?.error ?? null,
    message: json?.message ?? null,
    expires_in: json?.expires_in ?? null,
  });

  if (!res.ok || (json?.error != null && Number(json.error) !== 0) || !json.access_token) {
    const err = new Error(json?.message || `oauth_http_${res.status}`);
    err.responseBody = json;
    err.httpStatus = res.status;
    throw err;
  }

  if (json.access_token) {
    tokenCache.accessToken = json.access_token;
    process.env.ZALO_OA_ACCESS_TOKEN = json.access_token;
  }
  if (json.refresh_token) {
    tokenCache.refreshToken = json.refresh_token;
    process.env.ZALO_OA_REFRESH_TOKEN = json.refresh_token;
  }
  const ttlSec = Number(json.expires_in || 3600);
  tokenCache.expiresAtMs = Date.now() + Math.max(60, ttlSec - 120) * 1000;

  return tokenCache.accessToken;
}

export async function getOaAccessToken({ forceRefresh = false } = {}) {
  hydrateTokenCacheFromEnv();

  if (!forceRefresh && tokenCache.accessToken && Date.now() < tokenCache.expiresAtMs) {
    return tokenCache.accessToken;
  }

  if (!forceRefresh && tokenCache.accessToken) {
    return tokenCache.accessToken;
  }

  if (tokenCache.refreshToken) {
    return refreshOaAccessToken();
  }

  const staticToken = envTrim("ZALO_OA_ACCESS_TOKEN");
  if (!staticToken) {
    throw new Error("missing_ZALO_OA_ACCESS_TOKEN");
  }
  return staticToken;
}

async function zaloOaPost(path, body, { retried = false } = {}) {
  const accessToken = await getOaAccessToken();
  const url = `${OA_API_BASE}${path}`;

  logZalo("zalo.oa.request", {
    method: "POST",
    path,
    access_token: maskToken(accessToken),
    body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      access_token: accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(requestTimeoutMs()),
  });

  const json = await res.json().catch(() => ({}));
  const errorCode = json?.error != null ? Number(json.error) : null;

  logZalo("zalo.oa.response", {
    path,
    http_status: res.status,
    error: errorCode,
    message: json?.message ?? null,
    message_id: json?.data?.message_id ?? null,
    body: json,
  });

  if (!retried && isTokenErrorCode(errorCode)) {
    await refreshOaAccessToken();
    return zaloOaPost(path, body, { retried: true });
  }

  return {
    httpStatus: res.status,
    body: json,
    ok: Number(json?.error) === 0,
    errorCode,
  };
}

async function zaloZnsPost(path, body, { retried = false } = {}) {
  const accessToken = await getOaAccessToken();
  const url = `${ZNS_API_BASE}${path}`;

  logZalo("zalo.zns.request", {
    method: "POST",
    path,
    access_token: maskToken(accessToken),
    body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      access_token: accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(requestTimeoutMs()),
  });

  const json = await res.json().catch(() => ({}));
  const errorCode = json?.error != null ? Number(json.error) : null;

  logZalo("zalo.zns.response", {
    path,
    http_status: res.status,
    error: errorCode,
    message: json?.message ?? null,
    msg_id: json?.data?.msg_id ?? json?.data?.message_id ?? null,
    body: json,
  });

  if (!retried && isTokenErrorCode(errorCode)) {
    await refreshOaAccessToken();
    return zaloZnsPost(path, body, { retried: true });
  }

  return {
    httpStatus: res.status,
    body: json,
    ok: Number(json?.error) === 0,
    errorCode,
  };
}

/**
 * Send OA consultation (CS) message — text + optional CTA button.
 */
export async function sendOaCsMessage({ userId, text, cta }) {
  const uid = String(userId || "").trim();
  if (!uid) {
    return { ok: false, reason: "missing_oa_user_id", errorBody: null, messageId: null, channel: "oa_cs" };
  }

  const csPayload = buildCsMessagePayload({ text, cta });
  csPayload.recipient = { user_id: uid };

  const result = await zaloOaPost("/v3.0/oa/message/cs", csPayload);

  if (result.ok) {
    return {
      ok: true,
      messageId: result.body?.data?.message_id ?? null,
      errorBody: null,
      reason: null,
      channel: "oa_cs",
      httpStatus: result.httpStatus,
      selectionReason: null,
      fallbackReason: null,
    };
  }

  return {
    ok: false,
    reason: `oa_cs_${result.errorCode ?? result.httpStatus}`,
    messageId: null,
    errorBody: result.body,
    channel: "oa_cs",
    httpStatus: result.httpStatus,
    selectionReason: null,
    fallbackReason: null,
  };
}

async function tryZnsEscalation(payload, cta, phone, { templateId, fallbackReason, selectionReason }) {
  const phoneCheck = validateVietnamesePhone(phone);
  if (!phoneCheck.ok) {
    return {
      ok: false,
      reason: phoneCheck.reason || "missing_valid_phone",
      errorBody: { phone: phoneCheck.phone, validation: phoneCheck.reason },
      messageId: null,
      channel: "zns",
      selectionReason,
      fallbackReason,
    };
  }

  const result = await sendZnsTemplateMessage({
    phone: phoneCheck.phone,
    templateId,
    templateData: buildZnsTemplateData(payload, cta),
    trackingId: `rfq-d${payload.dispatchId}`,
  });

  return {
    ...result,
    selectionReason,
    fallbackReason,
  };
}

/**
 * ZNS template message — phone must pass validateVietnamesePhone before call.
 */
export async function sendZnsTemplateMessage({ phone, templateId, templateData, trackingId }) {
  const phoneCheck = validateVietnamesePhone(phone);
  const tid = String(templateId || "").trim();

  if (!phoneCheck.ok) {
    return {
      ok: false,
      reason: phoneCheck.reason || "missing_valid_phone",
      errorBody: { validation: phoneCheck.reason },
      messageId: null,
      channel: "zns",
    };
  }

  if (!tid) {
    return {
      ok: false,
      reason: "missing_zns_template_id",
      errorBody: null,
      messageId: null,
      channel: "zns",
    };
  }

  const body = {
    phone: phoneCheck.phone,
    template_id: tid,
    template_data: templateData && typeof templateData === "object" ? templateData : {},
    tracking_id: String(trackingId || `rfq-${Date.now()}`).slice(0, 64),
  };

  const result = await zaloZnsPost("/message/template", body);

  if (result.ok) {
    return {
      ok: true,
      messageId: result.body?.data?.msg_id ?? result.body?.data?.message_id ?? null,
      errorBody: null,
      reason: null,
      channel: "zns",
      httpStatus: result.httpStatus,
    };
  }

  return {
    ok: false,
    reason: `zns_${result.errorCode ?? result.httpStatus}`,
    messageId: null,
    errorBody: result.body,
    channel: "zns",
    httpStatus: result.httpStatus,
  };
}

function buildZnsTemplateData(payload, cta) {
  const defaults = {
    shop_name: String(payload.shopName || "Shop").slice(0, 80),
    snippet: String(payload.snippet || "").slice(0, 240),
    action_url: cta?.url || "",
    dispatch_id: String(payload.dispatchId ?? ""),
  };

  const raw = envTrim("RFQ_ZALO_ZNS_TEMPLATE_DATA_JSON");
  if (!raw) return defaults;

  try {
    const extra = JSON.parse(raw);
    if (extra && typeof extra === "object") {
      return { ...defaults, ...extra };
    }
  } catch {
    logZaloWarn("zalo.zns.template_data_json_invalid", {});
  }
  return defaults;
}

/**
 * Main entry: RFQ shop escalation → OA CS (shops.zalo) or ZNS phone fallback.
 * No getFollowers API — relies on preconfigured shops.zalo user_id or shop phone.
 */
export async function sendShopRfqEscalation(payload = {}) {
  const appId = envTrim("ZALO_OA_APP_ID");
  const accessConfigured = Boolean(envTrim("ZALO_OA_ACCESS_TOKEN") || envTrim("ZALO_OA_REFRESH_TOKEN"));
  if (!appId || !accessConfigured) {
    logZaloWarn("zalo.oa.config_missing", { dispatch_id: payload.dispatchId });
    return { ok: false, reason: "missing_zalo_oa_config", errorBody: null, messageId: null, channel: null };
  }

  const cta = buildZaloShopCta({
    shopActionUrl: payload.shopActionUrl,
    dispatchId: payload.dispatchId,
  });

  const text = buildEscalationMessageText({
    shopName: payload.shopName,
    snippet: payload.snippet,
    respondBy: payload.respondBy,
    actionUrl: cta?.url,
  });

  const znsTemplateId = envTrim("RFQ_ZALO_ZNS_TEMPLATE_ID");
  const mode = envTrim("RFQ_ZALO_ESCALATION_MODE").toLowerCase() || "auto";

  const plan = selectEscalationChannel({
    shopZalo: payload.shopZalo,
    shopPhone: payload.shopPhone,
    znsTemplateId,
  });

  logZalo("zalo.escalation.channel_selected", {
    dispatch_id: payload.dispatchId,
    shop_id: payload.shopId,
    channel: plan.channel,
    selection_reason: plan.selectionReason,
    fallback_reason: plan.fallbackReason,
    has_shops_zalo: hasShopZaloField(payload.shopZalo),
    phone_present: Boolean(String(payload.shopPhone || "").trim()),
    zns_template_configured: Boolean(znsTemplateId),
    block_reason: plan.blockReason ?? null,
  });

  if (!plan.channel) {
    return {
      ok: false,
      reason: plan.blockReason || "missing_recipient",
      errorBody: {
        hint: plan.blockReason === "missing_zns_template_id"
          ? "Set RFQ_ZALO_ZNS_TEMPLATE_ID for phone fallback when shops.zalo is empty"
          : "Provide shops.zalo (OA user_id) or valid shops.phone for ZNS",
        selection_reason: plan.selectionReason,
      },
      messageId: null,
      channel: null,
      selectionReason: plan.selectionReason,
      fallbackReason: plan.fallbackReason,
    };
  }

  if (plan.channel === "zns" && mode === "oa_only") {
    return {
      ok: false,
      reason: "zns_blocked_by_mode",
      errorBody: { mode: "oa_only" },
      messageId: null,
      channel: "zns",
      selectionReason: plan.selectionReason,
      fallbackReason: plan.fallbackReason,
    };
  }

  if (plan.channel === "oa_cs" && mode !== "zns_only") {
    const oaResult = await sendOaCsMessage({
      userId: plan.oaUserId,
      text,
      cta,
    });

    if (oaResult.ok) {
      return {
        ...oaResult,
        selectionReason: plan.selectionReason,
        fallbackReason: plan.fallbackReason,
      };
    }

    logZaloWarn("zalo.oa.cs_failed", {
      dispatch_id: payload.dispatchId,
      shop_id: payload.shopId,
      reason: oaResult.reason,
      error: oaResult.errorBody,
    });

    if (znsTemplateId && plan.phone && mode !== "oa_only") {
      logZalo("zalo.escalation.fallback_to_zns", {
        dispatch_id: payload.dispatchId,
        shop_id: payload.shopId,
        fallback_reason: "oa_cs_send_failed",
        oa_error: oaResult.reason,
      });
      return tryZnsEscalation(payload, cta, plan.phone, {
        templateId: znsTemplateId,
        fallbackReason: "oa_cs_send_failed",
        selectionReason: "zns_phone_fallback",
      });
    }

    return {
      ...oaResult,
      selectionReason: plan.selectionReason,
      fallbackReason: plan.fallbackReason,
    };
  }

  if (plan.channel === "zns" && znsTemplateId) {
    return tryZnsEscalation(payload, cta, plan.phone, {
      templateId: znsTemplateId,
      fallbackReason: plan.fallbackReason,
      selectionReason: plan.selectionReason,
    });
  }

  return {
    ok: false,
    reason: "send_failed",
    errorBody: null,
    messageId: null,
    channel: plan.channel,
    selectionReason: plan.selectionReason,
    fallbackReason: plan.fallbackReason,
  };
}
