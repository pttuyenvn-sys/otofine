/**
 * Lazy env reading — every property access reads process.env at call time.
 * This avoids the ESM hoisting trap where authConfig is evaluated
 * before dotenv.config() in server.js.
 */
function envInt(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const authConfig = {
  get jwtSecret() {
    return process.env.JWT_SECRET;
  },
  get accessExpiresIn() {
    return process.env.AUTH_ACCESS_EXPIRES || "7d";
  },
  get refreshExpiresIn() {
    return process.env.AUTH_REFRESH_EXPIRES || "30d";
  },
  get bcryptRounds() {
    return envInt("AUTH_BCRYPT_ROUNDS", 12);
  },
  get resetExpiresMinutes() {
    // Accept both names for backward compat with .env naming.
    const v =
      process.env.AUTH_RESET_EXPIRES_MINUTES ??
      process.env.RESET_PASSWORD_EXPIRES_MINUTES;
    if (v == null || v === "") return 60;
    const n = Number(v);
    return Number.isFinite(n) ? n : 60;
  },
  get exposeResetToken() {
    return process.env.AUTH_EXPOSE_RESET_TOKEN === "true";
  },
  get loginRateMax() {
    return envInt("AUTH_LOGIN_RATE_MAX", 20);
  },
  get loginRateWindowMs() {
    return envInt("AUTH_LOGIN_RATE_WINDOW_MS", 15 * 60 * 1000);
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY || "";
  },
  get mailFrom() {
    return process.env.MAIL_FROM || "";
  },
  get frontendUrl() {
    return (
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://otofine.com"
    );
  },
};

export const SHOP_LOCKED_STATUSES = new Set([
  "pending",
  "blocked",
  "suspended",
  "deleted",
]);
