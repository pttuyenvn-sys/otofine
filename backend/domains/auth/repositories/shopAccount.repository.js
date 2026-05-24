import { pool } from "../../../config/db.js";

export async function insertShopAccount({
  shopId,
  name,
  email,
  phone,
  passwordHash,
}) {
  await pool.query(
    `INSERT INTO shop_accounts (shopId, name, email, phone, passwordHash, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [shopId, name, email, phone, passwordHash],
  );
}

export async function findById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM shop_accounts WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] ?? null;
}

export async function findByEmail(email) {
  const [rows] = await pool.query(
    "SELECT * FROM shop_accounts WHERE email = ? LIMIT 1",
    [email],
  );
  return rows[0] ?? null;
}

export async function findByPhone(phone) {
  const [rows] = await pool.query(
    "SELECT * FROM shop_accounts WHERE phone = ? LIMIT 1",
    [phone],
  );
  return rows[0] ?? null;
}

export async function findByIdentifier({ type, value }) {
  if (type === "email") return findByEmail(value);
  if (type === "phone") return findByPhone(value);
  return null;
}

export async function updatePasswordHash(accountId, passwordHash) {
  await pool.query("UPDATE shop_accounts SET passwordHash = ? WHERE id = ?", [
    passwordHash,
    accountId,
  ]);
}
