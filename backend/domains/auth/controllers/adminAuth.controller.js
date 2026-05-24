import * as adminAuthService from "../services/adminAuth.service.js";

export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;
    const result = await adminAuthService.loginAdmin({ email, password });
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.json({ token: result.token, admin: result.admin });
  } catch (err) {
    console.error("adminLogin error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function adminForgotPassword(req, res) {
  try {
    const { email } = req.body;
    const result = await adminAuthService.requestAdminPasswordReset(email);
    res.json(result);
  } catch (err) {
    console.error("adminForgotPassword:", err);
    res.status(500).json({ error: "Không thể xử lý yêu cầu" });
  }
}
