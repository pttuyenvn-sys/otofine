/**
 * MERGE import → dbo.part_knowledge (SQL Server).
 * - slug: khớp thì UPDATE toàn bộ cột, chưa có thì INSERT; id = IDENTITY (không nạp)
 * - Một transaction cho cả lô: COMMIT khi hết, ROLLBACK nếu lỗi
 * - Cột JSON: aliases_json, regional_aliases_json, buyer_intents_v4, symptom_keywords_json, search_intents_json, cross_sell_json
 *
 * Mặc định đọc: backend/data/part-knowledge/part_knowledge_upsert_batch.json
 * (bản 100 dòng = copy từ part_knowledge_99_ENTERPRISE_FINAL.json).
 *
 * Chạy (từ thư mục backend):
 *   $env:DB_ENGINE="mssql"
 *   npm run knowledge:upsert:merge
 *   npm run knowledge:upsert:merge:verbose
 *   node scripts/import-part-knowledge-99-merge.js --input=C:\\path\\file.json
 *   node scripts/import-part-knowledge-99-merge.js -   (đọc JSON từ stdin)
 *   node scripts/import-part-knowledge-99-merge.js --log-file=logs/upsert.log
 */
import path from "path";
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import sql from "mssql";
import dotenv from "dotenv";
import { getMssqlPool } from "../config/mssqlPool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, "..");
process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config({ path: path.join(__dirname, "../.env"), quiet: true });

const JSON_COLUMNS = new Set([
  "aliases_json",
  "regional_aliases_json",
  "buyer_intents_v4",
  "symptom_keywords_json",
  "search_intents_json",
  "cross_sell_json",
]);

/** All writable non-id columns (order matches MERGE) — must match dbo.part_knowledge. */
const COLUMNS = [
  "slug",
  "name_vi",
  "name_en",
  "canonical_name",
  "aliases_json",
  "regional_aliases_json",
  "summary",
  "body",
  "category_tag",
  "category_name",
  "system_group",
  "vehicle_area",
  "seo_priority",
  "seo_tier",
  "tier_class",
  "ai_priority",
  "search_score",
  "diagnosis_weight",
  "is_active",
  "function_text",
  "structure_text",
  "operation_text",
  "symptoms_text",
  "common_causes_text",
  "replace_interval_text",
  "warnings_text",
  "buying_guide_text",
  "faq_text",
  "garage_notes_text",
  "buyer_mistakes_text",
  "vn_usage_notes_text",
  "style_persona_v2",
  "brand_persona_v3",
  "buyer_intents_v4",
  "symptom_keywords_json",
  "search_intents_json",
  "cross_sell_json",
];

const TEXT_MAX = sql.NVarChar(sql.MAX);

function parseArgs() {
  const out = { input: null, verbose: false, logFile: null };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--input=")) out.input = a.slice("--input=".length);
    if (a === "-") out.input = "-";
    if (a.startsWith("--log-file=")) out.logFile = a.slice("--log-file=".length);
    if (a === "--verbose" || a === "-v") out.verbose = true;
  }
  return out;
}

function extractRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.rows)) return raw.rows;
  throw new Error("JSON phải là mảng [...] hoặc { rows: [...] }");
}

/** Trùng slug: bản ghi xuất hiện sau cùng thắng. */
function dedupeBySlugLastWins(rows) {
  const m = new Map();
  for (const r of rows) {
    const s = String(r?.slug ?? "")
      .trim()
      .toLowerCase();
    if (!s) continue;
    m.set(s, r);
  }
  return [...m.values()];
}

function toJsonColumnValue(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function toBit(v) {
  if (v == null) return 1;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  if (n === 0) return 0;
  return 1;
}

function toInt(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
function rowToParams(raw) {
  if (!raw || typeof raw !== "object") return {};
  const p = {};
  for (const col of COLUMNS) {
    p[col] = null;
  }
  const slug = String(raw.slug ?? "")
    .trim()
    .toLowerCase();
  p.slug = slug;

  for (const col of COLUMNS) {
    if (col === "slug") continue;
    if (Object.prototype.hasOwnProperty.call(raw, col)) {
      const v = raw[col];
      if (JSON_COLUMNS.has(col)) {
        p[col] = toJsonColumnValue(v);
        continue;
      }
      if (col === "is_active") {
        p[col] = toBit(v);
        continue;
      }
      if (col === "ai_priority" || col === "search_score" || col === "diagnosis_weight") {
        p[col] = toInt(v, 50);
        continue;
      }
      p[col] = v == null ? null : v;
    }
  }

  // Sensible fallbacks if file uses legacy keys (optional)
  if (p.name_vi == null && raw.name_vi == null) {
    p.name_vi = raw.category_name != null ? String(raw.category_name) : null;
  }
  if (p.name_en == null && raw.name_en == null && raw.english_name != null) {
    p.name_en = String(raw.english_name);
  }
  if (p.canonical_name == null && raw.canonical_name == null) {
    p.canonical_name =
      p.name_vi != null
        ? String(p.name_vi)
        : p.name_en != null
          ? String(p.name_en)
          : p.slug;
  }
  if (p.category_tag == null || p.category_tag === "") {
    p.category_tag = p.category_name != null ? String(p.category_name).slice(0, 128) : "";
  }
  p.ai_priority = p.ai_priority ?? 50;
  p.search_score = p.search_score ?? 50;
  p.diagnosis_weight = p.diagnosis_weight ?? 50;
  p.is_active = p.is_active ?? 1;
  if (p.seo_priority != null) p.seo_priority = String(p.seo_priority).trim().slice(0, 10) || null;
  if (p.seo_tier != null) p.seo_tier = String(p.seo_tier).trim().slice(0, 10) || null;
  if (p.tier_class != null) p.tier_class = String(p.tier_class).trim().slice(0, 10) || null;
  for (const k of [
    "style_persona_v2",
    "brand_persona_v3",
    "function_text",
    "structure_text",
    "operation_text",
    "symptoms_text",
    "common_causes_text",
  ]) {
    if (p[k] != null) p[k] = String(p[k]);
  }
  return p;
}

function bindRow(request, row) {
  request.input("slug", sql.NVarChar(191), row.slug);
  request.input("name_vi", sql.NVarChar(512), row.name_vi);
  request.input("name_en", sql.NVarChar(512), row.name_en);
  request.input("canonical_name", sql.NVarChar(512), row.canonical_name);
  request.input("aliases_json", TEXT_MAX, row.aliases_json);
  request.input("regional_aliases_json", TEXT_MAX, row.regional_aliases_json);
  request.input("summary", TEXT_MAX, row.summary);
  request.input("body", TEXT_MAX, row.body);
  request.input("category_tag", sql.NVarChar(128), row.category_tag);
  request.input("category_name", sql.NVarChar(255), row.category_name);
  request.input("system_group", sql.NVarChar(128), row.system_group);
  request.input("vehicle_area", sql.NVarChar(128), row.vehicle_area);
  request.input("seo_priority", sql.NVarChar(10), row.seo_priority);
  request.input("seo_tier", sql.NVarChar(10), row.seo_tier);
  request.input("tier_class", sql.NVarChar(10), row.tier_class);
  request.input("ai_priority", sql.Int, row.ai_priority);
  request.input("search_score", sql.Int, row.search_score);
  request.input("diagnosis_weight", sql.Int, row.diagnosis_weight);
  request.input("is_active", sql.Bit, row.is_active ? 1 : 0);
  for (const c of [
    "function_text",
    "structure_text",
    "operation_text",
    "symptoms_text",
    "common_causes_text",
    "replace_interval_text",
    "warnings_text",
    "buying_guide_text",
    "faq_text",
    "garage_notes_text",
    "buyer_mistakes_text",
    "vn_usage_notes_text",
  ]) {
    request.input(c, TEXT_MAX, row[c]);
  }
  request.input("style_persona_v2", sql.NVarChar(64), row.style_persona_v2);
  request.input("brand_persona_v3", sql.NVarChar(64), row.brand_persona_v3);
  request.input("buyer_intents_v4", TEXT_MAX, row.buyer_intents_v4);
  request.input("symptom_keywords_json", TEXT_MAX, row.symptom_keywords_json);
  request.input("search_intents_json", TEXT_MAX, row.search_intents_json);
  request.input("cross_sell_json", TEXT_MAX, row.cross_sell_json);
  return request;
}

const MERGE_SQL = `
MERGE dbo.part_knowledge WITH (HOLDLOCK) AS t
USING (SELECT
  @slug AS slug,
  @name_vi AS name_vi,
  @name_en AS name_en,
  @canonical_name AS canonical_name,
  @aliases_json AS aliases_json,
  @regional_aliases_json AS regional_aliases_json,
  @summary AS summary,
  @body AS body,
  @category_tag AS category_tag,
  @category_name AS category_name,
  @system_group AS system_group,
  @vehicle_area AS vehicle_area,
  @seo_priority AS seo_priority,
  @seo_tier AS seo_tier,
  @tier_class AS tier_class,
  @ai_priority AS ai_priority,
  @search_score AS search_score,
  @diagnosis_weight AS diagnosis_weight,
  @is_active AS is_active,
  @function_text AS function_text,
  @structure_text AS structure_text,
  @operation_text AS operation_text,
  @symptoms_text AS symptoms_text,
  @common_causes_text AS common_causes_text,
  @replace_interval_text AS replace_interval_text,
  @warnings_text AS warnings_text,
  @buying_guide_text AS buying_guide_text,
  @faq_text AS faq_text,
  @garage_notes_text AS garage_notes_text,
  @buyer_mistakes_text AS buyer_mistakes_text,
  @vn_usage_notes_text AS vn_usage_notes_text,
  @style_persona_v2 AS style_persona_v2,
  @brand_persona_v3 AS brand_persona_v3,
  @buyer_intents_v4 AS buyer_intents_v4,
  @symptom_keywords_json AS symptom_keywords_json,
  @search_intents_json AS search_intents_json,
  @cross_sell_json AS cross_sell_json
) AS s
  ON t.slug = s.slug
WHEN MATCHED THEN UPDATE SET
  name_vi = s.name_vi,
  name_en = s.name_en,
  canonical_name = s.canonical_name,
  aliases_json = s.aliases_json,
  regional_aliases_json = s.regional_aliases_json,
  summary = s.summary,
  body = s.body,
  category_tag = s.category_tag,
  category_name = s.category_name,
  system_group = s.system_group,
  vehicle_area = s.vehicle_area,
  seo_priority = s.seo_priority,
  seo_tier = s.seo_tier,
  tier_class = s.tier_class,
  ai_priority = s.ai_priority,
  search_score = s.search_score,
  diagnosis_weight = s.diagnosis_weight,
  is_active = s.is_active,
  function_text = s.function_text,
  structure_text = s.structure_text,
  operation_text = s.operation_text,
  symptoms_text = s.symptoms_text,
  common_causes_text = s.common_causes_text,
  replace_interval_text = s.replace_interval_text,
  warnings_text = s.warnings_text,
  buying_guide_text = s.buying_guide_text,
  faq_text = s.faq_text,
  garage_notes_text = s.garage_notes_text,
  buyer_mistakes_text = s.buyer_mistakes_text,
  vn_usage_notes_text = s.vn_usage_notes_text,
  style_persona_v2 = s.style_persona_v2,
  brand_persona_v3 = s.brand_persona_v3,
  buyer_intents_v4 = s.buyer_intents_v4,
  symptom_keywords_json = s.symptom_keywords_json,
  search_intents_json = s.search_intents_json,
  cross_sell_json = s.cross_sell_json,
  updated_at = SYSDATETIME()
WHEN NOT MATCHED BY TARGET THEN
  INSERT (
    slug, name_vi, name_en, canonical_name, aliases_json, regional_aliases_json,
    summary, body, category_tag, category_name, system_group, vehicle_area,
    seo_priority, seo_tier, tier_class, ai_priority, search_score, diagnosis_weight, is_active,
    function_text, structure_text, operation_text, symptoms_text, common_causes_text,
    replace_interval_text, warnings_text, buying_guide_text, faq_text,
    garage_notes_text, buyer_mistakes_text, vn_usage_notes_text,
    style_persona_v2, brand_persona_v3, buyer_intents_v4, symptom_keywords_json, search_intents_json, cross_sell_json
  )
  VALUES (
    s.slug, s.name_vi, s.name_en, s.canonical_name, s.aliases_json, s.regional_aliases_json,
    s.summary, s.body, s.category_tag, s.category_name, s.system_group, s.vehicle_area,
    s.seo_priority, s.seo_tier, s.tier_class, s.ai_priority, s.search_score, s.diagnosis_weight, s.is_active,
    s.function_text, s.structure_text, s.operation_text, s.symptoms_text, s.common_causes_text,
    s.replace_interval_text, s.warnings_text, s.buying_guide_text, s.faq_text,
    s.garage_notes_text, s.buyer_mistakes_text, s.vn_usage_notes_text,
    s.style_persona_v2, s.brand_persona_v3, s.buyer_intents_v4, s.symptom_keywords_json, s.search_intents_json, s.cross_sell_json
  )
OUTPUT $action;
`;

const args = parseArgs();
const defaultJson = path.join(
  BACKEND_ROOT,
  "data",
  "part-knowledge",
  "part_knowledge_upsert_batch.json",
);
const inputPath =
  args.input === "-" ? "-" : path.resolve(args.input || defaultJson);

function readInput() {
  if (args.input === "-") {
    return readFileSync(0, "utf8");
  }
  return readFileSync(inputPath, "utf8");
}

const raw = JSON.parse(readInput());
const rowsAll = extractRows(raw);
const slugCount = new Map();
for (const row of rowsAll) {
  const s = String(row?.slug ?? "")
    .trim()
    .toLowerCase();
  if (s) slugCount.set(s, (slugCount.get(s) || 0) + 1);
}
const dupSlugs = [...slugCount.entries()].filter(([, n]) => n > 1).map(([s]) => s);
const rows = dedupeBySlugLastWins(rowsAll);
let ins = 0;
let up = 0;
const details = [];

if (args.logFile) {
  const logPath = path.resolve(args.logFile);
  const d = path.dirname(logPath);
  if (d) {
    mkdirSync(d, { recursive: true });
  }
  writeFileSync(logPath, "", "utf8");
}

const pool = await getMssqlPool();
const tr = new sql.Transaction(pool);
await tr.begin();
try {
  for (let i = 0; i < rows.length; i++) {
    const r = rowToParams(rows[i]);
    if (!r.slug) throw new Error(`Dòng ${i}: thiếu slug`);
    const res = await bindRow(new sql.Request(tr), r).query(MERGE_SQL);
    const row0 = res.recordset?.[0];
    const a = String(
      row0
        ? Object.values(row0)[0]
        : "",
    )
      .trim()
      .toUpperCase();
    if (a === "INSERT") ins += 1;
    else if (a === "UPDATE") up += 1;
    const line = `[${i + 1}/${rows.length}] ${r.slug} -> ${a || "?"}`;
    if (args.verbose) console.error(line);
    if (a === "INSERT" || a === "UPDATE") {
      details.push({ slug: r.slug, action: a });
    }
    if (args.logFile) {
      const logPath = path.resolve(args.logFile);
      const entry = { ts: new Date().toISOString(), slug: r.slug, action: a || null };
      appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
    }
  }
  await tr.commit();
} catch (e) {
  await tr.rollback();
  throw e;
}

const out = {
  ok: true,
  input: args.input === "-" ? "(stdin)" : inputPath,
  input_rows: rowsAll.length,
  unique_slugs: rows.length,
  duplicate_slugs_in_file: dupSlugs,
  inserted: ins,
  updated: up,
  transaction: "COMMITTED",
};

if (args.verbose) {
  out.details = details;
}

console.log(JSON.stringify(out, null, 2));
process.exit(0);
