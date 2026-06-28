import { pool } from "../../../../config/db.js";
import { getProductsColumnsResolved } from "../../../../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../../../../modules/products/services/productPublicVisibility.server.js";

const MAX_EXPORT_ROWS = 20000;

function parseDateParam(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function coverageRate(withImages, total) {
  if (!total) return 0;
  return Math.round((withImages / total) * 1000) / 10;
}

function coverageStatus(rate) {
  if (rate >= 95) return "GREEN";
  if (rate >= 90) return "YELLOW";
  return "RED";
}

/**
 * @param {{ shopId?: number, dateFrom?: Date | null, dateTo?: Date | null, status?: string }} filters
 */
function buildProductDateFilter(pc, filters, params) {
  const parts = [];
  const expr = pc.orderExprQualified("p");

  if (filters.dateFrom) {
    parts.push(`${expr} >= ?`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    parts.push(`${expr} < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(filters.dateTo);
  }
  return parts.length ? ` AND ${parts.join(" AND ")}` : "";
}

/**
 * @param {string | undefined} status
 * @param {number} rate
 */
function matchesStatusFilter(status, rate) {
  if (!status) return true;
  const normalized = String(status).trim().toUpperCase();
  const bucket = coverageStatus(rate);
  return bucket === normalized;
}

/**
 * @param {{ shopId?: number, dateFrom?: string, dateTo?: string, status?: string }} query
 */
export async function getImageCoverageReport(query = {}) {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");
  const partNameExpr = pc.partNameExpr("p");
  const createdSelect = `${pc.orderExprQualified("p")} AS createdAt`;

  const filters = {
    shopId: query.shopId ? Number(query.shopId) : null,
    dateFrom: parseDateParam(query.dateFrom),
    dateTo: parseDateParam(query.dateTo),
    status: query.status || "",
  };

  const params = [...vis.params];
  let extraWhere = buildProductDateFilter(pc, filters, params);
  if (filters.shopId && Number.isFinite(filters.shopId)) {
    extraWhere += ` AND ${pc.shopIdExpr("p")} = ?`;
    params.push(filters.shopId);
  }

  const [shopRows] = await pool.query(
    `
    SELECT
      s.id AS shopId,
      s.accountId AS sellerId,
      s.name AS shopName,
      COUNT(DISTINCT ${pid}) AS productCount,
      COUNT(DISTINCT CASE
        WHEN pi.productId IS NOT NULL AND TRIM(pi.url) <> '' THEN ${pid}
      END) AS withImages
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN product_images pi ON pi.productId = ${pid}
    WHERE 1=1 ${vis.sql}${extraWhere}
    GROUP BY s.id, s.accountId, s.name
    HAVING productCount > 0
    `,
    params,
  );

  let sellers = shopRows.map((row) => {
    const productCount = Number(row.productCount) || 0;
    const withImages = Number(row.withImages) || 0;
    const withoutImages = productCount - withImages;
    const rate = coverageRate(withImages, productCount);
    return {
      sellerId: row.sellerId ?? null,
      shopId: Number(row.shopId),
      shopName: row.shopName || "",
      productCount,
      withImages,
      withoutImages,
      coverageRate: rate,
      status: coverageStatus(rate),
    };
  });

  if (filters.status) {
    sellers = sellers.filter((row) => matchesStatusFilter(filters.status, row.coverageRate));
  }

  sellers.sort(
    (a, b) =>
      b.withoutImages - a.withoutImages ||
      a.coverageRate - b.coverageRate ||
      a.shopName.localeCompare(b.shopName, "vi"),
  );

  const totals = sellers.reduce(
    (acc, row) => {
      acc.products += row.productCount;
      acc.withImages += row.withImages;
      acc.withoutImages += row.withoutImages;
      return acc;
    },
    { products: 0, withImages: 0, withoutImages: 0 },
  );

  totals.imageCoverageRate = coverageRate(totals.withImages, totals.products);

  return {
    totals,
    sellers,
    filters: {
      shopId: filters.shopId,
      dateFrom: filters.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : null,
      dateTo: filters.dateTo ? filters.dateTo.toISOString().slice(0, 10) : null,
      status: filters.status || null,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * @param {number} shopId
 * @param {{ missingOnly?: boolean, dateFrom?: string, dateTo?: string }} query
 */
export async function getShopImageCoverageProducts(shopId, query = {}) {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");
  const partNameExpr = pc.partNameExpr("p");
  const createdSelect = `${pc.orderExprQualified("p")} AS createdAt`;

  const filters = {
    dateFrom: parseDateParam(query.dateFrom),
    dateTo: parseDateParam(query.dateTo),
    missingOnly: query.missingOnly === "1" || query.missingOnly === "true",
  };

  const params = [...vis.params, shopId];
  let extraWhere = buildProductDateFilter(pc, filters, params);

  const [rows] = await pool.query(
    `
    SELECT
      ${pid} AS productId,
      ${partNameExpr} AS partName,
      p.partNumber AS partNumber,
      ${createdSelect},
      s.id AS shopId,
      s.accountId AS sellerId,
      s.name AS shopName,
      COUNT(pi.id) AS imageCount,
      MAX(CASE WHEN pi.url IS NOT NULL AND TRIM(pi.url) <> '' THEN 1 ELSE 0 END) AS hasMainImage,
      MAX(CASE WHEN pi.url IS NOT NULL AND TRIM(pi.url) <> '' THEN pi.url END) AS mainImageUrl
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN product_images pi ON pi.productId = ${pid}
    WHERE ${pc.shopIdExpr("p")} = ? ${vis.sql}${extraWhere}
    GROUP BY ${pid}, ${partNameExpr}, p.partNumber, createdAt, s.id, s.accountId, s.name
    ORDER BY hasMainImage ASC, productId DESC
    `,
    params,
  );

  const products = rows
    .map((row) => {
      const imageCount = Number(row.imageCount) || 0;
      const hasMainImage = Number(row.hasMainImage) === 1;
      const mainImageUrl = String(row.mainImageUrl || "").trim();
      const partName = String(row.partName || "").trim();
      const partNumber = String(row.partNumber || "").trim();
      return {
        productId: Number(row.productId),
        productName: partName || "Sản phẩm",
        partNumber: partNumber || null,
        createdAt: row.createdAt || null,
        sellerId: row.sellerId ?? null,
        shopId: Number(row.shopId),
        shopName: row.shopName || "",
        imageCount,
        missingMainImage: !hasMainImage,
        missingThumbnail: hasMainImage && !/\.webp(\?|$)/i.test(mainImageUrl),
        missingAlt: !partName && !partNumber,
      };
    })
    .filter((row) => (filters.missingOnly ? row.missingMainImage : true));

  return { shopId, products };
}

/**
 * @param {{ shopId?: number, dateFrom?: string, dateTo?: string, status?: string }} query
 */
export async function exportMissingImageProductsCsv(query = {}) {
  const report = await getImageCoverageReport(query);
  const shopIds =
    query.shopId != null
      ? [Number(query.shopId)]
      : report.sellers.filter((s) => s.withoutImages > 0).map((s) => s.shopId);

  /** @type {Array<Record<string, unknown>>} */
  const lines = [];

  for (const shopId of shopIds) {
    const { products } = await getShopImageCoverageProducts(shopId, {
      missingOnly: true,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    for (const p of products) {
      lines.push(p);
      if (lines.length >= MAX_EXPORT_ROWS) break;
    }
    if (lines.length >= MAX_EXPORT_ROWS) break;
  }

  const header = [
    "productId",
    "productName",
    "partNumber",
    "createdAt",
    "sellerId",
    "shopId",
    "shopName",
    "imageCount",
    "missingMainImage",
    "missingThumbnail",
    "missingAlt",
  ];

  const csvRows = [header.join(",")];
  for (const row of lines) {
    csvRows.push(
      [
        row.productId,
        csvEscape(row.productName),
        csvEscape(row.partNumber || ""),
        row.createdAt ? new Date(row.createdAt).toISOString() : "",
        row.sellerId ?? "",
        row.shopId,
        csvEscape(row.shopName),
        row.imageCount,
        row.missingMainImage ? 1 : 0,
        row.missingThumbnail ? 1 : 0,
        row.missingAlt ? 1 : 0,
      ].join(","),
    );
  }

  return {
    csv: `${csvRows.join("\n")}\n`,
    rowCount: lines.length,
    totals: report.totals,
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Validate sum(shop.withoutImages) === global withoutImages
 */
export async function validateImageCoverageParity() {
  const report = await getImageCoverageReport();
  const sumShopMissing = report.sellers.reduce((n, s) => n + s.withoutImages, 0);
  return {
    ok: sumShopMissing === report.totals.withoutImages,
    sumShopMissing,
    globalWithoutImages: report.totals.withoutImages,
    totals: report.totals,
    topWorst: report.sellers.slice(0, 20),
  };
}
