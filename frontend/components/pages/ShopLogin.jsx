"use client";

import { useState } from "react";
import axios from "axios";
import Link from "next/link";
import AuthCard from "../AuthCard";
import { API_BASE } from "@/lib/config";

export default function ShopLogin() {
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    console.log("SUBMIT RUN");
    e.preventDefault();
    setMsg("");

    try {
      const res = await axios.post(
        `${API_BASE}/auth/shop-login`,
        {
          email: emailOrPhone.trim(),
          password: password.trim(),
        }
      );

      // ✔ MUST SAVE TOKEN
      localStorage.setItem("token", res.data.token);
      localStorage.setItem(
        "auth",
        JSON.stringify({
          role: "shop",
          email: res.data.shop.email,
        })
      );
      window.dispatchEvent(new Event("auth-changed"));

      setMsg("Đăng nhập thành công!");

      // ✔ chuyển trang
      window.location.href = "/shop/settings";
    } catch (err) {
      console.error(err);
      if (err.response?.status === 400) setMsg("Sai tài khoản hoặc mật khẩu");
      else setMsg("Lỗi hệ thống, thử lại");
    }
  }

  return (
    <AuthCard title="Đăng nhập Shop">
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full p-3 rounded-xl border border-gray-300 bg-white"
          placeholder="Email hoặc SĐT"
          onChange={(e) => setEmailOrPhone(e.target.value)}
        />

        <input
          type="password"
          className="w-full p-3 rounded-xl border border-gray-300 bg-white"
          placeholder="Mật khẩu"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold"
        >
          Đăng nhập
        </button>

        <p className="text-gray-700 text-sm">{msg}</p>
        <p className="text-sm text-center mt-3">
          Chưa có shop?{" "}
          <Link href="/shop/register" className="text-blue-600 font-semibold">
            Đăng ký ngay
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
