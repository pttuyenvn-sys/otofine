/**
 * Build Otofine Master Dataset 2026 from batch/raw JSON sources.
 *
 * Usage:
 *   npm run dataset:build
 *   node scripts/build-master-dataset-2026.js --source=data/raw-parts/list.json
 */
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import {
  BACKEND_ROOT,
  MASTER_DATASET_PATH,
  collectJsonFiles,
  extractRowsFromJson,
  parseArgs,
  readJsonFile,
  resolvePath,
  writeJsonFile,
} from "./dataset-common.js";
import { buildMasterDataset } from "../services/knowledgeDataset.service.js";
import { validateKnowledgeDataset } from "../services/knowledgeDatasetValidator.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config({ path: path.join(__dirname, "../.env"), quiet: true });

function dbRowToRaw(row) {
  return {
    slug: row.slug,
    category_name: row.categoryName || row.nameVi,
    english_name: row.nameEn || row.categoryName || row.nameVi,
    system_group: row.systemGroup,
    seo_priority: row.seoTier || row.seoPriority,
    style_persona_v2: row.stylePersonaV2,
    brand_persona_v3: row.brandPersonaV3,
    buyer_intents_v4: row.buyerIntentsV4,
    function_text: row.functionText,
    structure_text: row.structureText,
    operation_text: row.operationText,
    symptoms_text: row.symptomsText,
    replace_interval_text: row.replaceIntervalText,
    warnings_text: row.warningsText,
    buying_guide_text: row.buyingGuideText,
    garage_notes_text: row.garageNotesText,
    buyer_mistakes_text: row.buyerMistakesText,
    vn_usage_notes_text: row.vnUsageNotesText,
    faq_text: row.faqText,
  };
}

async function loadRowsFromPartKnowledgeDb() {
  const { listPartKnowledge } = await import("../repositories/partKnowledge.repository.js");
  const { pool } = await import("../config/db.js");
  const rawRows = [];
  let page = 1;
  const limit = 100;
  for (;;) {
    const result = await listPartKnowledge({ page, limit });
    rawRows.push(...result.rows.map(dbRowToRaw));
    if (!result.rows.length || rawRows.length >= result.total) break;
    page += 1;
  }
  await pool.end().catch(() => {});
  return rawRows;
}

const args = parseArgs();
const output = resolvePath(args.output) || MASTER_DATASET_PATH;
const sources = [];

if (args.source) {
  const sourcePath = resolvePath(args.source);
  if (!sourcePath) throw new Error("Không resolve được --source");
  sources.push(sourcePath);
} else {
  sources.push(
    ...collectJsonFiles(path.join(BACKEND_ROOT, "data", "knowledge", "batches")),
    ...collectJsonFiles(path.join(BACKEND_ROOT, "data", "raw-parts")),
    ...collectJsonFiles(path.join(BACKEND_ROOT, "data", "part-knowledge")).filter(
      (file) => !path.basename(file).toLowerCase().includes("example"),
    ),
  );
}

let dbFallbackRows = [];
if (!sources.length || args["from-db"]) {
  try {
    dbFallbackRows = await loadRowsFromPartKnowledgeDb();
  } catch (e) {
    if (args["from-db"]) throw e;
  }
}

if (!sources.length && !dbFallbackRows.length) {
  console.error(
    JSON.stringify(
      {
        output,
        total_sources: 0,
        message:
          "Chưa có source JSON. Đặt batch/raw JSON vào data/knowledge/batches hoặc data/raw-parts, hoặc truyền --source=...",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const rawRows = [];
const sourceSummaries = [];

for (const file of sources) {
  const json = readJsonFile(file);
  const rows = extractRowsFromJson(json);
  rawRows.push(...rows);
  sourceSummaries.push({ file, rows: rows.length });
}

if (dbFallbackRows.length) {
  rawRows.push(...dbFallbackRows);
  sourceSummaries.push({ source: "part_knowledge_db", rows: dbFallbackRows.length });
}

const { dataset, summary } = buildMasterDataset(rawRows);
const validation = validateKnowledgeDataset(dataset);
writeJsonFile(output, dataset);

console.log(
  JSON.stringify(
    {
      output,
      total_sources: sources.length,
      sources: sourceSummaries,
      ...summary,
      validation: validation.summary,
    },
    null,
    2,
  ),
);

process.exit(validation.ok ? 0 : 1);
