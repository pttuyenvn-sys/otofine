import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(__dirname, "..");
export const MASTER_DATASET_PATH = path.join(
  BACKEND_ROOT,
  "data",
  "knowledge",
  "otofine-master-dataset-2026.json",
);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const [key, ...valueParts] = item.slice(2).split("=");
    args[key] = valueParts.length ? valueParts.join("=") : true;
  }
  return args;
}

export function resolvePath(input) {
  if (!input) return null;
  if (path.isAbsolute(input)) return input;
  const fromCwd = path.resolve(process.cwd(), input);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(BACKEND_ROOT, input);
}

export function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function extractRowsFromJson(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.rows)) return value.rows;
  throw new Error("JSON source phải là mảng hoặc object { rows: [...] }");
}

export function collectJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...collectJsonFiles(abs));
    else if (item.isFile() && item.name.toLowerCase().endsWith(".json")) out.push(abs);
  }
  return out.sort();
}
