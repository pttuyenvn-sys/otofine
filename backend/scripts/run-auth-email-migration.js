#!/usr/bin/env node
/** Run 039 auth email / password_reset_tokens migration */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const sqlPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
  "039_auth_email_password_flow.sql",
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
    console.log("[migrate:auth:email] OK:", sqlPath);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("[migrate:auth:email] FAILED:", e.message);
  process.exit(1);
});
