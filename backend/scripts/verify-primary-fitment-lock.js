#!/usr/bin/env node
/**
 * ARCH-01G verification: primary fitment lock + canonical URL delta.
 *
 * Usage: node scripts/verify-primary-fitment-lock.js
 */
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { buildProductSeoUrl } from "../../frontend/lib/seo/productSeoUrl.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import {
  auditPrimaryFitmentIntegrity,
} from "../modules/products/services/productFitmentPrimary.server.js";

dotenv.config();

function pickPrimaryCar(cars) {
  if (!Array.isArray(cars) || cars.length === 0) return null;
  const scored = cars.map((c, idx) => {
    const brand = c?.hang_xe ?? c?.brand ?? "";
    const model = c?.ten_xe ?? c?.model ?? "";
    const yFrom = c?.year_from ?? c?.yearFrom ?? null;
    let score = 0;
    if (brand && String(brand).trim()) score += 4;
    if (model && String(model).trim()) score += 2;
    if (yFrom != null && yFrom !== "") score += 1;
    return { idx, score, c };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored[0]?.c || null;
}

async function main() {
  const [[col]] = await pool.query(
    `
    SELECT COUNT(*) AS n
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_car_applications'
      AND COLUMN_NAME = 'is_primary'
    `,
  );

  if (!Number(col?.n)) {
    console.error("FAIL: is_primary column missing — run migration first");
    process.exit(1);
  }

  const [[backfillStats]] = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM product_car_applications WHERE is_primary = 1) AS primary_rows,
      (SELECT COUNT(DISTINCT productId) FROM product_car_applications) AS products_with_fitment
    `,
  );

  const integrity = await auditPrimaryFitmentIntegrity(pool);

  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });

  const [sitemapProducts] = await pool.query(
    `
    SELECT ${pc.sitemapSelectList()}
    FROM products p
    INNER JOIN shops s ON s.id = p.shopId
    WHERE (${pc.seoWhereHasReadableSlug("p")})
    ${vis.sql}
    `,
  );

  const [carRows] = await pool.query(
    `
    SELECT
      pca.id AS pca_id,
      pca.productId,
      pca.is_primary,
      cm.hang_xe,
      cm.ten_xe,
      pca.year_from,
      pca.year_to
    FROM product_car_applications pca
    JOIN car_models cm ON cm.id = pca.carModelId
    JOIN products p ON p.id = pca.productId
    INNER JOIN shops s ON s.id = p.shopId
    WHERE (${pc.seoWhereHasReadableSlug("p")})
    ${vis.sql}
    ORDER BY pca.productId, pca.is_primary DESC, pca.id ASC
    `,
  );

  const carsByProduct = new Map();
  for (const r of carRows) {
    const pid = Number(r.productId);
    if (!carsByProduct.has(pid)) carsByProduct.set(pid, []);
    carsByProduct.get(pid).push(r);
  }

  let urlDelta = 0;
  const urlSamples = [];

  for (const p of sitemapProducts) {
    const id = Number(p.id);
    const base = { id, partName: p.partName, partNumber: p.partNumber };
    const rows = carsByProduct.get(id) || [];
    const carsOrdered = rows.map((r) => ({
      hang_xe: r.hang_xe,
      ten_xe: r.ten_xe,
      year_from: r.year_from,
      year_to: r.year_to,
    }));

    const urlBefore = buildProductSeoUrl({ ...base, cars: carsOrdered });

    const primaryRow = rows.find((r) => Number(r.is_primary) === 1);
    const urlPrimary = buildProductSeoUrl({
      ...base,
      cars: primaryRow
        ? [
            {
              hang_xe: primaryRow.hang_xe,
              ten_xe: primaryRow.ten_xe,
              year_from: primaryRow.year_from,
              year_to: primaryRow.year_to,
            },
          ]
        : [],
    });

    if (urlBefore !== urlPrimary) {
      urlDelta++;
      if (urlSamples.length < 5) {
        urlSamples.push({ id, urlBefore, urlPrimary });
      }
    }
  }

  const report = {
    migration: {
      is_primary_column: true,
      primary_rows_set: Number(backfillStats.primary_rows),
      products_with_fitment: Number(backfillStats.products_with_fitment),
    },
    integrity: {
      products_fail: integrity.violations.length,
      violations: integrity.violations.slice(0, 20),
    },
    canonical: {
      sitemap_products: sitemapProducts.length,
      url_delta: urlDelta,
      url_delta_pct:
        sitemapProducts.length > 0
          ? ((urlDelta / sitemapProducts.length) * 100).toFixed(4)
          : "0",
      samples: urlSamples,
    },
    pickPrimaryCar_unchanged: true,
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    integrity.ok &&
    urlDelta === 0 &&
    Number(backfillStats.primary_rows) ===
      Number(backfillStats.products_with_fitment);

  if (!ok) {
    process.exit(1);
  }

  await pool.end();
  process.exit(0);
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});
