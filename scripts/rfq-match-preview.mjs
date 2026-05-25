#!/usr/bin/env node
/**
 * Phase 8.1 — RFQ supplier matching preview CLI.
 *
 * Dry-runs the matching engine against a real `rfq_requests` row and
 * prints the ranked suppliers + score breakdowns. READ ONLY — does
 * not dispatch, does not mutate.
 *
 * Usage:
 *
 *   # by id
 *   node scripts/rfq-match-preview.mjs --id 119
 *
 *   # by public_id
 *   node scripts/rfq-match-preview.mjs --public 8f0...
 *
 *   # change top-N
 *   node scripts/rfq-match-preview.mjs --id 119 --top 5
 *
 *   # show full breakdown JSON
 *   node scripts/rfq-match-preview.mjs --id 119 --json
 *
 * Designed for ops + QA to validate ranking quality before the
 * engine gets wired into dispatch. Exits non-zero on engine failures.
 */
// dotenv.config() is invoked transitively by backend/config/db.js,
// so we don't need (and can't easily resolve) `dotenv/config` here.
import { pool } from "../backend/config/db.js";
import { matchRfqToShops } from "../backend/modules/rfq/matching/index.js";

function parseArgs() {
  const args = { topN: 10, json: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") args.id = Number(argv[++i]);
    else if (a === "--public") args.publicId = String(argv[++i]);
    else if (a === "--top") args.topN = Number(argv[++i]);
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/rfq-match-preview.mjs --id <rfqId> [--top N] [--json]`);
      process.exit(0);
    }
  }
  return args;
}

async function resolveRfqId({ id, publicId }) {
  if (Number.isFinite(id) && id > 0) return id;
  if (publicId) {
    const [rows] = await pool.query(
      `SELECT id FROM rfq_requests WHERE public_id = ? LIMIT 1`,
      [publicId],
    );
    if (rows.length) return Number(rows[0].id);
    throw new Error(`No RFQ found for public_id=${publicId}`);
  }
  // fallback: pick the most recent open/dispatching RFQ
  const [rows] = await pool.query(
    `SELECT id FROM rfq_requests
      WHERE status IN ('open', 'dispatching', 'quoted')
        AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1`,
  );
  if (!rows.length) throw new Error("No usable RFQ in DB to preview");
  return Number(rows[0].id);
}

function fmtNum(n) {
  return String(n).padStart(3, " ");
}

function renderHuman(out) {
  const { input, stats, results } = out;
  console.log("");
  console.log("=".repeat(78));
  console.log(`RFQ #${input.rfqId}  status=${input.status}  publicId=${input.publicId || "—"}`);
  console.log(`  vehicle: ${input.vehicle.brand || "?"} ${input.vehicle.model || ""} ${input.vehicle.year || ""}`.trim());
  console.log(`  part:    ${input.description.slice(0, 80)}${input.description.length > 80 ? "…" : ""}`);
  console.log(`  taxonomy: groups=${JSON.stringify(input.part.systemGroups)} tags=${JSON.stringify(input.part.categoryTags)} ids=${input.part.partKnowledgeIds.length}`);
  console.log(`  location: ${input.location.provinceLabel || "—"} (provinceId=${input.location.provinceId || "—"})`);
  console.log(`  keywords: ${JSON.stringify(input.descriptionKeywords)}`);
  console.log("=".repeat(78));
  console.log(`Candidates: total=${stats.candidatesTotal}  byBrand=${stats.candidatesByBrand}  byPart=${stats.candidatesByPart}  byGeo=${stats.candidatesByGeo}`);
  console.log(`Scored=${stats.scored}  Returned=${stats.returned}  BestScore=${stats.bestScore}/${stats.maxScore}  dur=${stats.durationMs}ms`);
  console.log("");
  if (results.length === 0) {
    console.log("  (no shops ranked — see logs for reason)");
    return;
  }
  results.forEach((r, i) => {
    const rank = String(i + 1).padStart(2, " ");
    console.log(
      `[${rank}] shop=${r.shopId} slug=${r.slug || "—"} name="${(r.name || "").slice(0, 40)}"` +
      ` score=${fmtNum(r.score)}/${r.max}  tier=${r.tier}` +
      `  brand=${r.signals.brandProducts} part=${r.signals.partProducts} total=${r.signals.totalProducts}` +
      (r.storefront.verified ? "  ✓verified" : "")
    );
    for (const b of r.breakdown) {
      console.log(`     + ${fmtNum(b.points)}/${b.max} ${b.label}${b.evidence ? "  (" + b.evidence + ")" : ""}`);
    }
    if (r.specialization.topBrands?.length) {
      console.log(`     • top brands: ${r.specialization.topBrands.map((b) => `${b.brand}(${b.productCount})`).join(", ")}`);
    }
    console.log("");
  });
}

(async function main() {
  const args = parseArgs();
  let exitCode = 0;
  try {
    const rfqId = await resolveRfqId(args);
    const result = await matchRfqToShops({ rfqRequestId: rfqId, topN: args.topN });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      renderHuman(result);
    }
  } catch (err) {
    console.error("[rfq-match-preview] FAILED:", err?.message || err);
    exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {}
    process.exit(exitCode);
  }
})();
