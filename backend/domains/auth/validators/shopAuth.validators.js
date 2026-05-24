const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{8,10}$/;

export function validateRegisterBody(body) {
  const errors = [];
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  const password = String(body?.password ?? "");

  if (name.length < 2) errors.push("Tên shop quá ngắn");
  if (!EMAIL_RE.test(email)) errors.push("Email không hợp lệ");
  if (!PHONE_RE.test(phone.replace(/\s/g, ""))) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) errors.push("Số điện thoại không hợp lệ");
  }
  const pwErr = validatePasswordStrength(password);
  if (pwErr) errors.push(pwErr);

  if (errors.length) {
    return { ok: false, status: 400, errors };
  }
  return { ok: true, data: { name, email, phone, password } };
}

export function validateLoginBody(body) {
  const identifier = String(body?.email ?? body?.emailOrPhone ?? "").trim();
  const password = String(body?.password ?? "").trim();
  if (!identifier || !password) {
    return { ok: false, status: 400, message: "Thiếu tài khoản hoặc mật khẩu" };
  }
  return { ok: true, data: { identifier, password } };
}

export function validateResetPasswordBody(body) {
  const token = String(body?.token ?? "").trim();
  const password = String(body?.newPassword ?? body?.password ?? "");
  const pwErr = validatePasswordStrength(password);
  if (!token) {
    return { ok: false, status: 400, message: "Thiếu token" };
  }
  if (pwErr) {
    return { ok: false, status: 400, message: pwErr };
  }
  return { ok: true, data: { token, password } };
}

/** Forgot password — email only (production). */
export function validateForgotEmailBody(body) {
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: false, status: 400, message: "Nhập email đăng ký" };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, message: "Email không hợp lệ" };
  }
  return { ok: true, data: { email } };
}

/** @deprecated alias — accepts email field only */
export function validateForgotBody(body) {
  return validateForgotEmailBody(body);
}

export function validateChangePasswordBody(body) {
  const oldPassword = String(body?.oldPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");
  if (!oldPassword || !newPassword) {
    return {
      ok: false,
      status: 400,
      message: "Thiếu mật khẩu hiện tại hoặc mật khẩu mới",
    };
  }
  const pwErr = validatePasswordStrength(newPassword);
  if (pwErr) {
    return { ok: false, status: 400, message: pwErr };
  }
  return { ok: true, data: { oldPassword, newPassword } };
}

export function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return "Mật khẩu tối thiểu 8 ký tự";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Mật khẩu cần có ít nhất một chữ cái và một chữ số";
  }
  return null;
}
