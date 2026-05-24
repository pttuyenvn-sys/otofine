import { Resend } from "resend";
import { authConfig } from "../config/auth.config.js";
import { buildPasswordResetEmail } from "../templates/passwordResetEmail.js";

let resendClient = null;
let cachedApiKey = null;

function getResend() {
  const apiKey = authConfig.resendApiKey;
  if (!apiKey) return null;

  if (!resendClient || cachedApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    cachedApiKey = apiKey;
  }

  return resendClient;
}

export function isEmailConfigured() {
  return Boolean(
    authConfig.resendApiKey && authConfig.mailFrom && authConfig.frontendUrl,
  );
}

export async function sendPasswordResetEmail({
  to,
  resetToken,
  shopName,
}) {
  const resetUrl =
    `${authConfig.frontendUrl.replace(/\/$/, "")}` +
    `/shop/reset-password?token=${encodeURIComponent(resetToken)}`;

  const { subject, text, html } = buildPasswordResetEmail({
    resetUrl,
    shopName,
    expiresMinutes: authConfig.resetExpiresMinutes,
  });

  const resend = getResend();

  if (!resend) {
    console.warn("[auth/email] Resend not configured — skip send", { to });

    if (authConfig.exposeResetToken) {
      return { ok: true, devResetUrl: resetUrl };
    }

    return { ok: false, error: "EMAIL_NOT_CONFIGURED" };
  }

  const from = authConfig.mailFrom;
  if (!from) {
    console.error("[auth/email] MAIL_FROM is not configured");
    return { ok: false, error: "MAIL_FROM_NOT_CONFIGURED" };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      text,
      html,
    });

    if (error) {
      console.error("[auth/email] Resend error:", error);
      return { ok: false, error: error.message || "SEND_FAILED" };
    }

    console.log("[auth/email] password reset email sent", { to });
    return { ok: true };
  } catch (err) {
    console.error("[auth/email] Resend exception:", err?.message || err);
    return { ok: false, error: "SEND_EXCEPTION" };
  }
}
