"use client";

import { useState } from "react";
import axios from "axios";
import AuthCard from "../AuthCard";
import { API_BASE } from "@/lib/config";

export default function ShopRegister() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [msg, setMsg] = useState("");

  function handleChange(key, value) {
    setForm({ ...form, [key]: value });
  }

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/auth/shop-register`, form);
      setMsg("Đăng ký thành công! Vui lòng chờ admin duyệt shop.");
    } catch (err) {
      setMsg("Lỗi: " + (err.response?.data?.error || "Không thể đăng ký"));
    }
  }

  return (
    <AuthCard title="Đăng ký Shop">
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full p-3 rounded-xl border border-gray-300 bg-white 
                     text-gray-800 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          placeholder="Tên shop"
          onChange={(e) => handleChange("name", e.target.value)}
        />

        <input
          className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-800 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          placeholder="Email"
          onChange={(e) => handleChange("email", e.target.value)}
        />

        <input
          className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-800 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          placeholder="Số điện thoại"
          onChange={(e) => handleChange("phone", e.target.value)}
        />

        <input
          className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-800 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          type="password"
          placeholder="Mật khẩu"
          onChange={(e) => handleChange("password", e.target.value)}
        />

        <button
          className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold 
                           hover:bg-blue-700 transition active:scale-95"
        >
          Đăng ký
        </button>

        <p className="text-gray-700 text-sm pt-2">{msg}</p>
      </form>
    </AuthCard>
  );
}
