import { pool } from "../../../config/db.js";

export async function findShopIdByAccountId(accountId) {
  const [[row]] = await pool.query(
    "SELECT id FROM shops WHERE accountId = ? LIMIT 1",
    [accountId],
  );
  return row?.id ?? null;
}
