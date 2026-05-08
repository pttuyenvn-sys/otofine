/**
 * Resolves `GET /api/seo-page/:slug` → best part_knowledge row.
 * seedSeoRoutes uses INSERT IGNORE; first inserter can steal a variant slug from a better-matching part.
 * Ranking prefers exact slug/name/alias alignment and penalizes extra semantic tokens vs. the request slug.
 */

import { pool } from "../config/db.js";
import { slugifyVi } from "../utils/productSlug.js";
import {
  collectVariantSlugs,
  normalizePrimarySlug,
  parseAliasesJson,
  withOTo,
} from "../utils/seoRouteVariants.js";
import { logInfo } from "../utils/syncLogger.js";

const OTO_SUFFIX = "-o-to";

/** @param {string} s */
export function stripOtoSuffix(s) {
  const t = String(s ?? "")
    .toLowerCase()
    .trim();
  if (t.endsWith(OTO_SUFFIX)) return t.slice(0, -OTO_SUFFIX.length).replace(/-+$/, "");
  return t;
}

/** @param {string} seg */
function tokenSet(seg) {
  return new Set(
    String(seg ?? "")
      .split("-")
      .map((x) => x.trim())
      .filter(Boolean),
  );
}

/** @param {Set<string>} a @param {Set<string>} b */
function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/** @param {string} a @param {string} b */
function lev(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  /** @type {number[]} */
  const dp = Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        prev + cost,
        dp[j] + 1,
        dp[j - 1] + 1,
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Check if slug represents a category page
 * @param {string} slug
 * @returns {boolean}
 */
function isCategorySlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  const s = slug.trim().toLowerCase();
  // Category slugs end with "-o-to" but don't start with "phu-tung-o-to"
  return s.endsWith("-o-to") && !s.startsWith("phu-tung-o-to");
}

/**
 * Extract category name from slug
 * @param {string} slug
 * @returns {string}
 */
function extractCategoryFromSlug(slug) {
  if (!isCategorySlug(slug)) return "";
  const s = slug.trim().toLowerCase();
  // Remove "-o-to" suffix and convert back to readable format
  const baseName = s.slice(0, -6); // Remove "-o-to"
  // Convert slug back to readable category name
  return baseName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * @param {string} requestedSlug
 * @param {import("mysql2").RowDataPacket} pk
 * @param {Object} context - Additional context for scoring
 * @returns {null | {
 *   tier: number,
 *   subScore: number,
 *   extraTokens: number,
 *   label: string,
 * }}
 */
function scorePartMatch(requestedSlug, pk, context = {}) {
  const req = String(requestedSlug ?? "")
    .toLowerCase()
    .trim();
  if (!req) return null;

  const reqBase = stripOtoSuffix(req);
  const reqTok = tokenSet(reqBase);

  const primarySlug = normalizePrimarySlug(pk.slug);
  const aliases = parseAliasesJson(pk.aliases_json);
  const variants = collectVariantSlugs(primarySlug, aliases);

  if (!variants.has(req)) return null;

  const nameVi = String(pk.name_vi ?? "").trim();
  const nameSlug = slugifyVi(nameVi).slice(0, 191);
  const nameTok = tokenSet(nameSlug);
  const slugTok = tokenSet(primarySlug);
  const unionTok = new Set([...nameTok, ...slugTok]);
  let extraTokens = 0;
  for (const t of unionTok) {
    if (!reqTok.has(t)) extraTokens += 1;
  }

  const priority =
    Number(
      String(pk.seo_priority ?? "")
        .replace(/[^\d-]/g, "")
        .slice(0, 6),
    ) || 0;

  /** Penalize candidate strings that introduce tokens absent from the request (e.g. giam xoc vs can truoc). */
  const penalty = extraTokens * 750;

  const nameOto = nameSlug
    ? withOTo(nameSlug.length <= 186 ? nameSlug : nameSlug.slice(0, 186))
    : null;

  // ---- tier: lower is better (1 = best)
  let tier = 60;
  let label = "variant_member";

  if (primarySlug === req || primarySlug === reqBase) {
    tier = 1;
    label = "exact_primary_slug";
  } else if (
    nameSlug &&
    (nameSlug === reqBase || req === nameSlug || (nameOto && nameOto === req))
  ) {
    tier = 2;
    label = "exact_name_slug";
  } else {
    let aliasHit = false;
    for (const a of aliases) {
      const as = slugifyVi(String(a).trim()).slice(0, 191);
      if (!as) continue;
      const ao = withOTo(as.length <= 186 ? as : as.slice(0, 186));
      if (as === req || as === reqBase || (ao && ao === req)) {
        aliasHit = true;
        break;
      }
    }
    if (aliasHit) {
      tier = 3;
      label = "exact_alias_slug";
    } else if (
      reqBase.startsWith(`${primarySlug}-`) ||
      (primarySlug.length > 1 && primarySlug.startsWith(`${reqBase}-`))
    ) {
      tier = 4;
      label = "starts_with_slug";
    } else {
      const jac = jaccard(reqTok, unionTok);
      if (jac >= 0.34) {
        tier = 5;
        label = `token_overlap_${jac.toFixed(2)}`;
      } else {
        const d = lev(nameSlug, reqBase);
        const maxLen = Math.max(nameSlug.length, reqBase.length, 1);
        const fuzzy = 1 - d / maxLen;
        tier = 6;
        label = `fuzzy_${fuzzy.toFixed(2)}`;
      }
    }
  }

  const subScore = priority * 1e4 + jaccard(reqTok, unionTok) * 1e6 - penalty;

  // Category context bonus - boost scores for category-relevant matches
  let categoryBonus = 0;
  if (isCategorySlug(requestedSlug)) {
    const categoryName = extractCategoryFromSlug(requestedSlug);
    const nameVi = String(pk.name_vi ?? "").toLowerCase();
    const categoryKeywords = categoryName.toLowerCase().split(' ');

    // Check if part name contains category keywords
    for (const keyword of categoryKeywords) {
      if (nameVi.includes(keyword)) {
        categoryBonus += 500;
        break;
      }
    }

    // Additional bonus for exact category name match
    if (nameVi === categoryName.toLowerCase()) {
      categoryBonus += 1000;
    }
  }

  // Filter context bonus for dynamic matching
  let filterBonus = 0;
  if (context.filters) {
    const filterKeywords = Object.values(context.filters).filter(Boolean).join(' ').toLowerCase();
    const partName = String(pk.name_vi ?? "").toLowerCase();

    if (filterKeywords && partName.includes(filterKeywords)) {
      filterBonus += 300;
    }
  }

  const finalScore = subScore + categoryBonus + filterBonus;

  return { tier, subScore: finalScore, extraTokens, label, priority, categoryBonus, filterBonus };
}

function extractExactBaseSlug(requestedSlug, allSlugs) {
  const parts = requestedSlug.split("-");

  for (let i = parts.length; i > 0; i--) {
    const candidate = parts.slice(0, i).join("-");
    if (allSlugs.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * @param {string} slug
 * @param {Object} context - Additional context for scoring
 * @returns {Promise<{
 *   part: import("mysql2").RowDataPacket | null,
 *   routeRow: import("mysql2").RowDataPacket | null,
 *   resolution: {
 *     requestedSlug: string,
 *     candidates: Array<{ id: number, slug: string, name_vi: string, tier: number, subScore: number, label: string, extraTokens: number }>,
 *     winner: { id: number, tier: number, label: string } | null,
 *     dbRoutePartId: number | null,
 *     mismatchWithDb: boolean,
 *   }
 * }>}
 */
export async function resolveSeoSlugWithRanking(slug, context = {}) {

  const requestedSlug = String(slug ?? "").toLowerCase().trim();
  if (!requestedSlug) return empty;

  // 2. query data (CHỈ 1 LẦN)
  const [rows] = await pool.query(`
    SELECT id, slug, name_vi, name_en, aliases_json, seo_priority
    FROM part_knowledge
    WHERE is_active = 1
  `);

  const [[routeRow]] = await pool.query(
    `SELECT * FROM seo_routes WHERE slug = ? AND is_active = 1 LIMIT 1`,
    [requestedSlug],
  );

  // 3. build slugSet
  const slugSet = new Set(rows.map(r => r.slug));

  // 4. prefix match (QUAN TRỌNG NHẤT)
  const baseSlug = extractExactBaseSlug(requestedSlug, slugSet);

  if (baseSlug) {
    const part = rows.find(r => r.slug === baseSlug);

    return {
      part,
      routeRow,
      resolution: {
        requestedSlug,
        candidates: [],
        winner: {
          id: part?.id,
          tier: 0,
          label: "exact_prefix_match"
        }
      }
    };
  }

  /** @type {Array<{ pk: import("mysql2").RowDataPacket, score: NonNullable<ReturnType<typeof scorePartMatch>> }>} */
  const scored = [];
  for (const pk of rows) {
    const sc = scorePartMatch(requestedSlug, pk, context);
    if (sc) scored.push({ pk, score: sc });
  }

  scored.sort((a, b) => {
    if (a.score.tier !== b.score.tier) return a.score.tier - b.score.tier;
    if (a.score.subScore !== b.score.subScore) return b.score.subScore - a.score.subScore;
    return Number(a.pk.id) - Number(b.pk.id);
  });

  const top = scored.slice(0, 5);
  const winnerEntry = scored[0];

  const candidates = top.map((s) => ({
    id: Number(s.pk.id),
    slug: String(s.pk.slug ?? ""),
    name_vi: String(s.pk.name_vi ?? "").slice(0, 120),
    tier: s.score.tier,
    subScore: Math.round(s.score.subScore),
    label: s.score.label,
    extraTokens: s.score.extraTokens,
  }));

  let part = winnerEntry?.pk ?? null;

  const dbPid = routeRow?.part_knowledge_id != null
    ? Number(routeRow.part_knowledge_id)
    : null;
  const winPid = part ? Number(part.id) : null;
  const mismatchWithDb =
    dbPid != null && winPid != null && dbPid !== winPid;

  /** If nothing matched variants, fallback to seo_routes pointer (legacy). */
  if (!part && routeRow) {
    const [fb] = await pool.query(`SELECT * FROM part_knowledge WHERE id = ? LIMIT 1`, [
      routeRow.part_knowledge_id,
    ]);
    part = fb?.[0] ?? null;
  }

  const debugEnabled =
    process.env.SEO_SLUG_RESOLVER_DEBUG === "1" ||
    process.env.NODE_ENV !== "production";

  if (debugEnabled) {
    logInfo("seoSlugResolver", "slug resolution rank", {
      slug: requestedSlug,
      candidates: candidates.slice(0, 5),
      winner:
        part && winnerEntry ?
          {
            id: Number(part.id),
            tier: winnerEntry.score.tier,
            score: Math.round(winnerEntry.score.subScore),
            label: winnerEntry.score.label,
          }
          : part && !winnerEntry ?
            {
              id: Number(part.id),
              tier: null,
              score: null,
              label: "fallback_route_row",
            }
            : null,
      db_route_part_knowledge_id: dbPid,
      mismatch_resolved_vs_db: mismatchWithDb,
    });
  } else if (mismatchWithDb) {
    logInfo("seoSlugResolver.part_mismatch", "resolved slug ≠ seo_routes.part_knowledge_id", {
      slug: requestedSlug,
      db_part_knowledge_id: dbPid,
      resolved_part_knowledge_id: winPid,
    });
  }

  return {
    part,
    routeRow: routeRow ?? null,
    resolution: {
      requestedSlug,
      candidates: candidates.slice(0, 5),
      winner:
        part && winnerEntry ?
          {
            id: Number(part.id),
            tier: winnerEntry.score.tier,
            label: winnerEntry.score.label,
          }
          : part && !winnerEntry ?
            { id: Number(part.id), tier: null, label: "fallback_route_row" }
            : null,
      dbRoutePartId: dbPid,
      mismatchWithDb,
    },
  };
}
