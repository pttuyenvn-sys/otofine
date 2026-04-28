/**
 * Index Otofine Master Dataset 2026 into Typesense.
 *
 * Usage:
 *   npm run dataset:index
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
import {
  buildKnowledgeTypesenseClient,
  ensureKnowledgeCollection,
  getKnowledgeCollectionName,
  isKnowledgeTypesenseConfigured,
  rowToKnowledgeDocument,
} from "../services/knowledgeSearchIndex.service.js";

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
        indexed_count: 0,
        skipped: true,
        reason: "dataset_validation_failed",
        errors: validation.errors.slice(0, 50),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (!isKnowledgeTypesenseConfigured()) {
  console.log(
    JSON.stringify(
      {
        input,
        indexed_count: 0,
        skipped: true,
        reason: "missing_TYPESENSE_HOST_or_TYPESENSE_API_KEY",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const collection = getKnowledgeCollectionName();
const client = buildKnowledgeTypesenseClient();
const collectionStatus = await ensureKnowledgeCollection(client);
const docs = dataset.rows.map(rowToKnowledgeDocument);
const jsonl = docs.map((doc) => JSON.stringify(doc)).join("\n");
const importRes = await client.collections(collection).documents().import(jsonl, {
  action: "upsert",
});

let failed = 0;
if (typeof importRes === "string") {
  for (const line of importRes.trim().split("\n")) {
    if (!line) continue;
    try {
      if (!JSON.parse(line).success) failed++;
    } catch {
      failed++;
    }
  }
} else if (Array.isArray(importRes)) {
  failed = importRes.filter((row) => !row.success).length;
}

console.log(
  JSON.stringify(
    {
      input,
      collection,
      collection_created: collectionStatus.created,
      indexed_count: docs.length - failed,
      failed_count: failed,
    },
    null,
    2,
  ),
);

process.exit(failed ? 1 : 0);
