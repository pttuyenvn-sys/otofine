import jwt from "jsonwebtoken";
import { authConfig } from "../config/auth.config.js";

function assertSecret() {
  if (!authConfig.jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }
}

export function signShopAccessToken(account, shopId) {
  assertSecret();
  const accountId = account.id;
  return jwt.sign(
    {
      id: accountId,
      accountId,
      shopId: shopId ?? null,
      role: "shop",
      email: account.email,
    },
    authConfig.jwtSecret,
    { expiresIn: authConfig.accessExpiresIn },
  );
}

export function signAdminAccessToken(admin) {
  assertSecret();
  return jwt.sign(
    {
      id: admin.id,
      role: "admin",
      email: admin.email,
    },
    authConfig.jwtSecret,
    { expiresIn: authConfig.accessExpiresIn },
  );
}

export function verifyAccessToken(token) {
  assertSecret();
  return jwt.verify(token, authConfig.jwtSecret);
}
