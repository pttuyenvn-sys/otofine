// middlewares/auth.js
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: "No token" });

  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
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
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const accountId = req.user.id;

    const [rows] = await pool.query("SELECT id FROM shops WHERE accountId = ?", [
      accountId,
    ]);

    if (rows.length === 0) {
      return res.status(403).json({ message: "Shop chưa được tạo" });
    }

    // ✅ LẤY ĐÚNG SHOP ID TỪ DB
    req.shop = { id: rows[0].id };

    next();
  } catch (err) {
    console.error("requireShop error:", err);
    res.status(500).json({ message: "Require shop failed" });
  }
}
