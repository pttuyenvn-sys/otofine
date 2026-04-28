/**
 * Wipes seo_page_cache and regenerates HTML/meta/FAQ JSON from seo_routes + part_knowledge
 * via seoComposer (real technical fields — no templated generics).
 *
 * Usage: npm run rebuild:seo-cache
 *        node scripts/rebuildSeoCache.js
 */
import dotenv from "dotenv";
import { rebuildSeoPageCacheAll } from "../services/seoPage.service.js";

dotenv.config();

await rebuildSeoPageCacheAll({ deleteFirst: true });
console.log(JSON.stringify({ ok: true }));
process.exit(0);
