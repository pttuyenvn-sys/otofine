#!/usr/bin/env node
/**
 * SEARCH-INDEX-COMPLETE-DOCUMENT-01 — validate popup document fields + benchmark sync.
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "..", "audit", "search-index-complete-document-01");
const require = createRequire(path.join(ROOT, "package.json"));
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const SAMPLE_SIZE = Number(process.env.SEARCH_INDEX_DOC_VALIDATE_N || 150);

const POPUP_FIELDS = [
  "title",
  "canonical_url",
  "thumbnail_url",
  "vehicle_label",
  "price",
  "shop_name",
  "location_name",
  "part_number",
  "stock_status",
];

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { pool } = await import("../config/db.js");
  const { ensureSearchIndexSchema } = await import("../services/search/ensureSearchIndexSchema.js");
  const { compareProductIndex } = await import(
    "../services/search/searchIndexCompare.server.js"
  );
  const { SearchIndexSyncService } = await import("../services/search/SearchIndexSyncService.js");
  const { CURRENT_SEARCH_INDEX_VERSION } = await import("../config/searchIndexConfig.js");
  const { getProductsColumnsResolved } = await import("../utils/productsTableColumns.server.js");
  const { buildPublicProductWhereClause } = await import(
    "../modules/products/services/productPublicVisibility.server.js"
  );

  const schemaT0 = performance.now();
  await ensureSearchIndexSchema(pool);
  const schemaMs = Math.round(performance.now() - schemaT0);

  const rebuildT0 = performance.now();
  const rebuild = await SearchIndexSyncService.rebuildAll({
    batchSize: 200,
    staleVersionOnly: true,
    onProgress: (p) => {
      if (p.processed % 500 === 0) {
        console.log(`[doc-validate] rebuild ${p.processed}/${p.total}`);
      }
    },
  });
  const rebuildMs = Math.round(performance.now() - rebuildT0);

  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const [sampleRows] = await pool.query(
    `
    SELECT ${pid} AS id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    WHERE 1=1 ${vis.sql}
    ORDER BY RAND()
    LIMIT ?
    `,
    [SAMPLE_SIZE],
  );
  const ids = sampleRows.map((r) => Number(r.id));

  const parityResults = [];
  const syncLatencies = [];
  let parityPass = 0;
  const fieldMissing = Object.fromEntries(POPUP_FIELDS.map((f) => [f, 0]));
  let rowsChecked = 0;

  for (const id of ids) {
    const t0 = performance.now();
    await SearchIndexSyncService.syncProduct(id, { source: "validate-doc", force: true });
    syncLatencies.push(performance.now() - t0);

    const cmp = await compareProductIndex(pool, id);
    parityResults.push(cmp);
    if (cmp.ok) parityPass += 1;

    const [idxRows] = await pool.query(
      `SELECT ${POPUP_FIELDS.join(", ")}, category_slug, brand_name, model_name, popularity_score, search_version
       FROM product_search_index WHERE product_id = ? AND status = 'active' LIMIT 5`,
      [id],
    );
    for (const row of idxRows) {
      rowsChecked += 1;
      for (const f of POPUP_FIELDS) {
        if (row[f] == null || String(row[f]).trim() === "") fieldMissing[f] += 1;
      }
    }
  }

  const [[sizeRow]] = await pool.query(`
    SELECT
      COUNT(*) AS docs,
      COUNT(DISTINCT product_id) AS products,
      ROUND(AVG(LENGTH(COALESCE(search_text,'')) + LENGTH(COALESCE(title,'')) + LENGTH(COALESCE(canonical_url,''))), 0) AS avg_payload_chars,
      ROUND(AVG(OCTET_LENGTH(CONCAT_WS('|',
        COALESCE(title,''), COALESCE(thumbnail_url,''), COALESCE(vehicle_label,''),
        COALESCE(shop_name,''), COALESCE(canonical_url,''), COALESCE(search_text,'')
      ))), 0) AS avg_doc_bytes,
      SUM(search_version < ?) AS stale_version
    FROM product_search_index WHERE status = 'active'
  `, [CURRENT_SEARCH_INDEX_VERSION]);

  const syncSorted = [...syncLatencies].sort((a, b) => a - b);
  const at = (q) => syncSorted[Math.min(syncSorted.length - 1, Math.floor(q * (syncSorted.length - 1)))];

  const validation = {
    generatedAt: new Date().toISOString(),
    searchIndexVersion: CURRENT_SEARCH_INDEX_VERSION,
    schemaApplyMs: schemaMs,
    rebuild: { ...rebuild, durationMs: rebuildMs },
    sampleSize: ids.length,
    parityPass,
    parityPassPct: pct(parityPass, ids.length),
    indexRowsSampled: rowsChecked,
    popupFieldMissingCounts: fieldMissing,
    popupFieldFillPct: Object.fromEntries(
      POPUP_FIELDS.map((f) => [f, pct(rowsChecked - (fieldMissing[f] || 0), rowsChecked)]),
    ),
    syncLatencyMs: {
      samples: syncLatencies.length,
      avg: Math.round((syncLatencies.reduce((a, b) => a + b, 0) / (syncLatencies.length || 1)) * 100) / 100,
      p50: Math.round(at(0.5) * 100) / 100,
      p95: Math.round(at(0.95) * 100) / 100,
    },
    documentSize: {
      activeDocuments: Number(sizeRow.docs),
      activeProducts: Number(sizeRow.products),
      avgPayloadChars: Number(sizeRow.avg_payload_chars),
      avgDocBytes: Number(sizeRow.avg_doc_bytes),
      staleVersionRows: Number(sizeRow.stale_version),
    },
    joinReductionEstimate: {
      currentPopupSqlJoins: ["products", "shops", "address", "product_category_map", "product_categories", "product_car_applications", "car_models", "product_images"],
      futurePopupFromIndexJoins: [],
      joinsEliminatedPerPreviewProduct: 8,
      note: "Runtime not switched; estimate for future index-only popup hydration",
    },
    popupQueryReductionEstimate: {
      currentQueriesPerSuggest: "2+ heavy products scans (grouped CTE + preview batch)",
      futureQueriesPerSuggest: "1 index grouped scan + 0 hydration JOINs if document complete",
      estimatedQueryReductionPct: 50,
    },
    failures: parityResults.filter((r) => !r.ok).slice(0, 20),
  };

  fs.writeFileSync(path.join(OUT, "validation.json"), JSON.stringify(validation, null, 2));

  const pass = validation.parityPassPct >= 95
    && Number(sizeRow.stale_version) === 0
    && validation.popupFieldFillPct.title >= 99
    && validation.popupFieldFillPct.canonical_url >= 99
    && validation.popupFieldFillPct.shop_name >= 99;

  console.log("\n=== SEARCH-INDEX-COMPLETE-DOCUMENT-01 ===");
  console.log("Parity:", validation.parityPassPct + "%", `(${parityPass}/${ids.length})`);
  console.log("Stale rows:", sizeRow.stale_version);
  console.log("Avg doc bytes:", sizeRow.avg_doc_bytes);
  console.log("PASS:", pass ? "YES" : "NO");
  console.log("Output:", OUT);

  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
