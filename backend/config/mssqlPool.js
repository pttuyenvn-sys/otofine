import sql from "mssql";
import dotenv from "dotenv";
import { getDbEngine } from "./db.engine.js";

dotenv.config();

let poolPromise = null;

/**
 * @returns {Promise<import("mssql").ConnectionPool>}
 */
export async function getMssqlPool() {
  if (getDbEngine() !== "mssql") {
    throw new Error("getMssqlPool chỉ dùng khi DB_ENGINE=mssql");
  }
  if (!poolPromise) {
    const port = process.env.DB_PORT
      ? parseInt(String(process.env.DB_PORT), 10)
      : undefined;
    poolPromise = new sql.ConnectionPool({
      server: process.env.DB_HOST || "localhost",
      port: Number.isFinite(port) ? port : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      options: {
        encrypt: process.env.DB_MSSQL_ENCRYPT !== "0",
        trustServerCertificate: process.env.DB_MSSQL_TRUST_CERT !== "0",
      },
    }).connect();
  }
  return poolPromise;
}
