import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import Admin from "../models/Admin.js";

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

  const token = jwt.sign(
    {
      id: admin.id,
      role: "admin",
      shopId: null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
}
