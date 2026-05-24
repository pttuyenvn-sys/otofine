"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthCard from "../AuthCard";
import { API_BASE } from "@/lib/config";

export default function ShopForgotPassword() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState(tokenFromUrl ? "reset" : "request");

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      setMode("reset");
    }
  }, [tokenFromUrl]);

  async function requestReset(e) {
    e.preventDefault();
    setMsg("");
    try {
      const res = await axios.post(`${API_BASE}/auth/shop-forgot-password`, {
        emailOrPhone: emailOrPhone.trim(),
      });
      setMsg(
        res.data.message ||
          "Nếu tài khoản tồn tại, bạn sẽ nhận hướng dẫn đặt lại mật khẩu.",
      );
      if (res.data.resetToken) {
        setToken(res.data.resetToken);
        setMode("reset");
        setMsg(
          (res.data.message || "") +
            " (Dev: dùng form bên dưới để đặt mật khẩu mới.)",
        );
      }
    } catch (err) {
      setMsg(err.response?.data?.error || "Không thể gửi yêu cầu");
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setMsg("");
    if (password !== confirm) {
      setMsg("Mật khẩu xác nhận không khớp");
      return;
    }
    try {
      await axios.post(`${API_BASE}/auth/shop-reset-password`, {
        token: token.trim(),
        password,
      });
      setMsg("Đặt lại mật khẩu thành công. Bạn có thể đăng nhập.");
      setMode("done");
    } catch (err) {
      setMsg(err.response?.data?.message || "Token không hợp lệ hoặc đã hết hạn");
    }
  }

  return (
    <AuthCard title="Quên mật khẩu Shop">
      {mode === "request" && (
        <form onSubmit={requestReset} className="space-y-3">
          <input
            className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            placeholder="Nhập email hoặc số điện thoại"
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
          />
          <button
            type="submit"
            className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition active:scale-95"
          >
            Gửi yêu cầu đặt lại mật khẩu
          </button>
        </form>
      )}

      {(mode === "reset" || mode === "done") && (
        <form onSubmit={submitReset} className="space-y-3 mt-4">
          <input
            className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-800"
            placeholder="Mã reset (từ email hoặc liên kết)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={mode === "done"}
          />
          <input
            type="password"
            className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-800"
            placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={mode === "done"}
          />
          <input
            type="password"
            className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-800"
            placeholder="Xác nhận mật khẩu"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={mode === "done"}
          />
          {mode === "reset" && (
            <button
              type="submit"
              className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
            >
              Đặt mật khẩu mới
            </button>
          )}
        </form>
      )}

      <p className="text-gray-700 text-sm pt-2">{msg}</p>

      <p className="text-center text-sm text-blue-600 mt-2 hover:underline">
        <Link href="/shop/login" prefetch={false}>
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
