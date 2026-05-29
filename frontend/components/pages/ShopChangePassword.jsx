"use client";

import { useState } from "react";
import axiosClient from "@/api/axiosClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthCard from "../AuthCard";
import PasswordInput from "../PasswordInput";
import ShopGuard from "../ShopGuard";
import { API_BASE } from "@/lib/config";
import { buildShopLoginUrl, getCurrentShopReturnPath } from "@/lib/auth/safeShopRedirect";
import { removeShopToken, removeShopRefreshToken, removeShopAuth } from "@/lib/auth/storage";

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
    const token = getShopToken();
    if (!token) {
      router.replace(buildShopLoginUrl(getCurrentShopReturnPath()));
      return;
    }
    try {
      const res = await axiosClient.post("/auth/change-password", { oldPassword, newPassword });
      setMsg(res.data.message || "Đổi mật khẩu thành công.");
      try {
        removeShopToken();
        removeShopRefreshToken();
        removeShopAuth();
      } catch {}
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
