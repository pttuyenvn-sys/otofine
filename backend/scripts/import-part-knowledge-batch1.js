/**
 * Import Batch 1 part_knowledge từ file JSON.
 *
 * Định dạng: mảng các object hoặc { "rows": [...] }
 * Trường: slug, category_name, english_name, system_group, seo_priority,
 *         function_text, symptoms_text, replace_interval_text, faq_text
 *
 * Usage: node scripts/import-part-knowledge-batch1.js path/to/batch1.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  importBatch1PartKnowledge,
  extractBatch1RowsFromBody,
} from "../services/partKnowledgeImport.service.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileArg = process.argv[2];

if (!fileArg) {
  console.error(
    "Usage: node scripts/import-part-knowledge-batch1.js <file.json>",
  );
  process.exit(1);
}

const abs = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
const raw = fs.readFileSync(abs, "utf8");
const parsed = JSON.parse(raw);
const rows = extractBatch1RowsFromBody(parsed);

const result = await importBatch1PartKnowledge(rows);
console.log(JSON.stringify({ ...result, file: abs }, null, 2));
process.exit(result.errors?.length ? 1 : 0);
