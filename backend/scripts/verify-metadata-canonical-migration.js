#!/usr/bin/env node
/**
 * ARCH-01J.3: generateMetadata product canonical old vs backend owner.
 *
 * Usage: node scripts/verify-metadata-canonical-migration.js
 */
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { buildProductSeoUrl } from "../../frontend/lib/seo/productSeoUrl.js";
import { buildCanonicalFields } from "../modules/products/services/canonicalPath.server.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";

dotenv.config();

function getSiteUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(
    /\/+$/,
    "",
  );
  if (explicit) return explicit;
  return "https://otofine.com";
}

function absoluteUrl(pathname = "/") {
  const base = getSiteUrl();
  if (!pathname || pathname === "/") return base;
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${p}`;
}

function normalizeAbsoluteUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

function legacyMetadataCanonical(data) {
  const p = data?.product;
  if (!p) return absoluteUrl("/");
  return absoluteUrl(buildProductSeoUrl({ ...p, cars: data.cars }));
}

function resolveMetadataCanonical(data) {
  const fromApi = normalizeAbsoluteUrl(data?.canonicalUrl);
  if (fromApi) return fromApi;

  const path = String(data?.canonicalPath ?? "").trim();
  if (path.startsWith("/")) return absoluteUrl(path);

  const p = data?.product;
  if (p) {
    return absoluteUrl(buildProductSeoUrl({ ...p, cars: data.cars }));
  }

  return absoluteUrl("/");
}

function resolveMetadataCanonicalSource(data) {
  if (normalizeAbsoluteUrl(data?.canonicalUrl)) return "canonicalUrl";
  const path = String(data?.canonicalPath ?? "").trim();
  if (path.startsWith("/")) return "canonicalPath";
  return "fallback";
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

  let productsChecked = 0;
  let matches = 0;
  let mismatches = 0;
  let canonicalUrlUsed = 0;
  let canonicalPathUsed = 0;
  let fallbackUsed = 0;
  const mismatchSamples = [];

  for (const p of products) {
    const id = Number(p.id);
    const cars = carsByProduct.get(id) || [];
    const canonical = buildCanonicalFields(
      { id, partName: p.partName, partNumber: p.partNumber },
      cars,
    );
    const productData = {
      product: { ...p, id },
      cars,
      canonicalPath: canonical.canonicalPath,
      canonicalUrl: canonical.canonicalUrl,
    };

    productsChecked++;
    const oldCanonical = legacyMetadataCanonical(productData);
    const newCanonical = resolveMetadataCanonical(productData);
    const source = resolveMetadataCanonicalSource(productData);

    if (source === "canonicalUrl") canonicalUrlUsed++;
    else if (source === "canonicalPath") canonicalPathUsed++;
    else fallbackUsed++;

    if (oldCanonical === newCanonical) {
      matches++;
    } else {
      mismatches++;
      if (mismatchSamples.length < 10) {
        mismatchSamples.push({
          id,
          oldCanonical,
          newCanonical,
          source,
        });
      }
    }
  }

  const report = {
    products_checked: productsChecked,
    matches,
    mismatches,
    match_pct:
      productsChecked > 0
        ? ((matches / productsChecked) * 100).toFixed(4)
        : "0",
    canonicalUrl_used: canonicalUrlUsed,
    canonicalPath_used: canonicalPathUsed,
    fallback_used: fallbackUsed,
    mismatch_samples: mismatchSamples,
  };

  console.log(JSON.stringify(report, null, 2));

  await pool.end();
  process.exit(mismatches === 0 ? 0 : 1);
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});
