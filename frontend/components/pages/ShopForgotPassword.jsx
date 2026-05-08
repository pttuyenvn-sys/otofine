"use client";

import { useState } from "react";
import axios from "axios";
import Link from "next/link";
import AuthCard from "../AuthCard";
import { API_BASE } from "@/lib/config";

export default function ShopForgotPassword() {
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();

    try {
      const res = await axios.post(`${API_BASE}/auth/shop-forgot-password`, {
        emailOrPhone,
      });

      setMsg("Mật khẩu mới của bạn: " + res.data.newPassword);
    } catch (err) {
      setMsg(err.response?.data?.error || "Không thể cấp lại mật khẩu");
    }
  }

  return (
    <AuthCard title="Quên mật khẩu Shop">
      <form onSubmit={submit} className="space-y-3">
        {/* Input Email hoặc Số điện thoại */}
        <input
          className="w-full p-3 rounded-xl border border-gray-300 bg-white 
                     text-gray-800 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-blue-500 
                     focus:border-blue-500 transition"
          placeholder="Nhập email hoặc số điện thoại"
          onChange={(e) => setEmailOrPhone(e.target.value)}
        />

        {/* Button */}
        <button
          className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold
                     hover:bg-blue-700 transition active:scale-95"
        >
          Cấp lại mật khẩu
        </button>

        {/* Thông báo */}
        <p className="text-gray-700 text-sm pt-2">{msg}</p>

        {/* Link quay lại đăng nhập */}
        <p className="text-center text-sm text-blue-600 mt-2 hover:underline">
          <Link href="/shop/login" prefetch={false}>Quay lại đăng nhập</Link>
        </p>
      </form>
    </AuthCard>
  );
}
