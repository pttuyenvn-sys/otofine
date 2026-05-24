#!/usr/bin/env node
/**
 * Run shop auth migration (038).
 * Usage: npm run migrate:auth
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "migrations", "038_shop_auth_upgrade.sql");

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
    console.log("[migrate:auth] OK:", sqlPath);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[migrate:auth] FAILED:", err.message);
  process.exit(1);
});
