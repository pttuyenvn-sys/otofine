/**
 * Import reusable part_knowledge batch JSON.
 *
 * Format: an array of rows or { "rows": [...] }.
 *
 * Usage:
 *   node scripts/import-batch-json.js --input=data/part-knowledge/batch.json
 *   npm run import:knowledge -- --input=data/part-knowledge/batch.json
 */
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import {
  extractRowsFromJson,
  parseArgs,
  readJsonFile,
  resolvePath,
} from "./dataset-common.js";
import { importBatchJsonPartKnowledge } from "../services/partKnowledgeImport.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DOTENV_CONFIG_QUIET = "true";
dotenv.config({ path: path.join(__dirname, "../.env"), quiet: true });

const args = parseArgs();
const positional = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const input = resolvePath(args.input || positional);

if (!input) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        imported: 0,
        error_count: 1,
        errors: [{ message: "Thiếu --input hoặc đường dẫn file JSON" }],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

try {
  const rows = extractRowsFromJson(readJsonFile(input));
  const result = await importBatchJsonPartKnowledge(rows);
  console.log(
    JSON.stringify(
      {
        ok: result.errors.length === 0,
        input,
        total_rows: rows.length,
        imported: result.imported,
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
  process.exit(result.errors.length ? 1 : 0);
} catch (e) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        input,
        imported: 0,
        inserted_count: 0,
        updated_count: 0,
        error_count: 1,
        errors: [{ message: e?.message || String(e) }],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
