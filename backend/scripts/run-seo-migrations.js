/**
 * Applies SEO Engine MySQL migration(s).
 *
 * Usage: node scripts/run-seo-migrations.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../migrations");

const files = ["014_seo_engine_mysql.sql"];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    multipleStatements: true,
  });
  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
      await conn.query(sql);
      console.log("[seo-migrations] OK", f);
    }
  } finally {
    await conn.end();
  }
}

await main();
console.log("SEO migrations done.");
process.exit(0);
