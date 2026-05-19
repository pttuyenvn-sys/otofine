#!/usr/bin/env node
/**
 * Run RFQ Sprint 1 migration (multiple statements — PREPARE/EXECUTE safe).
 * Usage:
 *   npm run migrate:rfq
 *   npm run migrate:rfq:hardening
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationArg = process.argv[2];
const sqlPath = path.join(
  __dirname,
  "..",
  "migrations",
  migrationArg || "020_rfq_sprint1_mvp.sql",
);

async function main() {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log("[migrate:rfq] OK:", sqlPath);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("[migrate:rfq] FAILED:", e.message);
  process.exit(1);
});
