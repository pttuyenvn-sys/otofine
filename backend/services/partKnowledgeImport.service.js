/**
 * Import pipeline Batch 1 — part_knowledge.
 * Trường: slug, category_name, english_name, system_group, seo_priority (số hoặc A–E),
 * function_text, structure_text, operation_text, symptoms_text, replace_interval_text,
 * warnings_text, buying_guide_text, faq_text
 *
 * - Ghi đè theo slug (upsert). Tối đa PART_KNOWLEDGE_BATCH1_MAX_ROWS (mặc định 50).
 * - Nhận mảng thuần [...] hoặc { rows: [...] }.
 */
import { upsertPartKnowledgeBatch1Rows } from "../repositories/partKnowledge.repository.js";

export function getBatch1MaxRows() {
  const n = Number(process.env.PART_KNOWLEDGE_BATCH1_MAX_ROWS);
  return Number.isFinite(n) && n > 0 && n <= 500 ? Math.trunc(n) : 50;
}

export function getBatchJsonMaxRows() {
  const n = Number(process.env.PART_KNOWLEDGE_BATCH_MAX_ROWS);
  return Number.isFinite(n) && n > 0 && n <= 20000 ? Math.trunc(n) : 20000;
}

/**
 * @param {unknown} body
 * @returns {unknown[]}
 */
export function extractBatch1RowsFromBody(body) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && Array.isArray(body.rows)) return body.rows;
  throw new Error("Cần mảng JSON hoặc object { rows: [...] }");
}

export const extractBatchJsonRowsFromBody = extractBatch1RowsFromBody;

/** Trùng slug trong file: giữ bản ghi xuất hiện sau cùng (ghi đè đúng nghĩa). */
function dedupeRawRowsLastWins(rawRows) {
  const slugToRow = new Map();
  const noSlug = [];
  for (const raw of rawRows) {
    const slug = String(raw?.slug ?? "")
      .trim()
      .toLowerCase();
    if (!slug) {
      noSlug.push(raw);
      continue;
    }
    slugToRow.set(slug, raw);
  }
  return { withSlug: [...slugToRow.values()], noSlug };
}

function slugifyCategoryTag(name) {
  const s = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 128);
}

/** seo_priority: số, hoặc chữ A–E (ưu tiên SEO), hoặc chuỗi ngắn lưu seo_tier. */
function parseBatchSeoPriority(raw) {
  const v = raw?.seo_priority;
  if (v == null || v === "") return { tier: null, numeric: null };
  const s = String(v).trim().toUpperCase();
  if (/^[A-E]$/.test(s)) {
    const rank = { A: 100, B: 80, C: 60, D: 40, E: 20 };
    return { tier: s, numeric: rank[s] };
  }
  const n = Number(v);
  if (Number.isFinite(n)) return { tier: null, numeric: Math.trunc(n) };
  return { tier: s.slice(0, 8), numeric: null };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, row?: object, error?: string }}
 */
export function normalizeBatch1Row(raw, index) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `Dòng ${index}: không phải object` };
  }
  const slug = String(raw.slug ?? "")
    .trim()
    .toLowerCase();
  const englishName = String(raw.english_name ?? raw.name_en ?? "").trim();
  if (!slug) return { ok: false, error: `Dòng ${index}: thiếu slug` };
  if (!englishName) {
    return { ok: false, error: `Dòng ${index}: thiếu english_name` };
  }

  const parsedSeo = parseBatchSeoPriority(raw);
  const seoTier =
    String(raw.seo_tier ?? "")
      .trim()
      .toUpperCase() || parsedSeo.tier;
  const seoPriority = parsedSeo.numeric;

  const categoryName =
    String(raw.category_name ?? raw.name_vi ?? "").trim() || null;
  const categoryTag =
    String(raw.category_tag ?? "").trim() ||
    (categoryName ? slugifyCategoryTag(categoryName) : "");
  const nameVi =
    String(raw.name_vi ?? raw.category_name ?? "").trim() || englishName;

  let buyerIntentsV4 = null;
  const biRaw = raw.buyer_intents_v4 ?? raw.buyerIntentsV4;
  if (Array.isArray(biRaw)) {
    buyerIntentsV4 = biRaw.map((x) => String(x).trim()).filter(Boolean);
    if (!buyerIntentsV4.length) buyerIntentsV4 = null;
  }

  const row = {
    slug,
    nameVi,
    nameEn: englishName,
    canonicalName: String(raw.canonical_name ?? raw.name_vi ?? raw.category_name ?? "")
      .trim() || nameVi,
    categoryTag,
    categoryName,
    systemGroup: String(raw.system_group ?? "").trim() || null,
    vehicleArea: String(raw.vehicle_area ?? "").trim() || null,
    seoTier,
    seoPriority,
    tierClass: String(raw.tier_class ?? "").trim() || null,
    aiPriority:
      Number.isFinite(Number(raw.ai_priority)) ? Math.trunc(Number(raw.ai_priority)) : 50,
    searchScore:
      Number.isFinite(Number(raw.search_score))
        ? Math.trunc(Number(raw.search_score))
        : 50,
    diagnosisWeight:
      Number.isFinite(Number(raw.diagnosis_weight))
        ? Math.trunc(Number(raw.diagnosis_weight))
        : 50,
    sortOrder: seoPriority != null ? seoPriority : 0,
    aliases: Array.isArray(raw.aliases_json)
      ? raw.aliases_json.map((x) => String(x).trim()).filter(Boolean)
      : Array.isArray(raw.aliases)
        ? raw.aliases.map((x) => String(x).trim()).filter(Boolean)
        : Array.isArray(raw.aliases_vi)
          ? raw.aliases_vi.map((x) => String(x).trim()).filter(Boolean)
          : null,
    regionalAliases: Array.isArray(raw.regional_aliases_json)
      ? raw.regional_aliases_json.map((x) => String(x).trim()).filter(Boolean)
      : Array.isArray(raw.regional_aliases)
        ? raw.regional_aliases.map((x) => String(x).trim()).filter(Boolean)
      : null,
    summary: raw.summary != null ? String(raw.summary) : null,
    body: raw.body != null ? String(raw.body) : null,
    functionText: raw.function_text != null ? String(raw.function_text) : null,
    structureText:
      raw.structure_text != null ? String(raw.structure_text) : null,
    operationText:
      raw.operation_text != null ? String(raw.operation_text) : null,
    symptomsText: raw.symptoms_text != null ? String(raw.symptoms_text) : null,
    commonCausesText:
      raw.common_causes_text != null ? String(raw.common_causes_text) : null,
    replaceIntervalText:
      raw.replace_interval_text != null
        ? String(raw.replace_interval_text)
        : null,
    warningsText:
      raw.warnings_text != null ? String(raw.warnings_text) : null,
    buyingGuideText:
      raw.buying_guide_text != null ? String(raw.buying_guide_text) : null,
    faqText: raw.faq_text != null ? String(raw.faq_text) : null,
    stylePersonaV2:
      raw.style_persona_v2 != null
        ? String(raw.style_persona_v2).trim().toUpperCase().slice(0, 64) ||
          null
        : null,
    brandPersonaV3:
      raw.brand_persona_v3 != null
        ? String(raw.brand_persona_v3).trim().toUpperCase().slice(0, 64) ||
          null
        : null,
    buyerIntentsV4,
    symptomKeywords: Array.isArray(raw.symptom_keywords_json)
      ? raw.symptom_keywords_json.map((x) => String(x).trim()).filter(Boolean)
      : Array.isArray(raw.symptom_keywords)
        ? raw.symptom_keywords.map((x) => String(x).trim()).filter(Boolean)
        : null,
    searchIntents: Array.isArray(raw.search_intents_json)
      ? raw.search_intents_json.map((x) => String(x).trim()).filter(Boolean)
      : Array.isArray(raw.search_intents)
        ? raw.search_intents.map((x) => String(x).trim()).filter(Boolean)
        : null,
    crossSell: Array.isArray(raw.cross_sell_json)
      ? raw.cross_sell_json.map((x) => String(x).trim()).filter(Boolean)
      : Array.isArray(raw.cross_sell)
        ? raw.cross_sell.map((x) => String(x).trim()).filter(Boolean)
        : null,
    garageNotesText:
      raw.garage_notes_text != null ? String(raw.garage_notes_text) : null,
    buyerMistakesText:
      raw.buyer_mistakes_text != null ? String(raw.buyer_mistakes_text) : null,
    vnUsageNotesText:
      raw.vn_usage_notes_text != null ? String(raw.vn_usage_notes_text) : null,
  };

  return { ok: true, row };
}

/**
 * @param {unknown[]} rows
 * @returns {Promise<{ imported: number, inserted: number, updated: number, errors: { index: number, message: string }[], dedupeDropped: number, uniqueSlugs: number }>}
 */
export async function importBatch1PartKnowledge(rows) {
  return importPartKnowledgeRows(
    rows,
    getBatch1MaxRows(),
    "PART_KNOWLEDGE_BATCH1_MAX_ROWS",
  );
}

export async function importBatchJsonPartKnowledge(rows) {
  return importPartKnowledgeRows(
    rows,
    getBatchJsonMaxRows(),
    "PART_KNOWLEDGE_BATCH_MAX_ROWS",
  );
}

async function importPartKnowledgeRows(rows, max, envName) {
  if (!Array.isArray(rows)) {
    throw new Error("rows phải là mảng");
  }

  if (rows.length > max) {
    throw new Error(
      `Tối đa ${max} dòng mỗi lần (nhận ${rows.length}). Đặt ${envName} nếu cần tăng.`,
    );
  }

  const { withSlug, noSlug } = dedupeRawRowsLastWins(rows);
  const dedupeDropped = rows.length - withSlug.length - noSlug.length;

  const toProcess = [...withSlug, ...noSlug];
  const normalized = [];
  const errors = [];

  toProcess.forEach((raw, i) => {
    const r = normalizeBatch1Row(raw, i);
    if (r.ok) normalized.push(r.row);
    else errors.push({ index: i, message: r.error });
  });

  if (normalized.length === 0) {
    return {
      imported: 0,
      inserted: 0,
      updated: 0,
      errors,
      dedupeDropped,
      uniqueSlugs: withSlug.length,
    };
  }

  const summary = await upsertPartKnowledgeBatch1Rows(normalized);
  return {
    imported: summary.imported,
    inserted: summary.inserted,
    updated: summary.updated,
    errors,
    dedupeDropped,
    uniqueSlugs: withSlug.length,
  };
}
