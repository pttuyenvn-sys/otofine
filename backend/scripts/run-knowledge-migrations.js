/**
 * Chạy migration + seed part_knowledge theo DB_ENGINE (mysql | mssql).
 * MySQL: dùng mysql2 multipleStatements.
 * SQL Server: gửi từng file bằng mssql (không dùng GO).
 *
 * Usage: node scripts/run-knowledge-migrations.js
 *        DB_ENGINE=mssql node scripts/run-knowledge-migrations.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { getDbEngine } from "../config/db.engine.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../migrations");

function isAlreadyAppliedMysqlError(e) {
  return [
    "ER_DUP_FIELDNAME",
    "ER_DUP_KEYNAME",
    "ER_TABLE_EXISTS_ERROR",
  ].includes(e?.code);
}

function isAlreadyAppliedMssqlError(e) {
  const message = String(e?.message || "").toLowerCase();
  return (
    message.includes("already an object named") ||
    message.includes("column names in each table must be unique") ||
    message.includes("duplicate column name") ||
    message.includes("already exists")
  );
}

async function runMysql() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    multipleStatements: true,
  });
  const files = [
    "005_part_knowledge_mysql.sql",
    "006_part_knowledge_seed_mysql.sql",
    "007_part_knowledge_batch1_columns_mysql.sql",
    "008_part_knowledge_batch1_extended_mysql.sql",
    "009_part_knowledge_style_engine_mysql.sql",
    "010_part_knowledge_import_batch_json_columns_mysql.sql",
    "011_part_knowledge_production_schema_mysql.sql",
    "013_products_part_knowledge_id_mysql.sql",
  ];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    try {
      await conn.query(sql);
      console.log("[mysql] OK", f);
    } catch (e) {
      if (isAlreadyAppliedMysqlError(e)) {
        console.log("[mysql] SKIP already applied", f, e.code);
        continue;
      }
      throw e;
    }
  }
  await conn.end();
}

async function runMssql() {
  const { getMssqlPool } = await import("../config/mssqlPool.js");
  const pool = await getMssqlPool();
  const files = [
    "005_part_knowledge_sqlserver.sql",
    "006_part_knowledge_seed_sqlserver.sql",
    "007_part_knowledge_batch1_columns_sqlserver.sql",
    "008_part_knowledge_batch1_extended_sqlserver.sql",
    "009_part_knowledge_style_engine_sqlserver.sql",
    "010_part_knowledge_import_batch_json_columns_sqlserver.sql",
    "011_part_knowledge_production_schema_sqlserver.sql",
  ];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    try {
      await pool.request().query(sql);
      console.log("[mssql] OK", f);
    } catch (e) {
      if (isAlreadyAppliedMssqlError(e)) {
        console.log("[mssql] SKIP already applied", f);
        continue;
      }
      throw e;
    }
  }
}

const engine = getDbEngine();
console.log("DB_ENGINE:", engine);

if (engine === "mssql") {
  await runMssql();
} else {
  await runMysql();
}

console.log("Xong part_knowledge migrations.");
process.exit(0);
