import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import Admin from "../models/Admin.js";
import { authConfig } from "../domains/auth/config/auth.config.js";

export async function adminLogin(req, res) {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ where: { email } });
  if (!admin) {
    return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
  }

  const secret = authConfig.jwtSecret || process.env.JWT_SECRET;
  const expiresIn = authConfig.accessExpiresIn || process.env.AUTH_ACCESS_EXPIRES || "7d";
  const token = jwt.sign(
    {
      id: admin.id,
      role: "admin",
      shopId: null,
    },
    secret,
    { expiresIn }
  );

  res.json({ token });
}
