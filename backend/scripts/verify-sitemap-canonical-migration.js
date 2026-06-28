#!/usr/bin/env node
/**
 * ARCH-01J.1: sitemap old buildProductSeoUrl vs new canonicalPath consumer.
 *
 * Usage: node scripts/verify-sitemap-canonical-migration.js
 */
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { buildProductSeoUrl } from "../../frontend/lib/seo/productSeoUrl.js";
import { buildCanonicalFields } from "../modules/products/services/canonicalPath.server.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";

dotenv.config();

function legacySitemapPath(product, id) {
  return buildProductSeoUrl({
    id,
    partName: product.partName,
    partNumber: product.partNumber,
    cars: product.cars,
  });
}

function newSitemapPath(product, id) {
  const cp = String(product?.canonicalPath ?? "").trim();
  if (cp.startsWith("/")) return cp;
  return legacySitemapPath(product, id);
}

async function main() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });

  const [products] = await pool.query(
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
      pca.productId,
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
    carsByProduct.get(pid).push({
      hang_xe: r.hang_xe,
      ten_xe: r.ten_xe,
      year_from: r.year_from,
      year_to: r.year_to,
    });
  }

  const oldUrls = new Set();
  const newUrls = new Set();
  let productsChecked = 0;
  let productsEmittedOld = 0;
  let productsEmittedNew = 0;
  let pathMatches = 0;
  let pathMismatches = 0;
  let canonicalPathUsed = 0;
  let fallbackUsed = 0;
  const mismatchSamples = [];

  for (const p of products) {
    const m = String(p?.slug || "").match(/(\d+)$/);
    const id =
      p?.id != null && p.id !== ""
        ? Number(p.id)
        : m
          ? Number(m[1])
          : null;
    if (!Number.isFinite(id) || id <= 0) continue;

    productsChecked++;
    const cars = carsByProduct.get(id) || [];
    const enriched = {
      ...p,
      cars,
      ...buildCanonicalFields(
        { id, partName: p.partName, partNumber: p.partNumber },
        cars,
      ),
    };

    const oldPath = legacySitemapPath(enriched, id);
    const newPath = newSitemapPath(enriched, id);

    if (String(enriched.canonicalPath ?? "").trim().startsWith("/")) {
      canonicalPathUsed++;
    } else {
      fallbackUsed++;
    }

    if (oldPath && oldPath !== "/") {
      oldUrls.add(oldPath);
      productsEmittedOld++;
    }
    if (newPath && newPath !== "/") {
      newUrls.add(newPath);
      productsEmittedNew++;
    }

    if (oldPath === newPath) {
      pathMatches++;
    } else {
      pathMismatches++;
      if (mismatchSamples.length < 10) {
        mismatchSamples.push({
          id,
          oldPath,
          newPath,
          canonicalPath: enriched.canonicalPath,
        });
      }
    }
  }

  const missingInNew = [...oldUrls].filter((u) => !newUrls.has(u));
  const extraInNew = [...newUrls].filter((u) => !oldUrls.has(u));

  const report = {
    products_checked: productsChecked,
    products_emitted_old: productsEmittedOld,
    products_emitted_new: productsEmittedNew,
    path_matches: pathMatches,
    path_mismatches: pathMismatches,
    canonical_path_used: canonicalPathUsed,
    fallback_used: fallbackUsed,
    url_set: {
      old_count: oldUrls.size,
      new_count: newUrls.size,
      missing_in_new: missingInNew.length,
      extra_in_new: extraInNew.length,
      delta: missingInNew.length + extraInNew.length,
    },
    mismatch_samples: mismatchSamples,
    missing_samples: missingInNew.slice(0, 5),
    extra_samples: extraInNew.slice(0, 5),
  };

  console.log(JSON.stringify(report, null, 2));

  await pool.end();

  const failed =
    pathMismatches > 0 ||
    productsEmittedOld !== productsEmittedNew ||
    missingInNew.length > 0 ||
    extraInNew.length > 0;

  process.exit(failed ? 1 : 0);
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});
