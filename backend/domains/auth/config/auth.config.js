function envInt(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const authConfig = {
  jwtSecret: process.env.JWT_SECRET,
  accessExpiresIn: process.env.AUTH_ACCESS_EXPIRES || "7d",
  refreshExpiresIn: process.env.AUTH_REFRESH_EXPIRES || "30d",
  bcryptRounds: envInt("AUTH_BCRYPT_ROUNDS", 12),
  resetExpiresMinutes: envInt("AUTH_RESET_EXPIRES_MINUTES", 60),
  exposeResetToken: process.env.AUTH_EXPOSE_RESET_TOKEN === "true",
  loginRateMax: envInt("AUTH_LOGIN_RATE_MAX", 20),
  loginRateWindowMs: envInt("AUTH_LOGIN_RATE_WINDOW_MS", 15 * 60 * 1000),
};

export const SHOP_LOCKED_STATUSES = new Set([
  "pending",
  "blocked",
  "suspended",
  "deleted",
]);
