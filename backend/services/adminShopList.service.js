import { pool } from "../config/db.js";
import { buildStorefrontPreviewUrl } from "../domains/shopPublic/utils/storefrontPreviewUrl.util.js";
import { resolveShopZalo } from "../utils/resolveShopZalo.js";
import { fromDbStatus } from "../domains/shopPublic/validators/sellerPublicPage.validators.js";
import { getSchemaCapabilities } from "../utils/schemaCapabilities.js";
import { attentionSegmentSql, deriveShopHealth } from "../utils/adminShopHealth.util.js";
import { buildContactSummary } from "../utils/adminShopContact.util.js";
import {
  compactStorefrontReadiness,
  evaluateStorefrontReadiness,
  storefrontReadinessScoreSql,
  STOREFRONT_READINESS_PUBLISH_MIN,
} from "../utils/storefrontReadiness.util.js";
import {
  compactStorefrontQuality,
  evaluateStorefrontQuality,
} from "../utils/storefrontQuality.util.js";
import {
  compactFeaturedStorefront,
  isFeaturedStorefront,
} from "../utils/featuredStorefront.util.js";
import { buildApprovedWithImageCountSumSql } from "../utils/productImageCoverageSql.server.js";

/** Cached product aggregate subquery (schema-safe image coverage). */
let productCountSubqueryPromise = null;

async function productCountSubquery() {
  if (!productCountSubqueryPromise) {
    productCountSubqueryPromise = (async () => {
      const approvedWithImageCount = await buildApprovedWithImageCountSumSql("p");
      return `
    SELECT
      p.shopId AS shopId,
      COUNT(*) AS productCount,
      SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'pending_review' THEN 1 ELSE 0 END) AS pendingModerationCount,
      SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'rejected' THEN 1 ELSE 0 END) AS rejectedModerationCount,
      SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approvedModerationCount,
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
  return productCountSubqueryPromise;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const INACTIVE_DAYS = 30;
const RFQ_WINDOW_DAYS = 30;
const HIGH_RISK_SCORE_MIN = 70;

export const ADMIN_SHOP_SEGMENTS = Object.freeze([
  "all",
  "public",
  "draft",
  "suspended",
  "inactive",
  "empty",
  "high_risk",
  "attention",
]);

export const ADMIN_SHOP_SORTS = Object.freeze([
  "newest",
  "products_desc",
  "rfq_desc",
  "last_activity_desc",
  "risk_desc",
]);

const EMPTY_SUMMARY = Object.freeze({
  totalShops: 0,
  publicStorefronts: 0,
  suspendedShops: 0,
  inactiveShops: 0,
  emptyShops: 0,
  highRiskShops: 0,
  attentionShops: 0,
});

function parseBool(value) {
  if (value == null || value === "") return null;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return null;
}

function normalizeSegment(raw) {
  const s = String(raw || "all").trim().toLowerCase();
  return ADMIN_SHOP_SEGMENTS.includes(s) ? s : "all";
}

function normalizeSort(raw) {
  const s = String(raw || "newest").trim().toLowerCase();
  return ADMIN_SHOP_SORTS.includes(s) ? s : "newest";
}

/**
 * @param {Record<string, unknown>} raw
 */
export function parseAdminShopListQuery(raw = {}) {
  return {
    q: String(raw.q || "").trim().slice(0, 80),
    segment: normalizeSegment(raw.segment),
    accountStatus: String(raw.accountStatus || "").trim().toLowerCase(),
    storefrontStatus: String(raw.storefrontStatus || "").trim().toLowerCase(),
    storefrontReview: String(raw.storefrontReview || "").trim().toLowerCase(),
    riskLevel: String(raw.riskLevel || "").trim().toLowerCase(),
    hasProducts: parseBool(raw.hasProducts),
    inactive: parseBool(raw.inactive),
    publicOnly: parseBool(raw.publicOnly),
    sort: normalizeSort(raw.sort),
    page: Math.max(1, Number.parseInt(String(raw.page || "1"), 10) || 1),
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.parseInt(String(raw.pageSize || String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE),
    ),
  };
}

function hasOperationalQuery(raw = {}) {
  const keys = [
    "q",
    "segment",
    "accountStatus",
    "storefrontStatus",
    "storefrontReview",
    "riskLevel",
    "hasProducts",
    "inactive",
    "publicOnly",
    "sort",
    "page",
    "pageSize",
  ];
  return keys.some((k) => raw[k] != null && String(raw[k]).trim() !== "");
}

function rfqCountSubquery() {
  return `
    SELECT shop_id AS shopId, COUNT(*) AS rfqCount30d
    FROM rfq_dispatches
    WHERE created_at >= (NOW() - INTERVAL ${RFQ_WINDOW_DAYS} DAY)
    GROUP BY shop_id
  `;
}

function buildJoins({ includeRiskScores, includeStorefrontEvents, includeRfqMetrics, includeEnforcement }) {
  const riskJoin = includeRiskScores
    ? `LEFT JOIN shop_risk_scores sr ON sr.shop_id = s.id`
    : "";
  const activityJoin = includeStorefrontEvents
    ? `LEFT JOIN (
    SELECT shop_id, MAX(occurred_at) AS lastStorefrontActivityAt
    FROM shop_storefront_events
    GROUP BY shop_id
  ) sse ON sse.shop_id = s.id`
    : "";
  const rfqJoin = includeRfqMetrics
    ? `LEFT JOIN (${rfqCountSubquery()}) rfq ON rfq.shopId = s.id`
    : "";
  const enforcementJoin = includeEnforcement
    ? `LEFT JOIN (
    SELECT shop_id
    FROM admin_shop_suspensions
    WHERE lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW(3))
    GROUP BY shop_id
  ) enf ON enf.shop_id = s.id`
    : "";

  return { riskJoin, activityJoin, rfqJoin, enforcementJoin };
}

function buildSelectParts({ includeRiskScores, includeStorefrontEvents, includeRfqMetrics, includeEnforcement }) {
  const riskSelect = includeRiskScores
    ? `sr.risk_score AS riskScore,
    sr.risk_level AS riskLevel,`
    : `NULL AS riskScore,
    NULL AS riskLevel,`;
  const activitySelect = includeStorefrontEvents
    ? "sse.lastStorefrontActivityAt,"
    : "NULL AS lastStorefrontActivityAt,";
  const rfqSelect = includeRfqMetrics ? "COALESCE(rfq.rfqCount30d, 0) AS rfqCount30d," : "";
  const enforcementSelect = includeEnforcement
    ? "CASE WHEN enf.shop_id IS NOT NULL THEN 1 ELSE 0 END AS hasEnforcementSuspension,"
    : "NULL AS hasEnforcementSuspension,";

  return { riskSelect, activitySelect, rfqSelect, enforcementSelect };
}

function inactiveSql(includeStorefrontEvents) {
  if (!includeStorefrontEvents) {
    return `(s.id IS NOT NULL AND sa.status IN ('blocked', 'suspended'))`;
  }
  return `(
    sse.lastStorefrontActivityAt IS NULL
    OR sse.lastStorefrontActivityAt < (NOW() - INTERVAL ${INACTIVE_DAYS} DAY)
  )`;
}

function highRiskSql(includeRiskScores) {
  if (!includeRiskScores) return "0=1";
  return `(
    LOWER(COALESCE(sr.risk_level, '')) IN ('high', 'critical')
    OR COALESCE(sr.risk_score, 0) >= ${HIGH_RISK_SCORE_MIN}
  )`;
}

function emptyShopSql() {
  return `COALESCE(pc.productCount, 0) = 0`;
}

/**
 * Build WHERE fragments shared by list, count, and (optionally filtered) summary.
 */
function buildFilterClause(query, caps) {
  const where = [`sa.status != 'deleted'`];
  const params = [];

  if (query.q) {
    const needle = `%${query.q.toLowerCase()}%`;
    where.push(`(
      LOWER(sa.name) LIKE ?
      OR LOWER(sa.email) LIKE ?
      OR LOWER(COALESCE(sa.phone, '')) LIKE ?
      OR LOWER(COALESCE(s.slug, '')) LIKE ?
      OR LOWER(COALESCE(s.phone, '')) LIKE ?
    )`);
    params.push(needle, needle, needle, needle, needle);
  }

  if (query.accountStatus) {
    where.push(`LOWER(sa.status) = ?`);
    params.push(query.accountStatus);
  }

  if (query.storefrontStatus) {
    where.push(`LOWER(COALESCE(s.public_status, '')) = ?`);
    params.push(query.storefrontStatus);
  }

  if (query.storefrontReview) {
    const scoreSql = storefrontReadinessScoreSql();
    switch (query.storefrontReview) {
      case "pending_review":
        where.push(`LOWER(COALESCE(s.public_status, '')) = 'pending'`);
        where.push(`${scoreSql} >= ${STOREFRONT_READINESS_PUBLISH_MIN}`);
        break;
      case "public":
        where.push(`LOWER(COALESCE(s.public_status, '')) = 'public'`);
        break;
      case "suspended":
        where.push(`LOWER(COALESCE(s.public_status, '')) = 'suspended'`);
        break;
      case "incomplete":
        where.push(`${scoreSql} < ${STOREFRONT_READINESS_PUBLISH_MIN}`);
        break;
      default:
        break;
    }
  }

  if (query.riskLevel && caps.hasShopRiskScores) {
    where.push(`LOWER(COALESCE(sr.risk_level, 'low')) = ?`);
    params.push(query.riskLevel);
  }

  if (query.hasProducts === true) {
    where.push(`COALESCE(pc.productCount, 0) > 0`);
  } else if (query.hasProducts === false) {
    where.push(emptyShopSql());
  }

  if (query.publicOnly === true) {
    where.push(`LOWER(COALESCE(s.public_status, '')) = 'public'`);
  }

  if (query.inactive === true) {
    where.push(inactiveSql(caps.hasStorefrontEvents));
  }

  switch (query.segment) {
    case "public":
      where.push(`LOWER(COALESCE(s.public_status, '')) = 'public'`);
      break;
    case "draft":
      where.push(`LOWER(COALESCE(s.public_status, '')) = 'pending'`);
      break;
    case "suspended":
      where.push(`LOWER(COALESCE(s.public_status, '')) = 'suspended'`);
      break;
    case "inactive":
      where.push(inactiveSql(caps.hasStorefrontEvents));
      break;
    case "empty":
      where.push(emptyShopSql());
      break;
    case "high_risk":
      where.push(highRiskSql(caps.hasShopRiskScores));
      break;
    case "attention":
      where.push(
        attentionSegmentSql({
          inactiveSqlExpr: inactiveSql(caps.hasStorefrontEvents),
          emptyShopSqlExpr: emptyShopSql(),
        }),
      );
      break;
    default:
      break;
  }

  return { whereSql: where.join(" AND "), params };
}

function buildOrderBy(query, caps) {
  switch (query.sort) {
    case "products_desc":
      return "COALESCE(pc.productCount, 0) DESC, sa.createdAt DESC, sa.id DESC";
    case "rfq_desc":
      return "COALESCE(rfq.rfqCount30d, 0) DESC, sa.createdAt DESC, sa.id DESC";
    case "last_activity_desc":
      return caps.hasStorefrontEvents
        ? "sse.lastStorefrontActivityAt IS NULL, sse.lastStorefrontActivityAt DESC, sa.createdAt DESC, sa.id DESC"
        : "sa.createdAt DESC, sa.id DESC";
    case "risk_desc":
      return caps.hasShopRiskScores
        ? "COALESCE(sr.risk_score, 0) DESC, sa.createdAt DESC, sa.id DESC"
        : "sa.createdAt DESC, sa.id DESC";
    case "newest":
    default:
      return "sa.createdAt DESC, sa.id DESC";
  }
}

function buildFromClause(joins, productAggSubquery) {
  return `
    FROM shop_accounts sa
    LEFT JOIN shops s ON s.accountId = sa.id
    LEFT JOIN address prov ON prov.id = s.provinceId
    LEFT JOIN (${productAggSubquery}) pc ON pc.shopId = s.id
    ${joins.riskJoin}
    ${joins.activityJoin}
    ${joins.rfqJoin}
    ${joins.enforcementJoin || ""}
  `;
}

function buildListSql(query, caps, productAggSubquery) {
  const joins = buildJoins({
    includeRiskScores: caps.hasShopRiskScores,
    includeStorefrontEvents: caps.hasStorefrontEvents,
    includeRfqMetrics: true,
    includeEnforcement: caps.hasAdminShopSuspensions,
  });
  const { riskSelect, activitySelect, rfqSelect, enforcementSelect } = buildSelectParts({
    includeRiskScores: caps.hasShopRiskScores,
    includeStorefrontEvents: caps.hasStorefrontEvents,
    includeRfqMetrics: true,
    includeEnforcement: caps.hasAdminShopSuspensions,
  });
  const { whereSql, params } = buildFilterClause(query, caps);
  const orderBy = buildOrderBy(query, caps);
  const offset = (query.page - 1) * query.pageSize;

  const sql = `
    SELECT
      sa.id,
      sa.shopId,
      sa.name,
      sa.email,
      sa.phone AS accountPhone,
      sa.status,
      sa.createdAt,
      sa.approvedAt,
      sa.approvedByAdminId,
      s.id AS governanceShopId,
      s.slug,
      s.public_status AS shopPublicStatus,
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
      s.updatedAt AS shopUpdatedAt,
      s.verified_at AS verifiedAt,
      s.addressDetail,
      prov.tinh_tp AS provinceLabel,
      COALESCE(pc.productCount, 0) AS productCount,
      COALESCE(pc.pendingModerationCount, 0) AS pendingModerationCount,
      COALESCE(pc.rejectedModerationCount, 0) AS rejectedModerationCount,
      COALESCE(pc.approvedModerationCount, 0) AS approvedModerationCount,
      COALESCE(pc.approvedWithImageCount, 0) AS approvedWithImageCount,
      COALESCE(pc.approvedWithPriceCount, 0) AS approvedWithPriceCount,
      ${enforcementSelect}
      ${riskSelect}
      ${activitySelect}
      ${rfqSelect}
      sa.id AS _sortId
    ${buildFromClause(joins, productAggSubquery)}
    WHERE ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  return { sql, params: [...params, query.pageSize, offset] };
}

function buildCountSql(query, caps, productAggSubquery) {
  const joins = buildJoins({
    includeRiskScores: caps.hasShopRiskScores,
    includeStorefrontEvents: caps.hasStorefrontEvents,
    includeRfqMetrics: true,
    includeEnforcement: caps.hasAdminShopSuspensions,
  });
  const { whereSql, params } = buildFilterClause(query, caps);
  const sql = `
    SELECT COUNT(DISTINCT sa.id) AS total
    ${buildFromClause(joins, productAggSubquery)}
    WHERE ${whereSql}
  `;
  return { sql, params };
}

function buildSummarySql(caps, productAggSubquery) {
  const joins = buildJoins({
    includeRiskScores: caps.hasShopRiskScores,
    includeStorefrontEvents: caps.hasStorefrontEvents,
    includeRfqMetrics: true,
    includeEnforcement: caps.hasAdminShopSuspensions,
  });
  const inactive = inactiveSql(caps.hasStorefrontEvents);
  const highRisk = highRiskSql(caps.hasShopRiskScores);
  const attention = attentionSegmentSql({
    inactiveSqlExpr: inactive,
    emptyShopSqlExpr: emptyShopSql(),
  });

  const sql = `
    SELECT
      COUNT(DISTINCT sa.id) AS totalShops,
      SUM(CASE WHEN LOWER(COALESCE(s.public_status, '')) = 'public' THEN 1 ELSE 0 END) AS publicStorefronts,
      SUM(CASE WHEN LOWER(COALESCE(s.public_status, '')) = 'suspended' THEN 1 ELSE 0 END) AS suspendedShops,
      SUM(CASE WHEN (${inactive}) THEN 1 ELSE 0 END) AS inactiveShops,
      SUM(CASE WHEN ${emptyShopSql()} THEN 1 ELSE 0 END) AS emptyShops,
      SUM(CASE WHEN (${highRisk}) THEN 1 ELSE 0 END) AS highRiskShops,
      SUM(CASE WHEN (${attention}) THEN 1 ELSE 0 END) AS attentionShops
    ${buildFromClause(joins, productAggSubquery)}
    WHERE sa.status != 'deleted'
  `;
  return { sql, params: [] };
}

function mapAdminShopRow(row) {
  const shopPublicStatus = row.shopPublicStatus ?? null;
  const storefrontPreview = row.slug
    ? buildStorefrontPreviewUrl(row.slug, shopPublicStatus)
    : null;

  const addressParts = [row.addressDetail, row.provinceLabel].filter(Boolean);
  const addressLine = addressParts.length ? addressParts.join(", ") : null;

  const base = {
    id: row.id,
    shopId: row.shopId,
    name: row.name,
    email: row.email,
    phone: row.accountPhone,
    status: row.status,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    approvedByAdminId: row.approvedByAdminId,
    governanceShopId: row.governanceShopId,
    slug: row.slug,
    shopPublicStatus,
    sellerPublicStatus: shopPublicStatus ? fromDbStatus(shopPublicStatus) : null,
    avatar: row.avatar,
    shopPhone: row.shopPhone,
    shopEmail: row.shopEmail,
    zalo: resolveShopZalo(row),
    addressDetail: row.addressDetail,
    provinceLabel: row.provinceLabel,
    addressLine,
    productCount: Number(row.productCount) || 0,
    pendingModerationCount: Number(row.pendingModerationCount) || 0,
    rejectedModerationCount: Number(row.rejectedModerationCount) || 0,
    approvedModerationCount: Number(row.approvedModerationCount) || 0,
    riskScore: row.riskScore != null ? Number(row.riskScore) : null,
    riskLevel: row.riskLevel || null,
    lastStorefrontActivityAt: row.lastStorefrontActivityAt || null,
    rfqCount30d: Number(row.rfqCount30d) || 0,
    storefrontPreview,
  };

  const health = deriveShopHealth({
    shopPublicStatus,
    slug: row.slug,
    shopPhone: row.shopPhone,
    accountPhone: row.accountPhone,
    zalo: resolveShopZalo(row),
    productCount: base.productCount,
    approvedModerationCount: base.approvedModerationCount,
    rejectedModerationCount: base.rejectedModerationCount,
    lastStorefrontActivityAt: base.lastStorefrontActivityAt,
    rfqCount30d: base.rfqCount30d,
  });

  const contact = buildContactSummary({
    shopPhone: row.shopPhone,
    accountPhone: row.accountPhone,
    shopEmail: row.shopEmail,
    accountEmail: row.email,
    zalo: row.zalo,
    zaloPhone: row.zaloPhone,
  });

  const storefrontReadiness = compactStorefrontReadiness(
    evaluateStorefrontReadiness({
      name: row.name,
      accountName: row.name,
      avatar: row.avatar,
      cover_image: row.cover_image,
      cover: row.cover,
      intro_html: row.intro_html,
      bio: row.bio,
      descriptionHtml: row.descriptionHtml,
      shopPhone: row.shopPhone,
      accountPhone: row.accountPhone,
      zalo: contact.primaryZalo,
      zaloPhone: row.zaloPhone,
      slug: row.slug,
      approvedModerationCount: base.approvedModerationCount,
    }),
  );

  const qualityInput = {
    name: row.name,
    accountName: row.name,
    avatar: row.avatar,
    cover_image: row.cover_image,
    cover: row.cover,
    intro_html: row.intro_html,
    bio: row.bio,
    descriptionHtml: row.descriptionHtml,
    shopPhone: row.shopPhone,
    accountPhone: row.accountPhone,
    zalo: contact.primaryZalo,
    zaloPhone: row.zaloPhone,
    slug: row.slug,
    shopPublicStatus,
    publicStatus: shopPublicStatus,
    accountStatus: row.status,
    productCount: base.productCount,
    approvedModerationCount: base.approvedModerationCount,
    rejectedModerationCount: base.rejectedModerationCount,
    approvedWithImageCount: Number(row.approvedWithImageCount) || 0,
    approvedWithPriceCount: Number(row.approvedWithPriceCount) || 0,
    lastStorefrontActivityAt: base.lastStorefrontActivityAt,
    shopUpdatedAt: row.shopUpdatedAt,
    verifiedAt: row.verifiedAt,
    rfqCount30d: base.rfqCount30d,
  };

  const storefrontQuality = compactStorefrontQuality(evaluateStorefrontQuality(qualityInput));

  const featuredInput = {
    ...qualityInput,
    hasEnforcementSuspension:
      row.hasEnforcementSuspension == null
        ? null
        : Boolean(Number(row.hasEnforcementSuspension)),
  };
  const featuredStorefront = compactFeaturedStorefront(isFeaturedStorefront(featuredInput));

  return {
    ...base,
    ...health,
    storefrontReadiness,
    storefrontQuality,
    featuredStorefront,
    contact: {
      shopPhone: contact.shopPhone.value,
      accountPhone: contact.accountPhone.value,
      zalo: contact.primaryZalo,
      zaloRaw: contact.zaloColumns.zalo.value,
      zaloPhone: contact.zaloColumns.zaloPhone.value,
      hasAnyContact: contact.hasAnyContact,
      storefrontContactReady: contact.storefrontContactReady,
      driftFlags: contact.driftFlags,
    },
  };
}

function mapSummaryRow(row) {
  if (!row) return { ...EMPTY_SUMMARY };
  return {
    totalShops: Number(row.totalShops) || 0,
    publicStorefronts: Number(row.publicStorefronts) || 0,
    suspendedShops: Number(row.suspendedShops) || 0,
    inactiveShops: Number(row.inactiveShops) || 0,
    emptyShops: Number(row.emptyShops) || 0,
    highRiskShops: Number(row.highRiskShops) || 0,
    attentionShops: Number(row.attentionShops) || 0,
  };
}

/**
 * Paginated admin shop list with KPI summary.
 * @param {ReturnType<typeof parseAdminShopListQuery>} [query]
 */
export async function listAdminShops(query = parseAdminShopListQuery()) {
  const caps = await getSchemaCapabilities();
  const productAggSubquery = await productCountSubquery();
  const listSql = buildListSql(query, caps, productAggSubquery);
  const countSql = buildCountSql(query, caps, productAggSubquery);
  const summarySql = buildSummarySql(caps, productAggSubquery);

  const [[rows], [[countRow]], [[summaryRow]]] = await Promise.all([
    pool.query(listSql.sql, listSql.params),
    pool.query(countSql.sql, countSql.params),
    pool.query(summarySql.sql, summarySql.params),
  ]);

  return {
    items: (rows || []).map(mapAdminShopRow),
    total: Number(countRow?.total) || 0,
    page: query.page,
    pageSize: query.pageSize,
    summary: mapSummaryRow(summaryRow),
  };
}

/** Legacy array response for callers without operational query params. */
export async function listAdminShopsLegacyArray() {
  const result = await listAdminShops(
    parseAdminShopListQuery({ page: 1, pageSize: 10000 }),
  );
  return result.items;
}

export { hasOperationalQuery };
