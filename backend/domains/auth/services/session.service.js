import { authConfig } from "../config/auth.config.js";
import { generateOpaqueToken, hashToken } from "../utils/crypto.util.js";
import * as refreshTokenRepo from "../repositories/refreshToken.repository.js";
import * as shopAccountRepo from "../repositories/shopAccount.repository.js";
import * as shopProfileRepo from "../repositories/shopProfile.repository.js";
import * as tokenService from "./token.service.js";

function parseDurationMs(expiresIn) {
  const m = String(expiresIn).match(/^(\d+)([dhms])$/);
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  const mult =
    unit === "d" ? 86400000 : unit === "h" ? 3600000 : unit === "m" ? 60000 : 1000;
  return n * mult;
}

export async function issueRefreshToken(accountId, { userAgent, ip } = {}) {
  const raw = generateOpaqueToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(
    Date.now() + parseDurationMs(authConfig.refreshExpiresIn),
  );
  await refreshTokenRepo.insertRefreshToken({
    accountId,
    tokenHash,
    expiresAt,
    userAgent,
    ip,
  });
  return {
    token: raw,
    expiresIn: authConfig.refreshExpiresIn,
  };
}

export async function refreshShopSession(refreshToken, meta = {}) {
  const tokenHash = hashToken(refreshToken);
  const row = await refreshTokenRepo.findValidRefreshByHash(tokenHash);
  if (!row) {
    return { ok: false, status: 401, message: "Refresh token không hợp lệ" };
  }

  const account = await shopAccountRepo.findById(row.account_id);
  if (!account || account.status !== "active") {
    return { ok: false, status: 403, message: "Tài khoản không khả dụng" };
  }

  await refreshTokenRepo.revokeRefreshByHash(tokenHash);

  const sellerShopId = await shopProfileRepo.findShopIdByAccountId(account.id);
  const token = tokenService.signShopAccessToken(account, sellerShopId);
  const refresh = await issueRefreshToken(account.id, meta);

  return {
    ok: true,
    token,
    refreshToken: refresh.token,
    expiresIn: refresh.expiresIn,
    shop: {
      id: sellerShopId ?? null,
      accountId: account.id,
      name: account.name,
      email: account.email,
      status: account.status,
    },
  };
}

export async function logoutShop(refreshToken) {
  if (refreshToken) {
    await refreshTokenRepo.revokeRefreshByHash(hashToken(refreshToken));
  }
  return { ok: true };
}
