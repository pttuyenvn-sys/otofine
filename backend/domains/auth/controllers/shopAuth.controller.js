import * as shopAuthService from "../services/shopAuth.service.js";
import * as passwordResetService from "../services/passwordReset.service.js";
import * as sessionService from "../services/session.service.js";
import {
  validateRegisterBody,
  validateLoginBody,
  validateForgotBody,
  validateResetPasswordBody,
} from "../validators/shopAuth.validators.js";
import { normalizeIdentifier } from "../utils/identifier.util.js";

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
    const validated = validateForgotBody(req.body);
    if (!validated.ok) {
      return res.status(validated.status).json({ error: validated.message });
    }

    const result = await passwordResetService.requestShopPasswordReset(
      validated.data.identifier,
    );
    res.json(result);
  } catch (err) {
    console.error("shopForgotPassword:", err);
    res.status(500).json({ error: "Không thể xử lý yêu cầu" });
  }
}

export async function shopResetPassword(req, res) {
  try {
    const validated = validateResetPasswordBody(req.body);
    if (!validated.ok) {
      return res.status(validated.status).json({ message: validated.message });
    }

    const result = await passwordResetService.resetShopPassword(validated.data);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.json(result);
  } catch (err) {
    console.error("shopResetPassword:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function shopRefreshToken(req, res) {
  try {
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
      return res.status(result.status).json({ message: result.message });
    }

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
