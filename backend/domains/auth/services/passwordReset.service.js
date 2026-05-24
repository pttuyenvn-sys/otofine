import { authConfig } from "../config/auth.config.js";
import { generateOpaqueToken, hashToken } from "../utils/crypto.util.js";
import { sanitizeEmail } from "../utils/sanitize.util.js";
import * as shopAccountRepo from "../repositories/shopAccount.repository.js";
import * as passwordResetRepo from "../repositories/passwordReset.repository.js";
import * as refreshTokenRepo from "../repositories/refreshToken.repository.js";
import * as authLogRepo from "../repositories/authLog.repository.js";
import * as passwordService from "./password.service.js";
import * as emailService from "./email.service.js";

export const GENERIC_FORGOT_RESPONSE = {
  ok: true,
  message:
    "Nếu email đã đăng ký, bạn sẽ nhận hướng dẫn đặt lại mật khẩu trong vài phút.",
};

export async function requestShopPasswordResetByEmail(emailRaw, meta = {}) {
  const email = sanitizeEmail(emailRaw);
  if (!email) {
    return GENERIC_FORGOT_RESPONSE;
  }

  const account = await shopAccountRepo.findByEmail(email);
  if (!account || account.status === "deleted") {
    return GENERIC_FORGOT_RESPONSE;
  }

  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + authConfig.resetExpiresMinutes * 60 * 1000,
  );

  await passwordResetRepo.invalidateAccountResets(account.id);
  await passwordResetRepo.createResetToken({
    accountId: account.id,
    tokenHash,
    expiresAt,
    ipAddress: meta.ip ?? null,
  });

  await authLogRepo.insertAuthLog({
    accountId: account.id,
    eventType: "password_reset_request",
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { email },
  });

  const sendResult = await emailService.sendPasswordResetEmail({
    to: email,
    resetToken: rawToken,
    shopName: account.name,
  });

  if (!sendResult.ok && !authConfig.exposeResetToken) {
    console.error("[auth] password reset email failed for account", account.id);
  }

  const result = { ...GENERIC_FORGOT_RESPONSE };
  if (authConfig.exposeResetToken) {
    result.resetToken = rawToken;
    result.resetExpiresAt = expiresAt.toISOString();
    if (sendResult.devResetUrl) {
      result.devResetUrl = sendResult.devResetUrl;
    }
  }
  return result;
}

export async function resetShopPassword({ token, newPassword }, meta = {}) {
  const tokenHash = hashToken(String(token ?? "").trim());
  const row = await passwordResetRepo.findValidResetByHash(tokenHash);
  if (!row) {
    return {
      ok: false,
      status: 400,
      message: "Liên kết không hợp lệ hoặc đã hết hạn",
    };
  }

  const passwordHash = await passwordService.hashPassword(newPassword);
  await shopAccountRepo.updatePasswordHash(row.account_id, passwordHash);
  await passwordResetRepo.markResetUsed(row.id);
  await refreshTokenRepo.revokeAllForAccount(row.account_id);

  await authLogRepo.insertAuthLog({
    accountId: row.account_id,
    eventType: "password_reset_complete",
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return {
    ok: true,
    message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
    requireLogin: true,
  };
}
