"use client";

import { useState } from "react";
import axios from "axios";
import Link from "next/link";
import AuthCard from "../AuthCard";
import { API_BASE } from "@/lib/config";

export default function ShopForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    try {
      const res = await axios.post(`${API_BASE}/auth/shop-forgot-password`, {
        email: email.trim().toLowerCase(),
      });
      setSent(true);
      setMsg(
        res.data.message ||
          "Nếu email đã đăng ký, bạn sẽ nhận hướng dẫn đặt lại mật khẩu trong vài phút.",
      );
    } catch (err) {
      const m =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Không thể gửi yêu cầu. Thử lại sau.";
      setMsg(m);
    }
  }

  return (
    <AuthCard title="Quên mật khẩu Shop">
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          autoComplete="email"
          className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Email đăng ký shop"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sent}
          required
        />
        <button
          type="submit"
          disabled={sent}
          className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
        >
          Gửi email đặt lại mật khẩu
        </button>
      </form>

      <p className="text-gray-700 text-sm pt-2">{msg}</p>

      <p className="text-center text-sm text-blue-600 mt-3">
        <Link href="/shop/login" prefetch={false}>
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
