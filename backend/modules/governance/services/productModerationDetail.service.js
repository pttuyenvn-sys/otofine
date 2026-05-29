import { pool } from "../../../config/db.js";
import { getProductsColumnsResolved } from "../../../utils/productsTableColumns.server.js";
import {
  FLAG_WEIGHTS,
  computeProductRiskScore,
  scoreToPriorityLevel,
} from "./riskEvaluation.service.js";

const FLAG_LABELS = {
  LOW_IMAGE_COUNT: "Low image count",
  HIGH_REJECT_RATE: "High shop reject rate",
  DUPLICATE_PART_NUMBER: "Duplicate part number in shop",
  SUSPICIOUS_PRICE: "Suspicious price",
  NO_DESCRIPTION: "Missing or short description",
  NEW_SHOP_HIGH_VOLUME: "New shop high volume",
  TOO_MANY_PENDING: "Too many pending products",
};

function parseFlagsBlob(blob) {
  if (!blob) return [];
  return String(blob)
    .split("||")
    .filter(Boolean)
    .map((s) => {
      const [code, severity] = String(s).split("::");
      return { code, severity: severity || "low" };
    });
}

function priceSimilarity(a, b) {
  const pa = Number(a);
  const pb = Number(b);
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return "unknown";
  if (pa === pb) return "exact";
  const base = Math.max(pa, pb, 1);
  const diff = Math.abs(pa - pb) / base;
  if (diff <= 0.1) return "close";
  return "different";
}

function imageSimilarity(currentUrls, candidateUrls) {
  const a = new Set((currentUrls || []).filter(Boolean));
  const b = new Set((candidateUrls || []).filter(Boolean));
  if (!a.size || !b.size) return "none";
  for (const url of a) {
    if (b.has(url)) return "exact";
  }
  return "none";
}

function buildRiskExplanation({ flags, priorRejections }) {
  const breakdown = [];
  for (const f of flags) {
    const weight = Number(FLAG_WEIGHTS[f.code] || 0);
    if (weight <= 0) continue;
    breakdown.push({
      source: "flag",
      code: f.code,
      label: FLAG_LABELS[f.code] || f.code,
      severity: f.severity,
      points: weight,
    });
  }

  const rejects = Number(priorRejections || 0);
  const rejectPoints = rejects > 0 ? Math.min(50, rejects * 15) : 0;
  if (rejectPoints > 0) {
    breakdown.push({
      source: "reject_history",
      label: "Prior rejection history",
      points: rejectPoints,
      detail: `${rejects} prior rejection(s) × 15 (cap 50)`,
    });
  }

  const score = computeProductRiskScore({ flags, priorRejections: rejects });
  const priorityLevel = scoreToPriorityLevel(score);

  return {
    score,
    priorityLevel,
    flags: flags.map((f) => ({
      ...f,
      weight: Number(FLAG_WEIGHTS[f.code] || 0),
      label: FLAG_LABELS[f.code] || f.code,
    })),
    rejectHistory: {
      count: rejects,
      contribution: rejectPoints,
    },
    breakdown,
    summary:
      priorityLevel === "CRITICAL" || priorityLevel === "HIGH"
        ? `Score ${score} is ${priorityLevel} due to ${breakdown.length} risk factor(s).`
        : `Score ${score} (${priorityLevel}).`,
  };
}

async function fetchDuplicateCandidates({ productId, shopId, partNumber, price, imageUrls }) {
  const pn = String(partNumber || "").trim();
  if (!pn) {
    return { sameShop: [], otherShops: [] };
  }

  const cols = await getProductsColumnsResolved();

  const [sameShopRows] = await pool.query(
    `
      SELECT
        p.id AS productId,
        ${cols.nameSqlSelect("p")},
        ${cols.priceSqlSelect("p")},
        p.moderation_status AS moderationStatus,
        sh.name AS shopName,
        (
          SELECT pi.url FROM product_images pi
          WHERE pi.productId = p.id
          ORDER BY pi.isPrimary DESC, pi.id ASC LIMIT 1
        ) AS thumbnailUrl,
        (
          SELECT GROUP_CONCAT(pi2.url ORDER BY pi2.isPrimary DESC, pi2.id ASC SEPARATOR '||')
          FROM product_images pi2 WHERE pi2.productId = p.id
        ) AS images_blob
      FROM products p
      LEFT JOIN shops sh ON ${cols.shopJoinOn("p", "sh")}
      WHERE p.shopId = ? AND ${cols.partNumberExpr("p")} = ? AND p.id <> ?
      ORDER BY p.id DESC
      LIMIT 5
    `,
    [shopId, pn, productId],
  );

  const [otherShopRows] = await pool.query(
    `
      SELECT
        p.id AS productId,
        p.shopId,
        ${cols.nameSqlSelect("p")},
        ${cols.priceSqlSelect("p")},
        p.moderation_status AS moderationStatus,
        sh.name AS shopName,
        (
          SELECT pi.url FROM product_images pi
          WHERE pi.productId = p.id
          ORDER BY pi.isPrimary DESC, pi.id ASC LIMIT 1
        ) AS thumbnailUrl,
        (
          SELECT GROUP_CONCAT(pi2.url ORDER BY pi2.isPrimary DESC, pi2.id ASC SEPARATOR '||')
          FROM product_images pi2 WHERE pi2.productId = p.id
        ) AS images_blob
      FROM products p
      LEFT JOIN shops sh ON ${cols.shopJoinOn("p", "sh")}
      WHERE ${cols.partNumberExpr("p")} = ? AND p.shopId <> ? AND p.id <> ?
      ORDER BY p.id DESC
      LIMIT 5
    `,
    [pn, shopId, productId],
  );

  function mapCandidate(row, sameShop) {
    const imgs = row.images_blob ? String(row.images_blob).split("||").filter(Boolean) : [];
    return {
      productId: row.productId,
      shopId: row.shopId ?? shopId,
      partName: row.partName,
      shopName: row.shopName,
      price: row.price,
      moderationStatus: row.moderationStatus,
      thumbnailUrl: row.thumbnailUrl,
      images: imgs,
      similarities: {
        partNumber: true,
        price: priceSimilarity(price, row.price),
        image: imageSimilarity(imageUrls, imgs),
        sameShop,
      },
    };
  }

  return {
    sameShop: (sameShopRows || []).map((r) => mapCandidate(r, true)),
    otherShops: (otherShopRows || []).map((r) => mapCandidate(r, false)),
  };
}

export async function getProductModerationDetail(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const cols = await getProductsColumnsResolved();

  const [[row]] = await pool.query(
    `
      SELECT
        p.id,
        ${cols.nameSqlSelect("p")},
        ${cols.partNumberSqlSelect("p")},
        ${cols.priceSqlSelect("p")},
        ${cols.stockSqlSelect("p")},
        ${cols.descriptionSqlSelect("p")},
        p.moderation_status AS moderationStatus,
        ${cols.shopIdSqlSelect("p")},
        ${cols.orderExprQualified("p")} AS createdAt,
        sh.name AS shopName,
        sh.slug AS shopSlug,
        sh.public_status AS shopPublicStatus,
        (
          SELECT COUNT(*) FROM product_images pi2 WHERE pi2.productId = p.id
        ) AS imageCount,
        (
          SELECT GROUP_CONCAT(pi4.url ORDER BY pi4.isPrimary DESC, pi4.id ASC SEPARATOR '||')
          FROM product_images pi4 WHERE pi4.productId = p.id
        ) AS images_blob,
        (
          SELECT GROUP_CONCAT(rf.flag_code, '::', rf.severity SEPARATOR '||')
          FROM product_risk_flags rf WHERE rf.product_id = p.id
        ) AS flags_blob,
        (
          SELECT COUNT(*) FROM product_moderation_events e2
          WHERE e2.product_id = p.id AND e2.new_status = 'rejected'
        ) AS productRejectCount
      FROM products p
      LEFT JOIN shops sh ON ${cols.shopJoinOn("p", "sh")}
      WHERE p.id = ?
      LIMIT 1
    `,
    [id],
  );

  if (!row) return null;

  const images = row.images_blob ? String(row.images_blob).split("||").filter(Boolean) : [];
  const flags = parseFlagsBlob(row.flags_blob);
  const priorRejections = Number(row.productRejectCount || 0);
  const risk = buildRiskExplanation({ flags, priorRejections });

  const [[shopModeration]] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'pending_review' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM products p
      WHERE p.shopId = ?
    `,
    [row.shopId],
  );

  const [timeline] = await pool.query(
    `
      SELECT
        e.id,
        e.product_id AS productId,
        e.moderator_admin_id AS moderatorAdminId,
        a.email AS moderatorEmail,
        e.old_status AS oldStatus,
        e.new_status AS newStatus,
        e.reject_reason AS rejectReason,
        e.notes AS notes,
        e.created_at AS createdAt
      FROM product_moderation_events e
      LEFT JOIN admin a ON a.id = e.moderator_admin_id
      WHERE e.product_id = ?
      ORDER BY e.created_at DESC
      LIMIT 50
    `,
    [id],
  );

  const duplicates = await fetchDuplicateCandidates({
    productId: id,
    shopId: row.shopId,
    partNumber: row.partNumber,
    price: row.price,
    imageUrls: images,
  });

  return {
    product: {
      id: row.id,
      partName: row.partName,
      partNumber: row.partNumber,
      price: row.price,
      stock: row.stock,
      description: row.description,
      moderationStatus: row.moderationStatus,
      shopId: row.shopId,
      shopName: row.shopName,
      createdAt: row.createdAt,
      images,
      imageCount: Number(row.imageCount || images.length || 0),
      thumbnailUrl: images[0] || null,
    },
    shop: {
      id: row.shopId,
      name: row.shopName,
      slug: row.shopSlug,
      publicStatus: row.shopPublicStatus,
      moderation: shopModeration || { pending: 0, approved: 0, rejected: 0 },
    },
    risk,
    timeline: timeline || [],
    duplicates,
  };
}
