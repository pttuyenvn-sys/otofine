import { pool } from "../config/db.js";
import { buildStorefrontPreviewUrl } from "../domains/shopPublic/utils/storefrontPreviewUrl.util.js";
import { resolveShopZalo } from "../utils/resolveShopZalo.js";
import { getSchemaCapabilities } from "../utils/schemaCapabilities.js";
import { getShopMetricsOverview } from "./shopMetrics.service.js";
import { CTA_EVENT_TYPES } from "../domains/storefrontEvents/storefrontEvents.repository.js";
import { buildShopHealthRecommendations, deriveShopHealth } from "../utils/adminShopHealth.util.js";
import { buildContactSummary, findDuplicatePhoneMatches } from "../utils/adminShopContact.util.js";
import { buildGovernanceTimelineBundle } from "../utils/adminShopGovernanceTimeline.util.js";
import {
  evaluateStorefrontReadiness,
} from "../utils/storefrontReadiness.util.js";
import {
  evaluateStorefrontQuality,
} from "../utils/storefrontQuality.util.js";
import {
  isFeaturedStorefront,
} from "../utils/featuredStorefront.util.js";
import { buildApprovedWithImageCountSumSql } from "../utils/productImageCoverageSql.server.js";

const METRICS_WINDOW_DAYS = 30;

/** Cached detail product aggregate subquery (schema-safe image coverage). */
let detailProductAggSubqueryPromise = null;

async function getDetailProductAggSubquery() {
  if (!detailProductAggSubqueryPromise) {
    detailProductAggSubqueryPromise = (async () => {
      const approvedWithImageCount = await buildApprovedWithImageCountSumSql("p");
      return `
      SELECT
        p.shopId AS shopId,
        COUNT(*) AS productCount,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'pending_review' THEN 1 ELSE 0 END) AS pendingModerationCount,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'rejected' THEN 1 ELSE 0 END) AS rejectedModerationCount,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approvedModerationCount,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'hidden' THEN 1 ELSE 0 END) AS hiddenModerationCount,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) IN ('draft', 'archived') THEN 1 ELSE 0 END) AS archivedModerationCount,
        SUM(CASE WHEN TRIM(LOWER(COALESCE(p.moderation_status, ''))) = 'approved' AND COALESCE(p.stock, 0) <= 0 THEN 1 ELSE 0 END) AS outOfStockCount,
        ${approvedWithImageCount},
        SUM(
          CASE
            WHEN TRIM(LOWER(p.moderation_status)) = 'approved'
              AND COALESCE(p.price, 0) > 0
            THEN 1 ELSE 0
          END
        ) AS approvedWithPriceCount
      FROM products p
      WHERE p.shopId IS NOT NULL
      GROUP BY p.shopId
    `;
    })();
  }
  return detailProductAggSubqueryPromise;
}

const EMPTY_METRICS = Object.freeze({
  rfqReceived30d: 0,
  cta30d: 0,
  conversations30d: 0,
  views30d: 0,
  returningVisitors30d: 0,
});

const EMPTY_MODERATION = Object.freeze({
  totalProducts: 0,
  approved: 0,
  pending: 0,
  rejected: 0,
  hidden: 0,
  archived: 0,
  outOfStock: 0,
});

function buildDetailSql({ includeRiskScores, includeStorefrontEvents, productAggSubquery }) {
  const riskSelect = includeRiskScores
    ? `sr.risk_score AS riskScore,
    sr.risk_level AS riskLevel,`
    : `NULL AS riskScore,
    NULL AS riskLevel,`;
  const riskJoin = includeRiskScores
    ? `LEFT JOIN shop_risk_scores sr ON sr.shop_id = s.id`
    : "";
  const activitySelect = includeStorefrontEvents
    ? "sse.lastStorefrontActivityAt"
    : "NULL AS lastStorefrontActivityAt";
  const activityJoin = includeStorefrontEvents
    ? `LEFT JOIN (
    SELECT shop_id, MAX(occurred_at) AS lastStorefrontActivityAt
    FROM shop_storefront_events
    GROUP BY shop_id
  ) sse ON sse.shop_id = s.id`
    : "";

  return `
    SELECT
      sa.id AS accountId,
      sa.shopId AS accountShopUuid,
      sa.name AS accountName,
      sa.email AS accountEmail,
      sa.phone AS accountPhone,
      sa.status AS accountStatus,
      sa.createdAt AS accountCreatedAt,
      s.id AS governanceShopId,
      s.slug,
      s.public_status AS publicStatus,
      s.avatar,
      s.cover_image,
      s.cover,
      s.intro_html,
      s.bio,
      s.descriptionHtml,
      s.phone AS shopPhone,
      s.email AS shopEmail,
      s.zalo,
      s.zalo_phone AS zaloPhone,
      s.addressDetail,
      s.createdAt AS shopCreatedAt,
      s.updatedAt AS shopUpdatedAt,
      s.verified_at AS verifiedAt,
      prov.tinh_tp AS provinceLabel,
      COALESCE(pc.productCount, 0) AS productCount,
      COALESCE(pc.pendingModerationCount, 0) AS pendingModerationCount,
      COALESCE(pc.rejectedModerationCount, 0) AS rejectedModerationCount,
      COALESCE(pc.approvedModerationCount, 0) AS approvedModerationCount,
      COALESCE(pc.hiddenModerationCount, 0) AS hiddenModerationCount,
      COALESCE(pc.archivedModerationCount, 0) AS archivedModerationCount,
      COALESCE(pc.outOfStockCount, 0) AS outOfStockCount,
      ${riskSelect}
      ${activitySelect}
    FROM shop_accounts sa
    LEFT JOIN shops s ON s.accountId = sa.id
    LEFT JOIN address prov ON prov.id = s.provinceId
    LEFT JOIN (${productAggSubquery}) pc ON pc.shopId = s.id
    ${riskJoin}
    ${activityJoin}
    WHERE sa.id = ?
    LIMIT 1
  `;
}

async function fetchDetailRow(accountId, caps) {
  const productAggSubquery = await getDetailProductAggSubquery();
  const [rows] = await pool.query(
    buildDetailSql({
      includeRiskScores: caps.hasShopRiskScores,
      includeStorefrontEvents: caps.hasStorefrontEvents,
      productAggSubquery,
    }),
    [accountId],
  );
  return rows[0] || null;
}

async function fetchActiveSuspension(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT ass.suspended_at AS suspendedAt, ass.reason AS suspendedReason
      FROM admin_shop_suspensions ass
      WHERE ass.shop_id = ?
        AND ass.lifted_at IS NULL
        AND (ass.expires_at IS NULL OR ass.expires_at > NOW(3))
      ORDER BY ass.suspended_at DESC
      LIMIT 1
    `,
    [governanceShopId],
  );
  return rows[0] || null;
}

async function fetchLastModerationEvent(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT
        e.created_at AS createdAt,
        e.old_status AS oldStatus,
        e.new_status AS newStatus,
        e.reject_reason AS rejectReason
      FROM product_moderation_events e
      INNER JOIN products p ON p.id = e.product_id
      WHERE p.shopId = ?
      ORDER BY e.created_at DESC
      LIMIT 1
    `,
    [governanceShopId],
  );
  return rows[0] || null;
}

/**
 * Returning buyers in trailing window — same semantics as seller metrics
 * (shopMetrics.countReturningBuyersToday) adapted to N-day window.
 */
async function countReturningVisitors(governanceShopId, sinceDays) {
  const [[row]] = await pool.query(
    `
      SELECT COUNT(DISTINCT r_recent.guest_phone_e164) AS c
      FROM rfq_dispatches d_recent
      INNER JOIN rfq_requests r_recent ON r_recent.id = d_recent.rfq_request_id
      WHERE d_recent.shop_id = ?
        AND r_recent.deleted_at IS NULL
        AND COALESCE(r_recent.spam_flag, 0) = 0
        AND r_recent.guest_phone_e164 IS NOT NULL
        AND d_recent.created_at >= (NOW(3) - INTERVAL ? DAY)
        AND EXISTS (
          SELECT 1
          FROM rfq_dispatches d_prior
          INNER JOIN rfq_requests r_prior ON r_prior.id = d_prior.rfq_request_id
          WHERE d_prior.shop_id = d_recent.shop_id
            AND d_prior.id <> d_recent.id
            AND r_prior.guest_phone_e164 = r_recent.guest_phone_e164
            AND d_prior.created_at < (NOW(3) - INTERVAL ? DAY)
            AND r_prior.deleted_at IS NULL
        )
    `,
    [governanceShopId, sinceDays, sinceDays],
  );
  return Number(row?.c) || 0;
}

function moderationLabel(event) {
  if (!event) return null;
  const ns = String(event.newStatus || "").trim().toLowerCase();
  if (ns === "approved") return "Sản phẩm được duyệt";
  if (ns === "rejected") return "Sản phẩm bị từ chối";
  if (ns === "pending_review") return "Gửi duyệt sản phẩm";
  if (ns === "hidden") return "Ẩn sản phẩm";
  return ns ? `Moderation: ${ns}` : "Moderation";
}

function mapMetricsOverview(overview, returningVisitors30d) {
  if (!overview) {
    return { ...EMPTY_METRICS, returningVisitors30d };
  }
  let cta30d = 0;
  for (const t of CTA_EVENT_TYPES) {
    cta30d += overview.eventCountsLast30d?.[t] || 0;
  }
  return {
    rfqReceived30d: overview.cards?.rfqReceivedLast30d ?? 0,
    cta30d,
    conversations30d: overview.cards?.conversationsLast30d ?? 0,
    views30d: overview.storefrontViewsLast30d ?? 0,
    returningVisitors30d,
  };
}

function mapModerationFromRow(row) {
  if (!row) return { ...EMPTY_MODERATION };
  return {
    totalProducts: Number(row.productCount) || 0,
    approved: Number(row.approvedModerationCount) || 0,
    pending: Number(row.pendingModerationCount) || 0,
    rejected: Number(row.rejectedModerationCount) || 0,
    hidden: Number(row.hiddenModerationCount) || 0,
    archived: Number(row.archivedModerationCount) || 0,
    outOfStock: Number(row.outOfStockCount) || 0,
  };
}

function buildStorefrontSection(row) {
  const preview = row.slug ? buildStorefrontPreviewUrl(row.slug, row.publicStatus) : null;
  return {
    primary: preview?.primary ?? null,
    subdomain: preview?.subdomain ?? null,
    apex: preview?.apex ?? null,
    isLive: preview?.isLive ?? false,
    publicStatus: row.publicStatus ?? null,
    lastActivityAt: row.lastStorefrontActivityAt ?? null,
  };
}

/**
 * Aggregated admin shop drawer payload.
 * @param {number|string} accountId shop_accounts.id (legacy admin list id)
 */
export async function getAdminShopDetail(accountId) {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const caps = await getSchemaCapabilities();
  const row = await fetchDetailRow(id, caps);
  if (!row) return null;

  const governanceShopId = row.governanceShopId ? Number(row.governanceShopId) : null;
  const addressParts = [row.addressDetail, row.provinceLabel].filter(Boolean);

  let metricsOverview = null;
  let suspension = null;
  let lastModerationEvent = null;
  let returningVisitors30d = 0;
  let duplicatePhones = { count: 0, matches: [] };
  let governanceTimeline = { timeline: [], auditTrail: [] };

  const contact = buildContactSummary({
    shopPhone: row.shopPhone,
    accountPhone: row.accountPhone,
    shopEmail: row.shopEmail,
    accountEmail: row.accountEmail,
    zalo: row.zalo,
    zaloPhone: row.zaloPhone,
  });

  if (governanceShopId) {
    const tasks = [
      getShopMetricsOverview(governanceShopId).catch(() => null),
      fetchActiveSuspension(governanceShopId).catch(() => null),
      countReturningVisitors(governanceShopId, METRICS_WINDOW_DAYS).catch(() => 0),
      findDuplicatePhoneMatches(pool, {
        accountId: id,
        contactKeys: contact.duplicateKeys,
      }).catch(() => ({ count: 0, matches: [] })),
      buildGovernanceTimelineBundle({ governanceShopId, row, caps }).catch(() => ({
        timeline: [],
        auditTrail: [],
      })),
    ];
    if (caps.hasModerationTimeline) {
      tasks.push(fetchLastModerationEvent(governanceShopId).catch(() => null));
    }

    const results = await Promise.all(tasks);
    metricsOverview = results[0];
    suspension = results[1];
    returningVisitors30d = results[2] || 0;
    duplicatePhones = results[3] || { count: 0, matches: [] };
    governanceTimeline = results[4] || { timeline: [], auditTrail: [] };
    lastModerationEvent = caps.hasModerationTimeline ? results[5] : null;
  } else {
    duplicatePhones = await findDuplicatePhoneMatches(pool, {
      accountId: id,
      contactKeys: contact.duplicateKeys,
    }).catch(() => ({ count: 0, matches: [] }));
    governanceTimeline = await buildGovernanceTimelineBundle({ governanceShopId: null, row, caps }).catch(() => ({
      timeline: [],
      auditTrail: [],
    }));
  }

  const zalo = resolveShopZalo(row, { phoneFallback: true });
  const storefront = buildStorefrontSection(row);
  const moderation = mapModerationFromRow(row);
  if (moderation.outOfStock === 0 && metricsOverview?.cardsToday?.outOfStockCount) {
    moderation.outOfStock = metricsOverview.cardsToday.outOfStockCount;
  }

  const metrics = mapMetricsOverview(metricsOverview, returningVisitors30d);
  const health = deriveShopHealth({
    shopPublicStatus: row.publicStatus,
    slug: row.slug,
    shopPhone: row.shopPhone,
    accountPhone: row.accountPhone,
    zalo,
    productCount: moderation.totalProducts,
    approvedModerationCount: moderation.approved,
    rejectedModerationCount: moderation.rejected,
    lastStorefrontActivityAt: row.lastStorefrontActivityAt,
    rfqReceived30d: metrics.rfqReceived30d,
    cta30d: metrics.cta30d,
    views30d: metrics.views30d,
    conversations30d: metrics.conversations30d,
  });
  const recommendations = buildShopHealthRecommendations(health);
  const storefrontReadiness = evaluateStorefrontReadiness({
    name: row.accountName,
    accountName: row.accountName,
    avatar: row.avatar,
    cover_image: row.cover_image,
    cover: row.cover,
    intro_html: row.intro_html,
    bio: row.bio,
    descriptionHtml: row.descriptionHtml,
    shopPhone: row.shopPhone,
    accountPhone: row.accountPhone,
    phone: contact.primaryPhone,
    zalo: contact.primaryZalo,
    zaloPhone: contact.zaloColumns?.zaloPhone?.value,
    slug: row.slug,
    approvedModerationCount: moderation.approved,
  });
  const storefrontQuality = evaluateStorefrontQuality({
    name: row.accountName,
    accountName: row.accountName,
    avatar: row.avatar,
    cover_image: row.cover_image,
    cover: row.cover,
    intro_html: row.intro_html,
    bio: row.bio,
    descriptionHtml: row.descriptionHtml,
    shopPhone: row.shopPhone,
    accountPhone: row.accountPhone,
    phone: contact.primaryPhone,
    zalo: contact.primaryZalo,
    zaloPhone: contact.zaloColumns?.zaloPhone?.value,
    slug: row.slug,
    publicStatus: row.publicStatus,
    shopPublicStatus: row.publicStatus,
    accountStatus: row.accountStatus,
    productCount: moderation.totalProducts,
    approvedModerationCount: moderation.approved,
    rejectedModerationCount: moderation.rejected,
    approvedWithImageCount: Number(row.approvedWithImageCount) || 0,
    approvedWithPriceCount: Number(row.approvedWithPriceCount) || 0,
    lastStorefrontActivityAt: row.lastStorefrontActivityAt,
    shopUpdatedAt: row.shopUpdatedAt,
    verifiedAt: row.verifiedAt,
    rfqReceived30d: metrics.rfqReceived30d,
    conversations30d: metrics.conversations30d,
    views30d: metrics.views30d,
    cta30d: metrics.cta30d,
    hasEnforcementSuspension: Boolean(suspension),
  });
  const featuredStorefront = isFeaturedStorefront({
    name: row.accountName,
    accountName: row.accountName,
    avatar: row.avatar,
    cover_image: row.cover_image,
    cover: row.cover,
    intro_html: row.intro_html,
    bio: row.bio,
    descriptionHtml: row.descriptionHtml,
    shopPhone: row.shopPhone,
    accountPhone: row.accountPhone,
    phone: contact.primaryPhone,
    zalo: contact.primaryZalo,
    zaloPhone: contact.zaloColumns?.zaloPhone?.value,
    slug: row.slug,
    publicStatus: row.publicStatus,
    shopPublicStatus: row.publicStatus,
    accountStatus: row.accountStatus,
    productCount: moderation.totalProducts,
    approvedModerationCount: moderation.approved,
    rejectedModerationCount: moderation.rejected,
    approvedWithImageCount: Number(row.approvedWithImageCount) || 0,
    approvedWithPriceCount: Number(row.approvedWithPriceCount) || 0,
    lastStorefrontActivityAt: row.lastStorefrontActivityAt,
    shopUpdatedAt: row.shopUpdatedAt,
    verifiedAt: row.verifiedAt,
    rfqReceived30d: metrics.rfqReceived30d,
    conversations30d: metrics.conversations30d,
    views30d: metrics.views30d,
    cta30d: metrics.cta30d,
    hasEnforcementSuspension: Boolean(suspension),
  });

  return {
    shop: {
      id: row.accountId,
      governanceShopId,
      accountShopUuid: row.accountShopUuid ?? null,
      name: row.accountName || row.name,
      slug: row.slug ?? null,
      avatar: row.avatar ?? null,
      phone: contact.primaryPhone,
      accountPhone: contact.accountPhone.value,
      shopPhone: contact.shopPhone.value,
      email: row.shopEmail || row.accountEmail || null,
      zalo: contact.primaryZalo,
      zaloRaw: contact.zaloColumns.zalo.value,
      zaloPhone: contact.zaloColumns.zaloPhone.value,
      address: addressParts.length ? addressParts.join(", ") : row.addressDetail || null,
      addressDetail: row.addressDetail ?? null,
      province: row.provinceLabel ?? null,
      createdAt: row.shopCreatedAt || row.accountCreatedAt || null,
      updatedAt: row.shopUpdatedAt || null,
      accountCreatedAt: row.accountCreatedAt || null,
    },
    storefront,
    moderation,
    metrics,
    health,
    recommendations,
    storefrontReadiness,
    storefrontQuality,
    featuredStorefront,
    contact,
    duplicatePhones,
    timeline: governanceTimeline.timeline,
    auditTrail: governanceTimeline.auditTrail,
    governance: {
      accountStatus: row.accountStatus ?? null,
      storefrontStatus: row.publicStatus ?? null,
      riskLevel: row.riskLevel ?? null,
      riskScore: row.riskScore != null ? Number(row.riskScore) : null,
      suspendedAt: suspension?.suspendedAt ?? null,
      suspendedReason: suspension?.suspendedReason ?? null,
    },
    activity: {
      shopCreatedAt: row.shopCreatedAt || row.accountCreatedAt || null,
      accountCreatedAt: row.accountCreatedAt || null,
      lastStorefrontEventAt: row.lastStorefrontActivityAt ?? null,
      lastModerationActionAt: lastModerationEvent?.createdAt ?? null,
      lastModerationActionLabel: moderationLabel(lastModerationEvent),
    },
  };
}
