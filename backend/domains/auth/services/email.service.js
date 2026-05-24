import { Resend } from "resend";
import { authConfig } from "../config/auth.config.js";
import { buildPasswordResetEmail } from "../templates/passwordResetEmail.js";

let resendClient = null;

function getResend() {
  if (!authConfig.resendApiKey) return null;
  if (!resendClient) {
    resendClient = new Resend(authConfig.resendApiKey);
  }
  return resendClient;
}

export function isEmailConfigured() {
  return Boolean(authConfig.resendApiKey && authConfig.mailFrom && authConfig.frontendUrl);
}

export async function sendPasswordResetEmail({ to, resetToken, shopName }) {
  const resetUrl = `${authConfig.frontendUrl.replace(/\/$/, "")}/shop/reset-password?token=${encodeURIComponent(resetToken)}`;
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

  const { error } = await resend.emails.send({
    from: authConfig.mailFrom,
    to: [to],
    subject,
    text,
    html,
  });

  if (error) {
    console.error("[auth/email] Resend error:", error);
    return { ok: false, error: error.message || "SEND_FAILED" };
  }

  return { ok: true };
}
