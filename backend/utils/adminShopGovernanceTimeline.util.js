import { pool } from "../config/db.js";

const TIMELINE_LIMIT = 60;
const AUDIT_LIMIT = 40;

function toTime(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function moderationTitle(row) {
  const ns = String(row.newStatus || "").trim().toLowerCase();
  if (ns === "approved") return "Sản phẩm được duyệt";
  if (ns === "rejected") return "Sản phẩm bị từ chối";
  if (ns === "pending_review") return "Gửi duyệt sản phẩm";
  if (ns === "hidden") return "Ẩn sản phẩm";
  return ns ? `Moderation: ${ns}` : "Moderation";
}

function moderationSeverity(row) {
  const ns = String(row.newStatus || "").trim().toLowerCase();
  if (ns === "rejected") return "warning";
  if (ns === "hidden") return "warning";
  return "info";
}

function auditSeverity(action) {
  const a = String(action || "");
  if (a === "shop.suspend" || a === "shop.delete" || a.startsWith("enforcement.")) return "critical";
  if (a === "shop.storefront.suspend") return "critical";
  if (a.startsWith("moderation.") || a.startsWith("risk.") || a === "shop.slug.change") return "warning";
  if (a === "shop.storefront.unpublish") return "warning";
  return "info";
}

function auditTitle(action) {
  if (action === "shop.slug.change") return "Slug changed";
  if (action === "shop.storefront.publish") return "Storefront published";
  if (action === "shop.storefront.suspend") return "Storefront suspended";
  if (action === "shop.storefront.restore") return "Storefront restored";
  if (action === "shop.storefront.unpublish") return "Storefront unpublished";
  if (action === "shop.storefront.submit_review") return "Storefront submitted for review";
  return action || "Admin action";
}

function isStorefrontModerationAuditAction(action) {
  return String(action || "").startsWith("shop.storefront.");
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => toTime(b.occurredAt) - toTime(a.occurredAt));
}

async function fetchModerationTimeline(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT
        e.id,
        e.product_id AS productId,
        p.partName AS productName,
        e.old_status AS oldStatus,
        e.new_status AS newStatus,
        e.reject_reason AS rejectReason,
        e.created_at AS occurredAt,
        a.email AS moderatorEmail
      FROM product_moderation_events e
      INNER JOIN products p ON p.id = e.product_id
      LEFT JOIN admin a ON a.id = e.moderator_admin_id
      WHERE p.shopId = ?
      ORDER BY e.created_at DESC
      LIMIT 25
    `,
    [governanceShopId],
  );

  return (rows || []).map((r) => ({
    id: `moderation-${r.id}`,
    category: "moderation",
    title: moderationTitle(r),
    subtitle: r.productName ? String(r.productName).slice(0, 80) : null,
    actorLabel: r.moderatorEmail ? "Quản trị viên" : "Cửa hàng",
    severity: moderationSeverity(r),
    occurredAt: r.occurredAt,
    meta: {
      productId: r.productId,
      oldStatus: r.oldStatus,
      newStatus: r.newStatus,
      rejectReason: r.rejectReason,
    },
  }));
}

async function fetchSuspensionTimeline(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        case_id AS caseId,
        suspension_type AS suspensionType,
        reason,
        suspended_at AS suspendedAt,
        lifted_at AS liftedAt,
        lift_reason AS liftReason
      FROM admin_shop_suspensions
      WHERE shop_id = ?
      ORDER BY suspended_at DESC
      LIMIT 20
    `,
    [governanceShopId],
  );

  const entries = [];
  for (const r of rows || []) {
    entries.push({
      id: `suspension-${r.id}`,
      category: "suspension",
      title: "Shop bị đình chỉ (enforcement)",
      subtitle: r.reason ? String(r.reason).slice(0, 120) : null,
      actorLabel: "Enforcement",
      severity: "critical",
      occurredAt: r.suspendedAt,
      meta: { caseId: r.caseId, suspensionType: r.suspensionType },
    });
    if (r.liftedAt) {
      entries.push({
        id: `suspension-lift-${r.id}`,
        category: "suspension",
        title: "Shop được reinstate",
        subtitle: r.liftReason ? String(r.liftReason).slice(0, 120) : null,
        actorLabel: "Enforcement",
        severity: "info",
        occurredAt: r.liftedAt,
        meta: { caseId: r.caseId },
      });
    }
  }
  return entries;
}

async function fetchEnforcementTimeline(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        case_type AS caseType,
        severity,
        status,
        summary,
        resolution,
        created_at AS occurredAt,
        resolved_at AS resolvedAt
      FROM admin_enforcement_cases
      WHERE target_type = 'shop'
        AND target_id = ?
      ORDER BY created_at DESC
      LIMIT 15
    `,
    [governanceShopId],
  );

  return (rows || []).map((r) => ({
    id: `enforcement-${r.id}`,
    category: "enforcement",
    title: `Enforcement case · ${r.caseType || "case"}`,
    subtitle: r.summary ? String(r.summary).slice(0, 120) : null,
    actorLabel: "Enforcement",
    severity: r.severity === "critical" || r.severity === "high" ? "critical" : "warning",
    occurredAt: r.resolvedAt || r.occurredAt,
    meta: { caseId: r.id, status: r.status, resolution: r.resolution },
  }));
}

async function fetchNotesTimeline(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT id, content, pinned, author_id AS authorId, created_at AS occurredAt
      FROM admin_moderation_notes
      WHERE deleted_at IS NULL
        AND target_type = 'shop'
        AND target_id = ?
      ORDER BY created_at DESC
      LIMIT 15
    `,
    [governanceShopId],
  );

  return (rows || []).map((r) => ({
    id: `note-${r.id}`,
    category: "note",
    title: r.pinned ? "Ghi chú governance (ghim)" : "Ghi chú governance",
    subtitle: r.content ? String(r.content).slice(0, 140) : null,
    actorLabel: "Admin",
    severity: "info",
    occurredAt: r.occurredAt,
    meta: { noteId: r.id, pinned: !!r.pinned },
  }));
}

async function fetchSlugTimeline(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT id, old_slug AS oldSlug, new_slug AS newSlug, changed_at AS occurredAt
      FROM shop_slug_history
      WHERE shop_id = ?
      ORDER BY changed_at DESC
      LIMIT 10
    `,
    [governanceShopId],
  );

  return (rows || []).map((r) => ({
    id: `slug-${r.id}`,
    category: "slug",
    title: "Đổi slug storefront",
    subtitle: `${r.oldSlug} → ${r.newSlug}`,
    actorLabel: "Storefront",
    severity: "info",
    occurredAt: r.occurredAt,
    meta: { oldSlug: r.oldSlug, newSlug: r.newSlug },
  }));
}

async function fetchStorefrontTimeline(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT id, event_type AS eventType, occurred_at AS occurredAt
      FROM shop_storefront_events
      WHERE shop_id = ?
      ORDER BY occurred_at DESC
      LIMIT 12
    `,
    [governanceShopId],
  );

  const labels = {
    storefront_view: "Lượt xem storefront",
    phone_click: "Click gọi điện",
    zalo_click: "Click Zalo",
    rfq_cta_click: "Click RFQ CTA",
    product_click: "Click sản phẩm",
  };

  return (rows || []).map((r) => ({
    id: `storefront-${r.id}`,
    category: "storefront",
    title: labels[r.eventType] || `Storefront: ${r.eventType}`,
    subtitle: null,
    actorLabel: "Khách truy cập",
    severity: "info",
    occurredAt: r.occurredAt,
    meta: { eventType: r.eventType },
  }));
}

async function fetchAuditTrail(governanceShopId) {
  const [rows] = await pool.query(
    `
      SELECT
        aal.id,
        aal.action,
        aal.target_type AS targetType,
        aal.target_id AS targetId,
        aal.created_at AS occurredAt,
        a.email AS adminEmail
      FROM admin_audit_log aal
      LEFT JOIN admin a ON a.id = aal.admin_id
      WHERE (aal.target_type = 'shop' AND aal.target_id = ?)
         OR (aal.action LIKE 'shop.%' AND aal.target_id = ?)
         OR (aal.action LIKE 'enforcement.%' AND JSON_UNQUOTE(JSON_EXTRACT(aal.metadata_json, '$.shop_id')) = ?)
      ORDER BY aal.created_at DESC
      LIMIT 30
    `,
    [governanceShopId, governanceShopId, String(governanceShopId)],
  );

  return (rows || []).map((r) => ({
    id: `audit-${r.id}`,
    category: isStorefrontModerationAuditAction(r.action) ? "storefront" : "audit",
    title: auditTitle(r.action),
    subtitle: r.adminEmail || null,
    actorLabel: r.adminEmail ? "Admin" : "Hệ thống",
    severity: auditSeverity(r.action),
    occurredAt: r.occurredAt,
    meta: { action: r.action, targetType: r.targetType, targetId: r.targetId },
  }));
}

function lifecycleEntries(row) {
  const entries = [];
  if (row?.accountCreatedAt) {
    entries.push({
      id: "lifecycle-account",
      category: "shop",
      title: "Tài khoản shop đăng ký",
      subtitle: null,
      actorLabel: "Seller",
      severity: "info",
      occurredAt: row.accountCreatedAt,
      meta: {},
    });
  }
  if (row?.shopCreatedAt && row.shopCreatedAt !== row.accountCreatedAt) {
    entries.push({
      id: "lifecycle-shop",
      category: "shop",
      title: "Shop profile được tạo",
      subtitle: null,
      actorLabel: "Seller",
      severity: "info",
      occurredAt: row.shopCreatedAt,
      meta: {},
    });
  }
  if (row?.shopUpdatedAt) {
    entries.push({
      id: "lifecycle-updated",
      category: "shop",
      title: "Shop profile cập nhật",
      subtitle: null,
      actorLabel: "Seller",
      severity: "info",
      occurredAt: row.shopUpdatedAt,
      meta: {},
    });
  }
  return entries;
}

/**
 * Merge governance timeline + operational audit trail from existing tables.
 * @param {object} opts
 * @param {number|null} opts.governanceShopId shops.id
 * @param {object} opts.row detail SQL row
 * @param {import('./schemaCapabilities.js').SchemaCapabilities} opts.caps
 */
export async function buildGovernanceTimelineBundle({ governanceShopId, row, caps }) {
  const lifecycle = lifecycleEntries({
    accountCreatedAt: row?.accountCreatedAt,
    shopCreatedAt: row?.shopCreatedAt,
    shopUpdatedAt: row?.shopUpdatedAt,
  });

  if (!governanceShopId) {
    const timeline = sortEntries(lifecycle).slice(0, TIMELINE_LIMIT);
    return { timeline, auditTrail: [] };
  }

  const tasks = [];
  if (caps.hasModerationTimeline) tasks.push(fetchModerationTimeline(governanceShopId).catch(() => []));
  if (caps.hasAdminShopSuspensions) tasks.push(fetchSuspensionTimeline(governanceShopId).catch(() => []));
  if (caps.hasAdminEnforcement) tasks.push(fetchEnforcementTimeline(governanceShopId).catch(() => []));
  if (caps.hasAdminModerationNotes) tasks.push(fetchNotesTimeline(governanceShopId).catch(() => []));
  if (caps.hasShopSlugHistory) tasks.push(fetchSlugTimeline(governanceShopId).catch(() => []));
  if (caps.hasStorefrontEvents) tasks.push(fetchStorefrontTimeline(governanceShopId).catch(() => []));
  if (caps.hasAdminAuditLog) tasks.push(fetchAuditTrail(governanceShopId).catch(() => []));

  const chunks = await Promise.all(tasks);
  const flat = chunks.flat();
  const timeline = sortEntries([...lifecycle, ...flat]).slice(0, TIMELINE_LIMIT);

  const auditCategories = new Set(["audit", "enforcement", "suspension", "note", "storefront"]);
  const auditTrail = sortEntries(
    flat.filter(
      (e) =>
        auditCategories.has(e.category) &&
        (e.category !== "storefront" || isStorefrontModerationAuditAction(e.meta?.action)),
    ),
  ).slice(0, AUDIT_LIMIT);

  return { timeline, auditTrail };
}
