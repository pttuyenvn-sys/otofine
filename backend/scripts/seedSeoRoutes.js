/**
 * Seed seo_routes from active part_knowledge rows (multiple URL variants per part).
 *
 * Per part:
 * - primary slug from part_knowledge.slug
 * - primary slug + '-o-to' (if not already suffix; length-safe for VARCHAR 191)
 * - each aliases_json entry → slugifyVi(alias)
 * - each alias slug + '-o-to'
 *
 * canonical_url always points at the primary slug path `/{primarySlug}`.
 * Uses INSERT IGNORE (duplicate slug skipped).
 *
 * Then rebuilds seo_page_cache from all routes.
 *
 * Usage: node scripts/seedSeoRoutes.js
 */
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { slugifyVi } from "../utils/productSlug.js";
import {
  normalizePrimarySlug,
  parseAliasesJson,
  collectVariantSlugs,
} from "../utils/seoRouteVariants.js";
import { rebuildSeoPageCacheAll } from "../services/seoPage.service.js";
import { logInfo } from "../utils/syncLogger.js";

dotenv.config();

/** part_knowledge.seo_priority VARCHAR — coerce to INTEGER for priority_score */
function priorityScoreFromSeoPriority(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  const digits = parseInt(s.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(digits) ? digits : 0;
}

async function main() {
  const [rows] = await pool.query(
    `
    SELECT id, slug, name_vi, seo_priority, aliases_json
    FROM part_knowledge
    WHERE is_active = 1
      AND TRIM(IFNULL(slug, '')) <> ''
      AND TRIM(IFNULL(name_vi, '')) <> ''
    ORDER BY id ASC
    `,
  );

  logInfo("seedSeoRoutes", "loaded part_knowledge rows", { count: rows.length });

  let insertAttempts = 0;
  let inserted = 0;

  for (const pk of rows) {
    const primarySlug = normalizePrimarySlug(pk.slug);
    if (!primarySlug) continue;

    const h1 = String(pk.name_vi).trim();
    const canonical_url = `/${primarySlug}`;
    const score = priorityScoreFromSeoPriority(pk.seo_priority);

    const aliasesList = parseAliasesJson(pk.aliases_json);
    const variants = collectVariantSlugs(primarySlug, aliasesList);

    for (const slug of variants) {
      const rowSlug = String(slug).slice(0, 191);
      insertAttempts++;
      const [res] = await pool.query(
        `
        INSERT IGNORE INTO seo_routes
          (slug, h1, part_knowledge_id, car_model_id, page_type, canonical_url, priority_score, is_active)
        VALUES (?, ?, ?, NULL, 'part', ?, ?, 1)
        `,
        [rowSlug, h1, pk.id, canonical_url, score],
      );
      const n = Number(res?.affectedRows ?? 0);
      if (n === 1) inserted++;
    }
  }

  logInfo("seedSeoRoutes", "insert IGNORE done", {
    rows: rows.length,
    insertAttempts,
    inserted,
  });

  await rebuildSeoPageCacheAll({ deleteFirst: true });
  logInfo("seedSeoRoutes", "rebuild seo_page_cache complete", {});

  console.log(
    JSON.stringify({
      rows: rows.length,
      insertAttempts,
      insertedByIgnoreNewRows: inserted,
      cache: "rebuilt",
    }),
  );
}

await main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
