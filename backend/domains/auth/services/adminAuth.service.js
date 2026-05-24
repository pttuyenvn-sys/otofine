import { pool } from "../../../config/db.js";
import * as passwordService from "./password.service.js";
import * as tokenService from "./token.service.js";
import { authConfig } from "../config/auth.config.js";
import { generateOpaqueToken, hashToken } from "../utils/crypto.util.js";

const GENERIC_FORGOT = {
  ok: true,
  message:
    "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.",
};

export async function loginAdmin({ email, password }) {
  if (!email || !password) {
    return { ok: false, status: 400, message: "Thiếu email hoặc mật khẩu" };
  }

  const [rows] = await pool.query("SELECT * FROM admin WHERE email = ? LIMIT 1", [
    email.trim().toLowerCase(),
  ]);
  if (!rows.length) {
    return { ok: false, status: 401, message: "Sai email hoặc mật khẩu" };
  }

  const admin = rows[0];
  const valid = await passwordService.verifyPassword(password, admin.passwordHash);
  if (!valid) {
    return { ok: false, status: 401, message: "Sai email hoặc mật khẩu" };
  }

  try {
    const bcrypt = (await import("bcryptjs")).default;
    const rounds = bcrypt.getRounds(admin.passwordHash);
    if (rounds < authConfig.bcryptRounds) {
      const newHash = await passwordService.hashPassword(password);
      await pool.query("UPDATE admin SET passwordHash = ? WHERE id = ?", [
        newHash,
        admin.id,
      ]);
    }
  } catch {
    /* ignore rehash errors */
  }

  const token = tokenService.signAdminAccessToken(admin);
  return {
    ok: true,
    token,
    admin: { id: admin.id, email: admin.email },
  };
}

/** Admin forgot: never return plaintext password. */
export async function requestAdminPasswordReset(emailRaw) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email) return GENERIC_FORGOT;

  const [rows] = await pool.query("SELECT id FROM admin WHERE email = ? LIMIT 1", [
    email,
  ]);
  if (!rows.length) return GENERIC_FORGOT;

  const rawToken = generateOpaqueToken();
  if (authConfig.exposeResetToken) {
    return {
      ...GENERIC_FORGOT,
      resetToken: rawToken,
      note: "AUTH_EXPOSE_RESET_TOKEN=true — configure admin reset UI separately",
    };
  }
  return GENERIC_FORGOT;
}
