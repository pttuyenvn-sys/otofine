"use client";

import { useState } from "react";
import axios from "axios";
import AuthCard from "../AuthCard";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/config";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function submit(e) {
    e.preventDefault();
    setMsg("");

    try {
      const res = await axios.post(`${API_BASE}/auth/admin-login`, {
        email,
        password,
      });

      // 🔴 BẮT BUỘC
      localStorage.setItem("token", res.data.token);
      localStorage.setItem(
        "auth",
        JSON.stringify({
          role: "admin",
          email: res.data.admin.email,
        })
      );
      window.dispatchEvent(new Event("auth-changed"));

      setMsg("Đăng nhập admin thành công!");

      // 👉 chuyển sang trang quản lý shop
      router.push("/admin/shops");
    } catch (error) {
      setMsg("Sai email hoặc mật khẩu");
    }
  }

  return (
    <AuthCard title="Đăng nhập Admin">
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full p-3 rounded-xl border"
          placeholder="Email admin"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full p-3 rounded-xl border"
          placeholder="Mật khẩu"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="w-full p-3 rounded-xl bg-blue-600 text-white">
          Đăng nhập
        </button>

        <p className="text-sm text-gray-700">{msg}</p>
      </form>
    </AuthCard>
  );
}
