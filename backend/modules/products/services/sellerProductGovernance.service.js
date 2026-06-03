import { pool } from "../../../config/db.js";
import { getSchemaCapabilities } from "../../../utils/schemaCapabilities.js";

/** Vietnamese reject reason labels for sellers */
export const SELLER_REJECT_REASON_LABELS = {
  counterfeit: "Hàng giả / nhái",
  duplicate: "Trùng lặp sản phẩm",
  prohibited: "Hàng cấm",
  wrong_category: "Sai danh mục",
  poor_images: "Ảnh sản phẩm kém",
  insufficient_info: "Thiếu thông tin",
  misleading: "Thông tin gây hiểu lầm",
  spam: "Rao vặt / spam",
  other: "Khác",
};

/** Seller-visible lifecycle state metadata */
export const SELLER_LIFECYCLE_META = {
  pending_review: { label: "Chờ duyệt", color: "#92400e", bg: "#fef3c7", border: "#fde68a" },
  published: { label: "Đang bán", color: "#166534", bg: "#dcfce7", border: "#bbf7d0" },
  rejected: { label: "Bị từ chối", color: "#991b1b", bg: "#fee2e2", border: "#fecaca" },
  hidden: { label: "Đã ẩn", color: "#374151", bg: "#e5e7eb", border: "#d1d5db" },
  archived: { label: "Lưu trữ", color: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
  deleted: { label: "Đã xóa", color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
  out_of_stock: { label: "Hết hàng", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  draft: { label: "Nháp", color: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
};

export const VISIBILITY_META = {
  public: { label: "Hiển thị công khai", color: "#166534", bg: "#ecfdf5", border: "#bbf7d0" },
  hidden: { label: "Không hiển thị", color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
};

export function normalizeModerationStatus(raw) {
  if (raw == null || String(raw).trim() === "") return "approved";
  const ms = String(raw).trim().toLowerCase();
  if (ms === "published" || ms === "active") return "approved";
  return ms;
}

/**
 * Resolve seller-facing lifecycle key from product row.
 */
export function resolveSellerLifecycle({ moderationStatus, stock, sellerDeletedAt }) {
  if (sellerDeletedAt) return "deleted";
  const ms = normalizeModerationStatus(moderationStatus);
  if (ms === "deleted") return "deleted";
  if (ms === "approved") {
    return Number(stock || 0) > 0 ? "published" : "out_of_stock";
  }
  if (ms === "archived" || ms === "draft") return "archived";
  if (SELLER_LIFECYCLE_META[ms]) return ms;
  return "draft";
}

export function resolvePublicVisibility({ moderationStatus, stock, shopPublicStatus }) {
  const ms = normalizeModerationStatus(moderationStatus);
  const shopOk = String(shopPublicStatus || "").trim().toLowerCase() === "public";
  const approvedLike = ms === "approved";
  const visible = shopOk && approvedLike && Number(stock || 0) > 0;
  return visible ? "public" : "hidden";
}

/** Backward-compatible seller governance schema probe. */
export async function getSellerGovernanceSchema() {
  const caps = await getSchemaCapabilities();
  return { hasSellerDeletedAt: caps.hasSellerDeletedAt };
}

/** SQL expression: legacy NULL/empty/published/active → approved for filters. */
export function normalizedModerationStatusExpr(alias = "p") {
  return `(CASE
    WHEN ${alias}.moderation_status IS NULL OR TRIM(${alias}.moderation_status) = '' THEN 'approved'
    WHEN LOWER(TRIM(${alias}.moderation_status)) IN ('published', 'active') THEN 'approved'
    ELSE LOWER(TRIM(${alias}.moderation_status))
  END)`;
}

export function sqlNotSellerDeleted(hasSellerDeletedAt, alias = "p") {
  return hasSellerDeletedAt ? `${alias}.seller_deleted_at IS NULL` : "1=1";
}

export function sqlSellerDeletedAtSelect(hasSellerDeletedAt, alias = "p") {
  return hasSellerDeletedAt
    ? `${alias}.seller_deleted_at AS sellerDeletedAt`
    : "NULL AS sellerDeletedAt";
}

export function enrichProductGovernance(row, shopPublicStatus) {
  const lifecycle = resolveSellerLifecycle(row);
  const visibility = resolvePublicVisibility({
    moderationStatus: row.moderationStatus,
    stock: row.stock,
    shopPublicStatus,
  });
  return {
    moderationStatus: normalizeModerationStatus(row.moderationStatus),
    sellerLifecycle: lifecycle,
    lifecycleMeta: SELLER_LIFECYCLE_META[lifecycle] || SELLER_LIFECYCLE_META.draft,
    visibility,
    visibilityMeta: VISIBILITY_META[visibility],
    isPubliclyVisible: visibility === "public",
    lastRejectReason: row.lastRejectReason || null,
    lastRejectReasonLabel: row.lastRejectReason
      ? (SELLER_REJECT_REASON_LABELS[row.lastRejectReason] || row.lastRejectReason)
      : null,
    lastRejectNotes: row.lastRejectNotes || null,
    lastRejectedAt: row.lastRejectedAt || null,
    sellerDeletedAt: row.sellerDeletedAt || null,
  };
}

/**
 * SQL lifecycle filter fragments for seller product list.
 * @param {{ hasSellerDeletedAt?: boolean }} schema
 */
export function buildLifecycleFilterSql(lifecycle, schema = {}) {
  const hasSellerDeletedAt = Boolean(schema.hasSellerDeletedAt);
  const key = String(lifecycle || "all").trim().toLowerCase();
  const nd = sqlNotSellerDeleted(hasSellerDeletedAt);
  const ms = normalizedModerationStatusExpr("p");

  switch (key) {
    case "published":
      return `(${nd} AND ${ms} = 'approved' AND COALESCE(p.stock, 0) > 0)`;
    case "pending_review":
      return `(${nd} AND ${ms} = 'pending_review')`;
    case "rejected":
      return `(${nd} AND ${ms} = 'rejected')`;
    case "hidden":
      return `(${nd} AND ${ms} = 'hidden')`;
    case "archived":
      return `(${nd} AND ${ms} IN ('draft', 'archived'))`;
    case "deleted":
      if (!hasSellerDeletedAt) {
        return `(${ms} = 'deleted')`;
      }
      return `(p.seller_deleted_at IS NOT NULL OR ${ms} = 'deleted')`;
    case "all":
    default:
      return `(${nd} AND ${ms} NOT IN ('deleted'))`;
  }
}

export async function getShopPublicStatus(shopId) {
  const [[row]] = await pool.query(
    `SELECT public_status AS publicStatus FROM shops WHERE id = ? LIMIT 1`,
    [shopId],
  );
  return row?.publicStatus || null;
}

export async function getShopGovernanceStats(shopId) {
  const schema = await getSellerGovernanceSchema();
  const nd = sqlNotSellerDeleted(schema.hasSellerDeletedAt);
  const ms = normalizedModerationStatusExpr("p");
  const deletedCase = schema.hasSellerDeletedAt
    ? `(p.seller_deleted_at IS NOT NULL OR ${ms} = 'deleted')`
    : `(${ms} = 'deleted')`;
  const allCase = `(${nd} AND ${ms} NOT IN ('deleted'))`;

  const [[row]] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN ${allCase} THEN 1 ELSE 0 END) AS all_count,
        SUM(CASE WHEN ${nd} AND ${ms} = 'approved' AND COALESCE(p.stock,0) > 0 THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN ${nd} AND ${ms} = 'pending_review' THEN 1 ELSE 0 END) AS pending_review,
        SUM(CASE WHEN ${nd} AND ${ms} = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN ${nd} AND ${ms} = 'hidden' THEN 1 ELSE 0 END) AS hidden,
        SUM(CASE WHEN ${nd} AND ${ms} IN ('draft','archived') THEN 1 ELSE 0 END) AS archived,
        SUM(CASE WHEN ${deletedCase} THEN 1 ELSE 0 END) AS deleted
      FROM products p
      WHERE p.shopId = ?
    `,
    [shopId],
  );
  return {
    all: Number(row?.all_count || 0),
    published: Number(row?.published || 0),
    pending_review: Number(row?.pending_review || 0),
    rejected: Number(row?.rejected || 0),
    hidden: Number(row?.hidden || 0),
    archived: Number(row?.archived || 0),
    deleted: Number(row?.deleted || 0),
  };
}

const STATUS_LABELS_VI = {
  draft: "Nháp",
  pending_review: "Gửi duyệt",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
  hidden: "Đã ẩn",
  archived: "Lưu trữ",
  deleted: "Đã xóa",
};

function timelineActorLabel(row) {
  if (row.moderatorAdminId) return "Quản trị viên";
  if (row.newStatus === "pending_review" && !row.moderatorAdminId) return "Cửa hàng";
  return "Hệ thống";
}

function timelineTitle(row) {
  const ns = normalizeModerationStatus(row.newStatus);
  const os = normalizeModerationStatus(row.oldStatus);
  if (ns === "pending_review" && (!os || os === "draft")) return "Gửi duyệt";
  if (ns === "approved") return "Đã duyệt";
  if (ns === "rejected") return "Bị từ chối";
  if (ns === "hidden") return "Ẩn bởi quản trị";
  if (ns === "archived") return "Lưu trữ";
  if (ns === "deleted") return "Đã xóa";
  return STATUS_LABELS_VI[ns] || ns;
}

export async function getSellerProductTimeline(productId, shopId) {
  const schema = await getSellerGovernanceSchema();
  const deletedCol = schema.hasSellerDeletedAt
    ? "seller_deleted_at AS sellerDeletedAt"
    : "NULL AS sellerDeletedAt";

  const [[product]] = await pool.query(
    `
      SELECT id, shopId, partName, createdAt, moderation_status AS moderationStatus, ${deletedCol}
      FROM products WHERE id = ? AND shopId = ?
    `,
    [productId, shopId],
  );
  if (!product) return null;

  const [events] = await pool.query(
    `
      SELECT
        e.id,
        e.product_id AS productId,
        e.moderator_admin_id AS moderatorAdminId,
        e.old_status AS oldStatus,
        e.new_status AS newStatus,
        e.reject_reason AS rejectReason,
        e.notes AS notes,
        e.created_at AS createdAt
      FROM product_moderation_events e
      WHERE e.product_id = ?
      ORDER BY e.created_at DESC
      LIMIT 50
    `,
    [productId],
  );

  const rows = (events || []).map((e) => ({
    id: e.id,
    title: timelineTitle(e),
    actorLabel: timelineActorLabel(e),
    oldStatus: e.oldStatus,
    newStatus: e.newStatus,
    rejectReason: e.rejectReason,
    rejectReasonLabel: e.rejectReason ? (SELLER_REJECT_REASON_LABELS[e.rejectReason] || e.rejectReason) : null,
    notes: e.notes,
    createdAt: e.createdAt,
  }));

  rows.push({
    id: `created-${product.id}`,
    title: "Tạo sản phẩm",
    actorLabel: "Cửa hàng",
    oldStatus: null,
    newStatus: "draft",
    rejectReason: null,
    rejectReasonLabel: null,
    notes: null,
    createdAt: product.createdAt,
  });

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    product: {
      id: product.id,
      partName: product.partName,
      moderationStatus: normalizeModerationStatus(product.moderationStatus),
      sellerDeletedAt: product.sellerDeletedAt,
    },
    rows,
  };
}

/**
 * Seller resubmit for review — idempotent when already pending_review.
 */
export async function resubmitProductForReview(productId, shopId, { note } = {}) {
  const schema = await getSellerGovernanceSchema();
  const deletedCol = schema.hasSellerDeletedAt
    ? "seller_deleted_at AS sellerDeletedAt"
    : "NULL AS sellerDeletedAt";

  const [[product]] = await pool.query(
    `
      SELECT id, moderation_status AS moderationStatus, ${deletedCol}
      FROM products WHERE id = ? AND shopId = ?
    `,
    [productId, shopId],
  );
  if (!product) return { ok: false, error: "not_found" };
  if (product.sellerDeletedAt) return { ok: false, error: "product_deleted" };

  const current = normalizeModerationStatus(product.moderationStatus);
  if (current === "pending_review") {
    return { ok: true, moderationStatus: "pending_review", alreadyPending: true };
  }

  const allowedFrom = new Set(["rejected", "draft", "archived", "hidden"]);
  if (!allowedFrom.has(current)) {
    return { ok: false, error: "invalid_status", currentStatus: current };
  }

  await pool.query(
    `UPDATE products SET moderation_status = 'pending_review' WHERE id = ? AND shopId = ?`,
    [productId, shopId],
  );

  await pool.query(
    `
      INSERT INTO product_moderation_events
        (product_id, moderator_admin_id, old_status, new_status, reject_reason, notes)
      VALUES (?, NULL, ?, 'pending_review', NULL, ?)
    `,
    [productId, current, note || null],
  );

  return { ok: true, moderationStatus: "pending_review", alreadyPending: false };
}
