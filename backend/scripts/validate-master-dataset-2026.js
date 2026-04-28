/**
 * Validate Otofine Master Dataset 2026.
 *
 * Usage:
 *   npm run dataset:validate
 *   node scripts/validate-master-dataset-2026.js --input=data/knowledge/file.json
 */
import {
  MASTER_DATASET_PATH,
  parseArgs,
  readJsonFile,
  resolvePath,
} from "./dataset-common.js";
import { validateKnowledgeDataset } from "../services/knowledgeDatasetValidator.service.js";

const args = parseArgs();
const input = resolvePath(args.input) || MASTER_DATASET_PATH;
const dataset = readJsonFile(input);
const validation = validateKnowledgeDataset(dataset);

console.log(
  JSON.stringify(
    {
      input,
      ok: validation.ok,
      ...validation.summary,
      errors: validation.errors.slice(0, 50),
      warnings: validation.warnings.slice(0, 50),
    },
    null,
    2,
  ),
);

process.exit(validation.ok ? 0 : 1);
