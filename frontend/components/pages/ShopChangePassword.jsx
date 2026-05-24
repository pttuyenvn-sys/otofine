"use client";

import { useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthCard from "../AuthCard";
import PasswordInput from "../PasswordInput";
import ShopGuard from "../ShopGuard";
import { API_BASE } from "@/lib/config";
import { buildShopLoginUrl, getCurrentShopReturnPath } from "@/lib/auth/safeShopRedirect";

function ChangePasswordForm() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    if (newPassword !== confirm) {
      setMsg("Mật khẩu xác nhận không khớp");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace(buildShopLoginUrl(getCurrentShopReturnPath()));
      return;
    }
    try {
      const res = await axios.post(
        `${API_BASE}/auth/change-password`,
        { oldPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setMsg(res.data.message || "Đổi mật khẩu thành công.");
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("auth");
      setTimeout(() => router.replace("/shop/login"), 2500);
    } catch (err) {
      setMsg(err.response?.data?.message || "Không thể đổi mật khẩu");
    }
  }

  return (
    <AuthCard title="Đổi mật khẩu">
      <form onSubmit={submit} className="space-y-3">
        <PasswordInput
          className="w-full p-3 rounded-xl border border-gray-300 bg-white"
          autoComplete="current-password"
          placeholder="Mật khẩu hiện tại"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
        />
        <PasswordInput
          className="w-full p-3 rounded-xl border border-gray-300 bg-white"
          autoComplete="new-password"
          placeholder="Mật khẩu mới"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
        />
        <PasswordInput
          className="w-full p-3 rounded-xl border border-gray-300 bg-white"
          autoComplete="new-password"
          placeholder="Xác nhận mật khẩu mới"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <button
          type="submit"
          className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          Cập nhật mật khẩu
        </button>
      </form>
      <p className="text-gray-700 text-sm pt-2">{msg}</p>
      <p className="text-center text-sm mt-3">
        <Link href="/shop/settings" className="text-blue-600" prefetch={false}>
          Quay lại cài đặt shop
        </Link>
      </p>
    </AuthCard>
  );
}

export default function ShopChangePassword() {
  return (
    <ShopGuard>
      <ChangePasswordForm />
    </ShopGuard>
  );
}
