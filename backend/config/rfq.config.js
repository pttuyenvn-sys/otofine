/**
 * RFQ module configuration — env-driven, defaults OFF for production safety.
 */
import dotenv from "dotenv";

dotenv.config({ quiet: true });

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

export const rfqFlags = {
  /** Master switch: RFQ routes return 404 when false */
  RFQ_MODULE_ENABLED: envBool("RFQ_MODULE_ENABLED", false),
  RFQ_ZALO_ESCALATION_ENABLED: envBool("RFQ_ZALO_ESCALATION_ENABLED", false),
  RFQ_SMS_ESCALATION_ENABLED: envBool("RFQ_SMS_ESCALATION_ENABLED", false),
  /** Return OTP in API response (staging only) */
  RFQ_OTP_DEV_RETURN: envBool("RFQ_OTP_DEV_RETURN", false),
  /** Delayed RFQ dispatch waves (worker jobs/rfqAutoWave.worker.js) */
  RFQ_AUTO_WAVE_ENABLED: envBool("RFQ_AUTO_WAVE_ENABLED", false),
};

/** OTP pepper — required when module enabled + OTP verify */
export function rfqOtpSecret() {
  return String(process.env.RFQ_OTP_SECRET || process.env.JWT_SECRET || "");
}

/** Viewer token entropy uses RFQ_VIEWER_SECRET || JWT_SECRET */
export function rfqViewerSecret() {
  return process.env.RFQ_VIEWER_SECRET || process.env.JWT_SECRET || "";
}

export const rfqLimits = {
  createPerIpPerHour: Number(process.env.RFQ_RL_CREATE_IP_HOUR || 30),
  otpVerifyPerIpPerHour: Number(process.env.RFQ_RL_OTP_IP_HOUR || 60),
  shopInboxPerShopPerMinute: Number(process.env.RFQ_RL_SHOP_INBOX_MIN || 120),
  /** GET /api/rfq/by-token per IP per minute */
  viewerByTokenPerIpMinute: Number(process.env.RFQ_RL_VIEWER_TOKEN_IP_MIN || 90),
  shopQuotePerShopPerMinute: Number(process.env.RFQ_RL_SHOP_QUOTE_MIN || 40),
  /** POST conversation text — buyer */
  conversationBuyerSendPerMinute: Number(process.env.RFQ_RL_CONV_BUYER_SEND_MIN || 30),
  /** POST conversation text — shop */
  conversationShopSendPerMinute: Number(process.env.RFQ_RL_CONV_SHOP_SEND_MIN || 60),
  /** GET messages / read / conversation meta per participant */
  conversationReadPerParticipantMinute: Number(
    process.env.RFQ_RL_CONV_READ_MIN || 120,
  ),
  /** GET unread-summary (buyer) */
  conversationUnreadSummaryPerBuyerMinute: Number(
    process.env.RFQ_RL_CONV_UNREAD_SUM_MIN || 60,
  ),
};

/** Dedup window for phone+vehicle+keyword fingerprint (hours) */
export const rfqDedupeWindowHours = Number(process.env.RFQ_DEDUPE_WINDOW_HOURS || 24);

/** Guest upload max bytes (multer + controller second check) */
export const rfqUploadMaxBytes = Number(process.env.RFQ_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);

/**
 * Guest RFQ images — server-side sharp pipeline (see utils/rfqImageProcess.js).
 * Defaults target ~200–600KB JPEGs after mobile camera uploads; tune via env on staging.
 */
export const rfqImageLimits = {
  /** Long-edge cap via width + fit:inside (portrait height scales down proportionally). */
  maxWidth: Number(process.env.RFQ_IMG_MAX_WIDTH || 1600),
  /** Legacy env; height is not a separate resize bound (width + aspect ratio only). */
  maxHeight: Number(process.env.RFQ_IMG_MAX_HEIGHT || 1600),
  /** Reject decoded bitmaps above this megapixel count (DoS guard). */
  maxMegapixels: Number(process.env.RFQ_IMG_MAX_MEGAPIXELS || 24),
  /** mozjpeg output — API still returns .jpg URLs; do not switch to WebP without contract change. */
  jpegQuality: Math.min(
    100,
    Math.max(50, Number(process.env.RFQ_IMG_JPEG_QUALITY || 78)),
  ),
};

/** Debounce window for updating shops.last_seen_at via RFQ seller routes */
export const rfqTouchDebounceMinutes = Math.max(1, Number(process.env.RFQ_TOUCH_DEBOUNCE_MINUTES || 2));

/** Closed Beta — dispatch / matching tuning (all env-driven, no magic numbers in services). */
export const rfqDispatchTuning = {
  /** Shops contacted per dispatch wave (historically “wave size”). */
  wave1ShopCap: Math.max(1, Number(process.env.RFQ_DISPATCH_MAX_SHOPS || 10)),
  /** Hard cap total dispatch rows per RFQ (matching breadth limit). */
  maxDispatchesPerRfq: Math.max(1, Number(process.env.RFQ_DISPATCH_MAX_PER_RFQ || 40)),
  /** Seller SLA hint stored on dispatch.respond_by */
  respondByHours: Math.max(1, Number(process.env.RFQ_DISPATCH_RESPOND_BY_HOURS || 48)),
  /** Boost shops seen recently on Otofine (minutes lookback). */
  onlineRecentMinutes: Math.max(1, Number(process.env.RFQ_ONLINE_RECENT_MINUTES || 15)),
};

/** Back-compat alias — prefer rfqDispatchTuning.wave1ShopCap */
export const rfqDispatchDefaults = {
  maxShopsWave1: rfqDispatchTuning.wave1ShopCap,
};

/**
 * T1 “online-first” grace before Zalo escalation (minutes).
 * If > 0, overrides delay computed from RFQ_ZALO_ESCALATION_DELAY_SEC for enqueue scheduling only.
 */
export function rfqT1OnlineTimeoutMinutes() {
  const m = Number(process.env.RFQ_T1_ONLINE_TIMEOUT_MINUTES || 0);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

/** Minutes before first auto-wave follow-up job runs (round_sequence ≥ 2). */
export function rfqAutoWaveDelayMinutes() {
  return Math.max(1, Number(process.env.RFQ_AUTO_WAVE_DELAY_MINUTES || 10));
}

/**
 * How many delayed auto-wave rounds after open (not counting wave‑1 at verify).
 * 1 = one follow-up job; 2 = two follow-up jobs, etc.
 */
export function rfqAutoWaveExtraRounds() {
  return Math.max(0, Math.min(5, Number(process.env.RFQ_AUTO_WAVE_EXTRA_ROUNDS ?? 1)));
}
