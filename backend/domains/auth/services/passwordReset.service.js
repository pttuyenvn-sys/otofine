import { authConfig } from "../config/auth.config.js";
import { generateOpaqueToken, hashToken } from "../utils/crypto.util.js";
import { normalizeIdentifier } from "../utils/identifier.util.js";
import * as shopAccountRepo from "../repositories/shopAccount.repository.js";
import * as passwordResetRepo from "../repositories/passwordReset.repository.js";
import * as passwordService from "./password.service.js";

const GENERIC_OK = {
  ok: true,
  message:
    "Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi (kiểm tra email hoặc liên hệ admin).",
};

export async function requestShopPasswordReset(identifierRaw) {
  const idNorm = normalizeIdentifier(identifierRaw);
  if (idNorm.type === "empty" || idNorm.type === "unknown") {
    return GENERIC_OK;
  }

  const account = await shopAccountRepo.findByIdentifier(idNorm);
  if (!account || account.status === "deleted") {
    return GENERIC_OK;
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
  });

  const result = { ...GENERIC_OK };
  if (authConfig.exposeResetToken) {
    result.resetToken = rawToken;
    result.resetExpiresAt = expiresAt.toISOString();
  }
  return result;
}

export async function resetShopPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const row = await passwordResetRepo.findValidResetByHash(tokenHash);
  if (!row) {
    return { ok: false, status: 400, message: "Token không hợp lệ hoặc đã hết hạn" };
  }

  const passwordHash = await passwordService.hashPassword(password);
  await shopAccountRepo.updatePasswordHash(row.account_id, passwordHash);
  await passwordResetRepo.markResetUsed(row.id);

  return { ok: true, message: "Đặt lại mật khẩu thành công" };
}
