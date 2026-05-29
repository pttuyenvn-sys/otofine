import jwt from "jsonwebtoken";
import { pool } from "../../../config/db.js";
import crypto from "crypto";
import { authConfig } from "../config/auth.config.js";

function logAuthRuntime(route = "(unknown)") {
  try {
    const secret = authConfig.jwtSecret || process.env.JWT_SECRET || "";
    const prefix = secret ? crypto.createHash("sha256").update(secret).digest("hex").slice(0, 8) : "no-secret";
    const access = authConfig.accessExpiresIn || process.env.AUTH_ACCESS_EXPIRES || "undefined";
    const refresh = authConfig.refreshExpiresIn || process.env.AUTH_REFRESH_EXPIRES || "undefined";
    console.log(
      `[AUTH-RUNTIME] pid=${process.pid} route=${route} accessExpiresIn=${access} refreshExpiresIn=${refresh} jwtSecretHashPrefix=${prefix}`
    );
  } catch (e) {
    // swallow diagnostics errors
  }
}

export function requireAuth(req, res, next) {
  logAuthRuntime(req.path || req.originalUrl || "(auth)");
  const auth = req.headers.authorization;
  if (!auth) {
    try { console.log(`[AUTH-RUNTIME] pid=${process.pid} route=${req.path || req.originalUrl} no_authorization`); } catch {}
    return res.status(401).json({ message: "No token" });
  }

  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, authConfig.jwtSecret);
    req.user = payload;
    next();
  } catch (err) {
    try { console.log(`[AUTH-RUNTIME] pid=${process.pid} route=${req.path || req.originalUrl} invalid_token`); } catch {}
    res.status(401).json({ message: "Invalid token" });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Không có quyền admin" });
  }
  next();
}

export async function requireShop(req, res, next) {
  try {
    const accountId = req.user?.accountId ?? req.user?.id;
    if (!req.user || !accountId) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const [rows] = await pool.query("SELECT id FROM shops WHERE accountId = ?", [
      accountId,
    ]);

    if (rows.length === 0) {
      return res.status(403).json({ message: "Shop chưa được tạo" });
    }

    req.shop = { id: rows[0].id };
    next();
  } catch (err) {
    console.error("requireShop error:", err);
    res.status(500).json({ message: "Require shop failed" });
  }
}
