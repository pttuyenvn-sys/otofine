import * as shopAuthService from "../services/shopAuth.service.js";
import * as passwordResetService from "../services/passwordReset.service.js";
import * as changePasswordService from "../services/changePassword.service.js";
import * as sessionService from "../services/session.service.js";
import {
  validateRegisterBody,
  validateLoginBody,
  validateForgotEmailBody,
  validateResetPasswordBody,
  validateChangePasswordBody,
} from "../validators/shopAuth.validators.js";
import { normalizeIdentifier } from "../utils/identifier.util.js";
import crypto from "crypto";
import { authConfig } from "../config/auth.config.js";

function requestMeta(req) {
  return {
    userAgent: req.headers["user-agent"],
    ip:
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0]
        : null) ||
      req.ip ||
      null,
  };
}

export async function registerShop(req, res) {
  try {
    const validated = validateRegisterBody(req.body);
    if (!validated.ok) {
      return res.status(validated.status).json({
        error: validated.errors?.[0] || "Dữ liệu không hợp lệ",
      });
    }

    const phoneNorm = normalizeIdentifier(validated.data.phone);
    const payload = {
      ...validated.data,
      phone:
        phoneNorm.type === "phone" ? phoneNorm.value : validated.data.phone,
    };

    const result = await shopAuthService.registerShopAccount(payload);
    res.json(result);
  } catch (err) {
    console.error("registerShop:", err);
    res.status(400).json({ error: "Email hoặc SĐT đã tồn tại" });
  }
}

export async function shopLogin(req, res) {
  try {
    try {
      const secret = authConfig.jwtSecret || process.env.JWT_SECRET || "";
      const prefix = secret ? crypto.createHash("sha256").update(secret).digest("hex").slice(0, 8) : "no-secret";
      console.log(`[AUTH-RUNTIME] pid=${process.pid} route=/api/auth/shop-login accessExpiresIn=${authConfig.accessExpiresIn} refreshExpiresIn=${authConfig.refreshExpiresIn} jwtSecretHashPrefix=${prefix}`);
    } catch {}
    const validated = validateLoginBody(req.body);
    if (!validated.ok) {
      return res.status(validated.status).json({ message: validated.message });
    }

    const result = await shopAuthService.loginShop({
      identifier: validated.data.identifier,
      password: validated.data.password,
      meta: requestMeta(req),
    });

    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    res.json({
      token: result.token,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      shop: result.shop,
    });
  } catch (err) {
    console.error("shopLogin:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function shopForgotPassword(req, res) {
  try {
    const validated = validateForgotEmailBody(req.body);
    if (!validated.ok) {
      return res.status(validated.status).json({ message: validated.message });
    }

    const result = await passwordResetService.requestShopPasswordResetByEmail(
      validated.data.email,
      requestMeta(req),
    );
    res.json(result);
  } catch (err) {
    console.error("shopForgotPassword:", err);
    res.status(500).json({
      message: passwordResetService.GENERIC_FORGOT_RESPONSE.message,
    });
  }
}

export async function shopResetPassword(req, res) {
  try {
    const validated = validateResetPasswordBody(req.body);
    if (!validated.ok) {
      return res.status(validated.status).json({ message: validated.message });
    }

    const result = await passwordResetService.resetShopPassword(
      validated.data,
      requestMeta(req),
    );
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.json(result);
  } catch (err) {
    console.error("shopResetPassword:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function changePassword(req, res) {
  try {
    const validated = validateChangePasswordBody(req.body);
    if (!validated.ok) {
      return res.status(validated.status).json({ message: validated.message });
    }

    const accountId = req.user?.accountId ?? req.user?.id;
    const result = await changePasswordService.changeShopPassword(
      accountId,
      validated.data,
      requestMeta(req),
    );

    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    res.json(result);
  } catch (err) {
    console.error("changePassword:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function shopRefreshToken(req, res) {
  try {
    try {
      const secret = authConfig.jwtSecret || process.env.JWT_SECRET || "";
      const prefix = secret ? crypto.createHash("sha256").update(secret).digest("hex").slice(0, 8) : "no-secret";
      console.log(`[AUTH-RUNTIME] pid=${process.pid} route=/api/auth/shop-refresh accessExpiresIn=${authConfig.accessExpiresIn} refreshExpiresIn=${authConfig.refreshExpiresIn} jwtSecretHashPrefix=${prefix} refresh_call`);
    } catch {}
    const refreshToken =
      req.body?.refreshToken ||
      req.headers["x-refresh-token"] ||
      "";
    if (!refreshToken) {
      return res.status(400).json({ message: "Thiếu refresh token" });
    }

    const result = await sessionService.refreshShopSession(
      refreshToken,
      requestMeta(req),
    );
    if (!result.ok) {
      try { console.log(`[AUTH-RUNTIME] pid=${process.pid} route=/api/auth/shop-refresh refresh_result=FAIL status=${result.status} suspicious=${!!result.suspicious}`); } catch {}
      return res.status(result.status).json({ message: result.message });
    }
    try { console.log(`[AUTH-RUNTIME] pid=${process.pid} route=/api/auth/shop-refresh refresh_result=OK expiresIn=${result.expiresIn}`); } catch {}
    res.json({
      token: result.token,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      shop: result.shop,
    });
  } catch (err) {
    console.error("shopRefreshToken:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function shopLogout(req, res) {
  try {
    const refreshToken =
      req.body?.refreshToken ||
      req.headers["x-refresh-token"] ||
      "";
    const result = await sessionService.logoutShop(refreshToken);
    res.json(result);
  } catch (err) {
    console.error("shopLogout:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}
