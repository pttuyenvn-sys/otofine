import * as shopAccountRepo from "../repositories/shopAccount.repository.js";
import * as refreshTokenRepo from "../repositories/refreshToken.repository.js";
import * as authLogRepo from "../repositories/authLog.repository.js";
import * as passwordService from "./password.service.js";

export async function changeShopPassword(
  accountId,
  { oldPassword, newPassword },
  meta = {},
) {
  const account = await shopAccountRepo.findById(accountId);
  if (!account) {
    return { ok: false, status: 401, message: "Tài khoản không hợp lệ" };
  }

  if (account.status !== "active") {
    return {
      ok: false,
      status: 403,
      message: "Tài khoản chưa được kích hoạt hoặc đã bị khóa",
    };
  }

  const valid = await passwordService.verifyPassword(
    oldPassword,
    account.passwordHash,
  );
  if (!valid) {
    await authLogRepo.insertAuthLog({
      accountId,
      eventType: "password_change_failed",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: "invalid_old_password" },
    });
    return {
      ok: false,
      status: 400,
      message: "Mật khẩu hiện tại không đúng",
    };
  }

  if (oldPassword === newPassword) {
    return {
      ok: false,
      status: 400,
      message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    };
  }

  const passwordHash = await passwordService.hashPassword(newPassword);
  await shopAccountRepo.updatePasswordHash(accountId, passwordHash);
  await refreshTokenRepo.revokeAllForAccount(accountId);

  await authLogRepo.insertAuthLog({
    accountId,
    eventType: "password_change",
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return {
    ok: true,
    message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại trên các thiết bị khác.",
    requireLogin: true,
  };
}
