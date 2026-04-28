import { pool } from "./config/db.js";

async function test() {
  try {
    const [rows] = await pool.query("SELECT NOW()");
    console.log("Kết nối OK:", rows);
  } catch (err) {
    console.error("Lỗi kết nối:", err);
  }
}

test();
