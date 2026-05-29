"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCard from "../AuthCard";
import PasswordInput from "../PasswordInput";
import { API_BASE } from "@/lib/config";

export default function ShopResetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    if (password !== confirm) {
      setMsg("Mật khẩu xác nhận không khớp");
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/auth/shop-reset-password`, {
        token: token.trim(),
        newPassword: password,
      });
      setMsg(res.data.message || "Đặt lại mật khẩu thành công.");
      try {
        const { removeShopToken, removeShopRefreshToken, removeShopAuth } = require("@/lib/auth/storage");
        removeShopToken();
        removeShopRefreshToken();
        removeShopAuth();
      } catch {
        try {
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("auth");
        } catch {}
      }
      setTimeout(() => router.replace("/shop/login"), 2000);
    } catch (err) {
      setMsg(
        err.response?.data?.message ||
          "Liên kết không hợp lệ hoặc đã hết hạn",
      );
    }
  }

  return (
    <AuthCard title="Đặt lại mật khẩu">
      <form onSubmit={submit} className="space-y-3">
        {!searchParams.get("token") && (
          <input
            className="w-full p-3 rounded-xl border border-gray-300 bg-white"
            placeholder="Mã từ email (nếu không có trong URL)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        )}
        <PasswordInput
          className="w-full p-3 rounded-xl border border-gray-300 bg-white"
          autoComplete="new-password"
          placeholder="Mật khẩu mới (tối thiểu 8 ký tự, có chữ và số)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <PasswordInput
          className="w-full p-3 rounded-xl border border-gray-300 bg-white"
          autoComplete="new-password"
          placeholder="Xác nhận mật khẩu"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <button
          type="submit"
          className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          Lưu mật khẩu mới
        </button>
      </form>
      <p className="text-gray-700 text-sm pt-2">{msg}</p>
      <p className="text-center text-sm mt-3">
        <Link href="/shop/login" className="text-blue-600" prefetch={false}>
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
