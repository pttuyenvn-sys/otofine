/**
 * Export import-ready JSON for part_knowledge from the master dataset.
 *
 * Usage:
 *   npm run dataset:export-import
 */
import path from "path";
import {
  BACKEND_ROOT,
  MASTER_DATASET_PATH,
  parseArgs,
  readJsonFile,
  resolvePath,
  writeJsonFile,
} from "./dataset-common.js";
import { toPartKnowledgeImportRow } from "../services/knowledgeDataset.service.js";
import { validateKnowledgeDataset } from "../services/knowledgeDatasetValidator.service.js";

const args = parseArgs();
const input = resolvePath(args.input) || MASTER_DATASET_PATH;
const output =
  resolvePath(args.output) ||
  path.join(BACKEND_ROOT, "data", "knowledge", "part-knowledge-import-ready.json");

const dataset = readJsonFile(input);
const validation = validateKnowledgeDataset(dataset);

if (!validation.ok) {
  console.error(
    JSON.stringify(
      {
        input,
        output,
        exported_rows: 0,
        error_count: validation.errors.length,
        errors: validation.errors.slice(0, 50),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const rows = dataset.rows
  .filter((row) => row.is_active !== false)
  .map(toPartKnowledgeImportRow);

writeJsonFile(output, { rows });

console.log(
  JSON.stringify(
    {
      input,
      output,
      exported_rows: rows.length,
      warning_count: validation.warnings.length,
    },
    null,
    2,
  ),
);
