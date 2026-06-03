/**
 * Derived shop health signals for admin operations (read-only, no DB writes).
 */

export const ATTENTION_FLAGS = Object.freeze([
  "inactive_30d",
  "no_products",
  "high_reject_ratio",
  "missing_contact",
  "storefront_suspended",
  "no_slug",
]);

/** Flags that alone qualify a shop for the attention segment. */
export const CRITICAL_ATTENTION_FLAGS = Object.freeze([
  "storefront_suspended",
  "no_products",
  "high_reject_ratio",
  "inactive_30d",
]);

const INACTIVE_MS = 30 * 24 * 60 * 60 * 1000;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function isInactive(lastActivityAt, now = Date.now()) {
  if (!lastActivityAt) return true;
  const t = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t >= INACTIVE_MS;
}

function rejectRatio(rejected, total) {
  const r = Number(rejected) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return r / t;
}

/**
 * @param {object} input
 */
export function deriveShopHealth(input = {}) {
  const flags = [];
  const publicStatus = String(input.shopPublicStatus || input.publicStatus || "")
    .trim()
    .toLowerCase();
  const productCount = Number(input.productCount) || 0;
  const approved = Number(input.approvedModerationCount ?? input.approved) || 0;
  const rejected = Number(input.rejectedModerationCount ?? input.rejected) || 0;
  const rfq = Number(input.rfqCount30d ?? input.rfqReceived30d ?? 0) || 0;
  const cta = Number(input.cta30d) || 0;
  const views = Number(input.views30d) || 0;
  const conversations = Number(input.conversations30d) || 0;
  const phone = input.shopPhone || input.accountPhone || input.phone;
  const zalo = input.zalo || input.zaloPhone;
  const slug = input.slug;

  if (publicStatus === "suspended") flags.push("storefront_suspended");
  if (productCount === 0) flags.push("no_products");
  if (isInactive(input.lastStorefrontActivityAt)) flags.push("inactive_30d");
  if (!hasText(slug)) flags.push("no_slug");
  if (!hasText(phone) && !hasText(zalo)) flags.push("missing_contact");

  const ratio = rejectRatio(rejected, productCount);
  if (rejected >= 2 && ratio >= 0.2) flags.push("high_reject_ratio");

  let score = 50;

  if (publicStatus === "public") score += 15;
  else if (publicStatus === "pending") score += 5;

  if (!isInactive(input.lastStorefrontActivityAt)) score += 10;
  if (rfq > 0) score += 10;
  if (approved > 0) score += Math.min(10, Math.floor(approved / 10) + 5);
  if (cta > 0) score += 5;
  if (views > 0) score += 5;
  if (conversations > 0) score += 5;

  if (publicStatus === "suspended") score -= 25;
  if (productCount === 0) score -= 20;
  if (flags.includes("high_reject_ratio")) score -= 15;
  if (flags.includes("inactive_30d")) score -= 15;
  if (flags.includes("no_slug")) score -= 10;
  if (flags.includes("missing_contact")) score -= 10;
  if (publicStatus === "public" && productCount > 0 && isInactive(input.lastStorefrontActivityAt)) {
    score -= 5;
  }

  score = clamp(Math.round(score), 0, 100);

  let healthLabel = "attention";
  if (score >= 80) healthLabel = "healthy";
  else if (score >= 60) healthLabel = "stable";
  else if (score >= 40) healthLabel = "weak";

  return {
    healthScore: score,
    healthLabel,
    attentionFlags: flags,
  };
}

export function isAttentionShop(health) {
  if (!health) return false;
  if (health.healthScore < 40) return true;
  return (health.attentionFlags || []).some((f) => CRITICAL_ATTENTION_FLAGS.includes(f));
}

const FLAG_LABELS_VI = {
  inactive_30d: "Không hoạt động storefront 30 ngày",
  no_products: "Chưa có sản phẩm",
  high_reject_ratio: "Tỷ lệ SP bị từ chối cao",
  missing_contact: "Thiếu phone/Zalo",
  storefront_suspended: "Storefront bị đình chỉ",
  no_slug: "Chưa có slug",
};

const RECOMMENDATIONS = {
  inactive_30d: "Kiểm tra seller có đang vận hành storefront không; cân nhắc liên hệ hoặc tạm ẩn khỏi discovery.",
  no_products: "Shop chưa có catalog — hướng dẫn seller đăng SP hoặc xem xét segment empty.",
  high_reject_ratio: "Rà soát moderation queue; nhiều SP bị từ chối có thể cần coaching seller.",
  missing_contact: "Bổ sung phone/Zalo trước khi public storefront (LocalBusiness/CTA).",
  storefront_suspended: "Xem enforcement case trước khi reinstate; đừng enable storefront khi đang suspended.",
  no_slug: "Gán slug qua storefront panel trước khi bật public.",
};

export function buildShopHealthRecommendations(health) {
  const flags = health?.attentionFlags || [];
  const warnings = flags.map((f) => ({
    flag: f,
    label: FLAG_LABELS_VI[f] || f,
    recommendation: RECOMMENDATIONS[f] || "Theo dõi shop này trong danh sách attention.",
  }));

  const general = [];
  if (health?.healthLabel === "healthy") {
    general.push("Shop đang ổn định — chỉ cần theo dõi định kỳ.");
  } else if (health?.healthLabel === "stable") {
    general.push("Shop ổn định vừa phải — ưu tiên cải thiện engagement (RFQ/CTA/views).");
  } else if (health?.healthLabel === "weak") {
    general.push("Shop yếu — xem xét hỗ trợ seller cải thiện catalog và hoạt động storefront.");
  } else {
    general.push("Shop cần attention — ưu tiên xử lý các cảnh báo bên dưới.");
  }

  return { warnings, general };
}

export function healthBadgeTone(label) {
  switch (label) {
    case "healthy":
      return "green";
    case "stable":
      return "blue";
    case "weak":
      return "amber";
    case "attention":
    default:
      return "red";
  }
}

export function healthLabelVi(label) {
  switch (label) {
    case "healthy":
      return "Healthy";
    case "stable":
      return "Stable";
    case "weak":
      return "Weak";
    case "attention":
      return "Attention";
    default:
      return label || "—";
  }
}

export function attentionSegmentSql({ inactiveSqlExpr, emptyShopSqlExpr }) {
  const highReject = `(
    COALESCE(pc.rejectedModerationCount, 0) >= 2
    AND COALESCE(pc.rejectedModerationCount, 0) / GREATEST(COALESCE(pc.productCount, 0), 1) >= 0.2
  )`;
  const noSlug = `(s.slug IS NULL OR TRIM(s.slug) = '')`;
  const noContact = `(
    TRIM(COALESCE(s.phone, '')) = ''
    AND TRIM(COALESCE(sa.phone, '')) = ''
    AND TRIM(COALESCE(s.zalo, '')) = ''
    AND TRIM(COALESCE(s.zalo_phone, '')) = ''
  )`;
  const suspended = `LOWER(COALESCE(s.public_status, '')) = 'suspended'`;
  const abandonedPublic = `(
    LOWER(COALESCE(s.public_status, '')) = 'public'
    AND (${inactiveSqlExpr})
    AND COALESCE(pc.productCount, 0) > 0
  )`;

  return `(
    ${suspended}
    OR ${emptyShopSqlExpr}
    OR (${inactiveSqlExpr})
    OR (${highReject})
    OR (${noSlug})
    OR (${noContact})
    OR (${abandonedPublic})
  )`;
}
