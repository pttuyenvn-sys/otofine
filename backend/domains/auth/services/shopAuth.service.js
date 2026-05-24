import { v4 as uuidv4 } from "uuid";
import { SHOP_LOCKED_STATUSES } from "../config/auth.config.js";
import { normalizeIdentifier } from "../utils/identifier.util.js";
import * as shopAccountRepo from "../repositories/shopAccount.repository.js";
import * as shopProfileRepo from "../repositories/shopProfile.repository.js";
import * as passwordService from "./password.service.js";
import * as tokenService from "./token.service.js";
import * as sessionService from "./session.service.js";

export async function registerShopAccount({ name, email, phone, password }) {
  const shopId = uuidv4();
  const passwordHash = await passwordService.hashPassword(password);
  await shopAccountRepo.insertShopAccount({
    shopId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    passwordHash,
  });
  return { ok: true, shopId };
}

export async function loginShop({ identifier, password, meta = {} }) {
  const idNorm = normalizeIdentifier(identifier);
  if (idNorm.type === "empty" || idNorm.type === "unknown") {
    return { ok: false, status: 401, message: "Sai tài khoản hoặc mật khẩu" };
  }

  const account = await shopAccountRepo.findByIdentifier(idNorm);
  if (!account) {
    return { ok: false, status: 401, message: "Sai tài khoản hoặc mật khẩu" };
  }

  const valid = await passwordService.verifyPassword(password, account.passwordHash);
  if (!valid) {
    return { ok: false, status: 401, message: "Sai tài khoản hoặc mật khẩu" };
  }

  if (account.status !== "active") {
    const msg = SHOP_LOCKED_STATUSES.has(account.status)
      ? "Shop chưa được duyệt hoặc đã bị khóa"
      : "Shop chưa được duyệt hoặc đã bị khóa";
    return { ok: false, status: 403, message: msg };
  }

  await passwordService.rehashPasswordIfNeeded(
    account.id,
    password,
    account.passwordHash,
  );

  const sellerShopId = await shopProfileRepo.findShopIdByAccountId(account.id);
  const token = tokenService.signShopAccessToken(account, sellerShopId);
  const refresh = await sessionService.issueRefreshToken(account.id, meta);

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
