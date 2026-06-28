#!/usr/bin/env node
/**
 * Applies 067_product_car_applications_is_primary.sql
 *
 * Usage: node scripts/run-primary-fitment-migration.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationFile = "067_product_car_applications_is_primary.sql";

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, "../migrations", migrationFile),
    "utf8",
  );

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    multipleStatements: true,
  });

  try {
    console.log("[primary-fitment-migration] applying", migrationFile);
    await conn.query(sql);
    console.log("[primary-fitment-migration] OK");
  } finally {
    await conn.end();
  }
}

await main();
process.exit(0);
