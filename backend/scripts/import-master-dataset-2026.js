/**
 * Import Otofine Master Dataset 2026 into part_knowledge.
 *
 * Usage:
 *   npm run dataset:import
 */
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import {
  MASTER_DATASET_PATH,
  parseArgs,
  readJsonFile,
  resolvePath,
} from "./dataset-common.js";
import { validateKnowledgeDataset } from "../services/knowledgeDatasetValidator.service.js";
import { toPartKnowledgeImportRow } from "../services/knowledgeDataset.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config({ path: path.join(__dirname, "../.env"), quiet: true });

const args = parseArgs();
const input = resolvePath(args.input) || MASTER_DATASET_PATH;
const dataset = readJsonFile(input);
const validation = validateKnowledgeDataset(dataset);

if (!validation.ok) {
  console.error(
    JSON.stringify(
      {
        input,
        imported: 0,
        error_count: validation.errors.length,
        errors: validation.errors.slice(0, 50),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

try {
  const { importBatchJsonPartKnowledge } = await import(
    "../services/partKnowledgeImport.service.js"
  );
  const { pool } = await import("../config/db.js");
  const rows = dataset.rows.map(toPartKnowledgeImportRow);
  const result = await importBatchJsonPartKnowledge(rows);
  console.log(
    JSON.stringify(
      {
        input,
        total_rows: rows.length,
        inserted_count: result.inserted,
        updated_count: result.updated,
        error_count: result.errors.length,
        dedupe_dropped: result.dedupeDropped,
        unique_slugs: result.uniqueSlugs,
        errors: result.errors,
      },
      null,
      2,
    ),
  );
  await pool.end();
  process.exit(result.errors.length ? 1 : 0);
} catch (e) {
  console.error(
    JSON.stringify(
      {
        input,
        inserted_count: 0,
        updated_count: 0,
        error_count: 1,
        errors: [{ message: e?.message || String(e) }],
      },
      null,
      2,
    ),
  );
  const { pool } = await import("../config/db.js").catch(() => ({ pool: null }));
  await pool?.end().catch(() => {});
  process.exit(1);
}
