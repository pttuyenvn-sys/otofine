import { pool } from "../../../config/db.js";
import { parseVehicleJsonField } from "../utils/rfqVehicleNormalize.js";

/**
 * Phase 8.1 — RFQ supplier matching: input normalizer.
 *
 * Turns a raw `rfq_requests` row (or a synthetic preview payload)
 * into the canonical "match input" shape consumed by the scorer +
 * candidate pool queries.
 *
 * Architecture intent:
 *   - SINGLE source of truth for "what does the matching engine know
 *     about this RFQ?" — every downstream call (candidate pool,
 *     scorer, observability log) reads the same `MatchInput` object.
 *   - PURE shape: every value is either a primitive, an array of
 *     primitives, or null. No DB connections, no Date objects, no
 *     class instances. Safe to serialise into logs / cached payloads.
 *   - ADDITIVE: never invents data. If the RFQ doesn't carry a part
 *     type, the matcher works with whatever signals it does have.
 *
 * Output shape (frozen):
 *
 *   {
 *     rfqId:         number,
 *     publicId:      string | null,
 *     status:        string,
 *     description:   string,
 *     descriptionKeywords: string[],  // ≤ 10, lowercased, deduped, len 2+
 *     vehicle: {
 *       brand:  string | null,        // raw, e.g. "Toyota"
 *       brandNorm: string | null,     // lowercased, e.g. "toyota"
 *       model:  string | null,
 *       modelNorm: string | null,
 *       year:   number | null,
 *     },
 *     part: {
 *       categoryKey: string | null,    // raw `category_key` column
 *       partKnowledgeIds: number[],    // resolved from category_key + keyword
 *       systemGroups:     string[],    // e.g. ["Hệ thống điện"]
 *       categoryTags:     string[],    // e.g. ["dien"]
 *     },
 *     location: {
 *       provinceLabel: string | null,
 *       provinceSlug:  string | null,
 *       provinceId:    number | null,
 *     },
 *   }
 */

const MAX_KEYWORDS = 10;
// 3 chars is the empirically right floor for Vietnamese part names:
// 2-char tokens ("oa", "ok", "vn") match too broadly inside LIKE
// queries and pollute taxonomy resolution with garbage hits.
const MIN_KEYWORD_LEN = 3;

/** Lowercased Vietnamese stop words — short, hand-tuned. */
const STOP_WORDS = new Set([
  "tôi", "minh", "muốn", "mua", "tìm", "cần", "hỏi", "ạ", "ah",
  "cho", "xin", "giá", "bao", "nhiêu", "có", "không", "khong",
  "với", "voi", "của", "cua", "này", "nay", "kia", "đó", "do",
  "là", "la", "ô", "tô", "xe", "phụ", "tùng", "phu", "tung",
  "shop", "anh", "chị", "chi", "em", "bạn", "ban", "hello",
  "the", "and", "for", "with", "this", "that", "from", "have",
  "are", "was", "but", "not", "any", "all", "you", "your",
]);

/**
 * Pull the row from `rfq_requests` and project to MatchInput.
 * Returns null when the RFQ doesn't exist or is soft-deleted.
 *
 * Read-only by design. Never mutates the request.
 */
export async function loadMatchInputFromRfqId(rfqRequestId) {
  const id = Number(rfqRequestId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const [rows] = await pool.query(
    `SELECT
        id, public_id, status, vehicle_json, part_description,
        category_key, location_json,
        vehicle_brand_norm, vehicle_model_norm, vehicle_year, deleted_at
       FROM rfq_requests
      WHERE id = ?
      LIMIT 1`,
    [id],
  );
  if (!rows.length) return null;
  const r = rows[0];
  if (r.deleted_at) return null;

  return buildMatchInput({
    rfqId: Number(r.id),
    publicId: r.public_id || null,
    status: String(r.status || ""),
    vehicleJson: r.vehicle_json,
    partDescription: String(r.part_description || ""),
    categoryKey: r.category_key || null,
    locationJson: r.location_json,
    vehicleBrandNorm: r.vehicle_brand_norm || null,
    vehicleModelNorm: r.vehicle_model_norm || null,
    vehicleYear: r.vehicle_year != null ? Number(r.vehicle_year) : null,
  });
}

/**
 * Pure constructor — accepts the raw column values and returns the
 * frozen MatchInput. Used both by `loadMatchInputFromRfqId` and by
 * the preview / test paths that synthesize an input from a JS object.
 *
 * `categoryKey` / `partKnowledgeIds` resolution defers to the DB
 * helper below so callers don't have to know about taxonomy joins.
 */
export async function buildMatchInputFromPayload(payload) {
  return buildMatchInput(payload);
}

async function buildMatchInput(raw) {
  const vehicle = parseVehicleJsonField(raw.vehicleJson);
  const brand = vehicle.brand || null;
  const model = vehicle.model || null;
  const year =
    raw.vehicleYear ??
    (vehicle.year != null ? Number(vehicle.year) : null);

  const descriptionKeywords = extractKeywords(raw.partDescription);

  const location = parseLocation(raw.locationJson);

  // Taxonomy resolution — best-effort. If `category_key` matches a
  // `part_knowledge.slug` directly, we lock that single id and its
  // system_group + tag. Otherwise we keyword-search the description
  // against `name_vi` / `aliases_json` (capped). Never throws; on a
  // taxonomy DB hiccup we return empty arrays so scoring degrades
  // gracefully (part fit signals all return 0).
  const taxonomy = await resolveTaxonomy({
    categoryKey: raw.categoryKey,
    keywords: descriptionKeywords,
  });

  return Object.freeze({
    rfqId: Number(raw.rfqId) || 0,
    publicId: raw.publicId || null,
    status: String(raw.status || ""),
    description: String(raw.partDescription || ""),
    descriptionKeywords,
    vehicle: Object.freeze({
      brand,
      brandNorm: raw.vehicleBrandNorm || (brand ? brand.toLowerCase() : null),
      model,
      modelNorm: raw.vehicleModelNorm || (model ? model.toLowerCase() : null),
      year: Number.isFinite(year) ? year : null,
    }),
    part: Object.freeze({
      categoryKey: raw.categoryKey || null,
      partKnowledgeIds: Object.freeze(taxonomy.ids),
      systemGroups:     Object.freeze(taxonomy.systemGroups),
      categoryTags:     Object.freeze(taxonomy.categoryTags),
    }),
    location: Object.freeze(location),
  });
}

/**
 * Extract keyword candidates from the buyer's free-text part description.
 *
 * We're not building a NLP layer — this is a deliberately simple
 * tokeniser that lowercases, splits on whitespace + punctuation,
 * drops stop words, and dedupes. Output is capped so the candidate
 * pool query has bounded LIKE workload.
 */
export function extractKeywords(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return [];
  const tokens = raw
    .replace(/[\d]+/g, " ") // strip numbers — not useful for taxonomy match
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/);
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    if (t.length < MIN_KEYWORD_LEN) continue;
    if (STOP_WORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

function parseLocation(locationJson) {
  let v = locationJson;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  if (!v || typeof v !== "object") {
    return { provinceLabel: null, provinceSlug: null, provinceId: null };
  }
  // Tolerant of multiple historical shapes from the create form.
  const label = v.provinceLabel || v.province || v.tinh_tp || null;
  const slug = v.provinceSlug || v.tinh_tp_slug || null;
  const id = v.provinceId != null ? Number(v.provinceId) : null;
  return {
    provinceLabel: label ? String(label).trim() : null,
    provinceSlug: slug ? String(slug).trim().toLowerCase() : null,
    provinceId: Number.isFinite(id) ? id : null,
  };
}

/**
 * Resolve a category key + free-text keywords against `part_knowledge`.
 *
 * Strategy:
 *   1. If `category_key` exists, look it up by `slug` — fast, exact.
 *   2. Otherwise, LIKE-match the top 5 keywords against `name_vi`
 *      (case-insensitive, with VN diacritic-stripped fallback handled
 *      by MySQL's `_unicode_ci` collation).
 *
 * Output is capped at 20 part_knowledge ids so downstream queries
 * have predictable cost. `systemGroups` / `categoryTags` are the
 * distinct values from the resolved set — these are the strong
 * signals the scorer cares about (one shop almost never has the
 * exact part_knowledge id in their inventory; they have parts in
 * the SAME system_group).
 */
async function resolveTaxonomy({ categoryKey, keywords }) {
  const empty = { ids: [], systemGroups: [], categoryTags: [] };
  try {
    if (categoryKey) {
      const [rows] = await pool.query(
        `SELECT id, system_group, category_tag
           FROM part_knowledge
          WHERE slug = ? AND is_active = 1
          LIMIT 1`,
        [String(categoryKey).trim()],
      );
      if (rows.length) return projectTaxonomy(rows);
    }

    if (!keywords?.length) return empty;
    const top = keywords.slice(0, 5);
    const where = top.map(() => `name_vi LIKE ?`).join(" OR ");
    const params = top.map((k) => `%${k}%`);
    const [rows] = await pool.query(
      `SELECT id, system_group, category_tag
         FROM part_knowledge
        WHERE is_active = 1 AND (${where})
        ORDER BY ai_priority DESC, id ASC
        LIMIT 20`,
      params,
    );
    return projectTaxonomy(rows);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[shopsite] event=rfq.match.taxonomy-failed msg="${err?.message || "err"}"`,
    );
    return empty;
  }
}

function projectTaxonomy(rows) {
  const ids = [];
  const sg = new Set();
  const tags = new Set();
  for (const r of rows) {
    ids.push(Number(r.id));
    if (r.system_group) sg.add(String(r.system_group));
    if (r.category_tag) tags.add(String(r.category_tag));
  }
  return {
    ids,
    systemGroups: Array.from(sg),
    categoryTags: Array.from(tags),
  };
}
