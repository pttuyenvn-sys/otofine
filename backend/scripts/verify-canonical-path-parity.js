#!/usr/bin/env node
/**
 * ARCH-01H / ARCH-03C parity: FE buildProductSeoUrl vs BE getCanonicalProductPath
 *
 * Usage: node scripts/verify-canonical-path-parity.js
 */
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import {
  buildProductSeoUrl,
  buildProductSeoSlug,
  extractProductIdFromSeoSlug,
} from "../../frontend/lib/seo/productSeoUrl.js";
import { getCanonicalProductPath } from "../modules/products/services/canonicalPath.server.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";

/** Pre-ARCH-03C canonical path (yearFrom only) for migration delta. */
function getLegacyCanonicalProductPath(input) {
  const id = input?.id ?? input?.productId ?? input?.product_id ?? null;
  if (id == null || id === "") return "/";

  const slug = buildProductSeoSlug(input);
  if (!slug) return `/p/${id}`;

  const cars = input.cars;
  if (Array.isArray(cars) && cars.length > 0) {
    const car = cars[0];
    const yf = car?.year_from ?? car?.yearFrom ?? null;
    const yt = car?.year_to ?? car?.yearTo ?? null;
    if (yf != null && yt != null && String(yf) !== String(yt)) {
      const rangeToken = `${yf}-${yt}`;
      const singleToken = String(yf);
      if (slug.includes(rangeToken)) {
        return `/${slug.replace(rangeToken, singleToken)}-${id}`;
      }
    }
  }

  return `/${slug}-${id}`;
}

dotenv.config();

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

  let matches = 0;
  let mismatches = 0;
  let urlsChanged = 0;
  let redirectSafe = 0;
  const mismatchSamples = [];
  const migrationExamples = [];
  const proposedPaths = new Map();

  for (const p of products) {
    const id = Number(p.id);
    const cars = carsByProduct.get(id) || [];
    const input = {
      id,
      partName: p.partName,
      partNumber: p.partNumber,
      cars,
    };

    const fe = buildProductSeoUrl(input);
    const be = getCanonicalProductPath(input);
    const legacy = getLegacyCanonicalProductPath(input);

    if (fe === be) {
      matches++;
    } else {
      mismatches++;
      if (mismatchSamples.length < 10) {
        mismatchSamples.push({ id, fe, be, cars: cars.length });
      }
    }

    if (legacy !== be) {
      urlsChanged++;
      const legacySlug = legacy.replace(/^\//, "");
      const extractedId = extractProductIdFromSeoSlug(legacySlug);
      if (extractedId === id) redirectSafe++;

      if (migrationExamples.length < 6) {
        migrationExamples.push({
          id,
          before: legacy,
          after: be,
        });
      }
    }

    if (proposedPaths.has(be)) {
      proposedPaths.get(be).push(id);
    } else {
      proposedPaths.set(be, [id]);
    }
  }

  const collisionPaths = [...proposedPaths.entries()].filter(
    ([, ids]) => ids.length > 1,
  );
  const collisions = collisionPaths.length;
  const affectedIds = collisionPaths.flatMap(([, ids]) => ids);

  const report = {
    migration: {
      products_checked: products.length,
      urls_changed: urlsChanged,
      redirect_safe: redirectSafe,
      collisions,
      affected_ids: affectedIds.length,
      parity_mismatches: mismatches,
      examples: migrationExamples,
    },
    parity: {
      products_checked: products.length,
      matches,
      mismatches,
      match_pct:
        products.length > 0
          ? ((matches / products.length) * 100).toFixed(4)
          : "0",
      samples: mismatchSamples,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  await pool.end();
  process.exit(mismatches === 0 ? 0 : 1);
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});
