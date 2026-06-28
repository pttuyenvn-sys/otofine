#!/usr/bin/env node
/**
 * ARCH-01I verification: consumer href uses API canonicalPath.
 *
 * Usage: node scripts/verify-consumer-canonical-migration.js
 */
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { getProductList } from "../services/productList.service.js";
import { searchProductsPublic } from "../services/productSearch.service.js";
import { getRelatedProductsForDetail } from "../services/productRelated.service.js";
import { buildProductSeoUrl } from "../../frontend/lib/seo/productSeoUrl.js";
import {
  getCanonicalProductPath,
  loadPrimaryFitmentCarsByProductIds,
} from "../modules/products/services/canonicalPath.server.js";

dotenv.config();

/** Mirrors frontend/lib/productDetailHref.js consumer rule. */
function getProductDetailHref(item) {
  if (!item) return "/";
  const cp = String(item.canonicalPath ?? "").trim();
  if (cp.startsWith("/")) return cp;
  return buildProductSeoUrl(item);
}

function auditItems(label, items) {
  let sampled = 0;
  let apiHasCanonical = 0;
  let hrefMatchesCanonical = 0;
  let hrefMismatches = 0;
  let fallbackCount = 0;
  const mismatchSamples = [];

  for (const item of items) {
    if (!item?.id) continue;
    sampled++;
    const cp = item.canonicalPath;
    const href = getProductDetailHref(item);

    if (cp && String(cp).startsWith("/")) {
      apiHasCanonical++;
      if (href === cp) {
        hrefMatchesCanonical++;
      } else {
        hrefMismatches++;
        if (mismatchSamples.length < 5) {
          mismatchSamples.push({ id: item.id, href, canonicalPath: cp });
        }
      }
    } else {
      fallbackCount++;
    }
  }

  return {
    source: label,
    products_sampled: sampled,
    api_has_canonical: apiHasCanonical,
    href_matches_canonical: hrefMatchesCanonical,
    href_mismatches: hrefMismatches,
    fallback_count: fallbackCount,
    mismatch_samples: mismatchSamples,
  };
}

async function regressionHttpCheck(samplePaths) {
  const origin = (
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://127.0.0.1:3001"
  ).replace(/\/+$/, "");

  const results = [];
  for (const path of samplePaths) {
    const url = `${origin}${path}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "text/html" },
      });
      results.push({
        path,
        status: res.status,
        ok: res.status >= 200 && res.status < 400,
      });
    } catch (err) {
      results.push({
        path,
        status: null,
        ok: false,
        error: String(err.message || err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return {
    origin,
    checked: results.length,
    http_ok: okCount,
    http_fail: results.length - okCount,
    samples: results,
  };
}

async function main() {
  const listResult = await getProductList({ page: 1, limit: 200 });
  const listAudit = auditItems("products_list", listResult.data || []);

  const searchResult = await searchProductsPublic({
    q: "loc",
    page: 1,
    perPage: 100,
  });
  const searchAudit = auditItems("products_search", searchResult.data || []);

  const [seedRows] = await pool.query(
    "SELECT id FROM products WHERE partName IS NOT NULL ORDER BY id DESC LIMIT 1",
  );
  const seedId = seedRows[0]?.id;
  const related = seedId
    ? await getRelatedProductsForDetail(seedId, { limit: 12 })
    : [];
  const relatedAudit = auditItems("products_related", related);

  const samplePaths = [
    ...new Set(
      (listResult.data || [])
        .slice(0, 5)
        .map((x) => x.canonicalPath)
        .filter((p) => p && String(p).startsWith("/")),
    ),
  ];

  const canonicalSelfCheck = [];
  const selfIds = (listResult.data || []).slice(0, 20).map((x) => x.id);
  const fitmentMap = await loadPrimaryFitmentCarsByProductIds(pool, selfIds);
  for (const item of (listResult.data || []).slice(0, 20)) {
    if (!item?.canonicalPath) continue;
    const cars = fitmentMap.get(Number(item.id)) || [];
    const bePath = getCanonicalProductPath({
      id: item.id,
      partName: item.partName,
      partNumber: item.partNumber,
      cars,
    });
    canonicalSelfCheck.push({
      id: item.id,
      api_canonical: item.canonicalPath,
      be_canonical: bePath,
      url_delta: item.canonicalPath === bePath ? 0 : 1,
    });
  }

  const httpRegression = await regressionHttpCheck(samplePaths);

  const report = {
    phase5_consumer_href: [listAudit, searchAudit, relatedAudit],
    phase6_regression: {
      canonical_self_samples: canonicalSelfCheck.slice(0, 10),
      url_delta:
        canonicalSelfCheck.filter((x) => x.url_delta !== 0).length,
      http: httpRegression,
    },
    totals: {
      products_sampled:
        listAudit.products_sampled +
        searchAudit.products_sampled +
        relatedAudit.products_sampled,
      href_matches_canonical:
        listAudit.href_matches_canonical +
        searchAudit.href_matches_canonical +
        relatedAudit.href_matches_canonical,
      href_mismatches:
        listAudit.href_mismatches +
        searchAudit.href_mismatches +
        relatedAudit.href_mismatches,
      fallback_count:
        listAudit.fallback_count +
        searchAudit.fallback_count +
        relatedAudit.fallback_count,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  await pool.end();

  const failed =
    report.totals.href_mismatches > 0 || report.phase6_regression.url_delta > 0;
  process.exit(failed ? 1 : 0);
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});
