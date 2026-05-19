import { pool } from "../config/db.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

// ================== REGISTER SHOP ==================
export async function registerShop(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    const shopId = uuidv4();
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO shop_accounts (shopId, name, email, phone, passwordHash, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [shopId, name, email, phone, hash]
    );

    res.json({ ok: true, shopId });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: "Email hoặc SĐT đã tồn tại" });
  }
}

// ================== SHOP LOGIN ==================
export async function shopLogin(req, res) {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(
      "SELECT * FROM shop_accounts WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
    }

    const shopUser = rows[0];

    const ok = await bcrypt.compare(password, shopUser.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
    }

    if (shopUser.status !== "active") {
      return res
        .status(403)
        .json({ message: "Shop chưa được duyệt hoặc đã bị khóa" });
    }

    const token = jwt.sign(
      {
        id: shopUser.id,
        role: "shop",
        email: shopUser.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    /** `shops.id` (khoản mục trong bảng shops) — dùng cho push / storefront; không trùng `shop_accounts.id` */
    const [[sellerShop]] = await pool.query(
      `SELECT id FROM shops WHERE accountId = ? LIMIT 1`,
      [shopUser.id]
    );

    res.json({
      token,
      shop: {
        id: sellerShop?.id ?? null,
        accountId: shopUser.id,
        name: shopUser.name,
        email: shopUser.email,
        status: shopUser.status,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

// ================== SHOP FORGOT PASSWORD ==================
export async function shopForgotPassword(req, res) {
  const { email } = req.body;

  const [rows] = await pool.query("SELECT * FROM shop_accounts WHERE email = ?", [
    email,
  ]);
  if (!rows.length)
    return res.status(400).json({ error: "Email không tồn tại" });

  const newPassword = Math.random().toString(36).slice(-8);
  const hash = await bcrypt.hash(newPassword, 10);

  await pool.query("UPDATE shop_accounts SET passwordHash = ? WHERE email = ?", [
    hash,
    email,
  ]);

  res.json({ newPassword });
}

// ================== ADMIN FORGOT PASSWORD ==================
export async function adminForgotPassword(req, res) {
  const { email } = req.body;

  const [rows] = await pool.query("SELECT * FROM admin WHERE email = ?", [
    email,
  ]);
  if (!rows.length) return res.status(400).json({ error: "Email không đúng" });

  const newPassword = Math.random().toString(36).slice(-8);
  const hash = await bcrypt.hash(newPassword, 10);

  await pool.query("UPDATE admin SET passwordHash = ? WHERE email = ?", [
    hash,
    email,
  ]);

  res.json({ newPassword });
}

// ================== ADMIN LOGIN ==================
export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Thiếu email hoặc mật khẩu" });
    }

    const [rows] = await pool.query(
      "SELECT * FROM admin WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }

    const admin = rows[0];

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        role: "admin",
        email: admin.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
      },
    });
  } catch (err) {
    console.error("adminLogin error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}
