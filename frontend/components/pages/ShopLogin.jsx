"use client";

import { useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import OneSignal from "react-onesignal";

import AuthCard from "../AuthCard";
import PasswordInput from "../PasswordInput";
import { API_BASE } from "@/lib/config";
import ShopPushPrompt from "@/components/push/ShopPushPrompt";
import { getShopLoginDestinationFromSearch } from "@/lib/auth/safeShopRedirect";
import { writeOwnerCookie } from "@/lib/auth/sellerOwnerCookie";
import { setShopToken, setShopRefreshToken, setShopAuth, setShopId } from "@/lib/auth/storage";

export default function ShopLogin() {
  const router = useRouter();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {

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

      

      // namespaced shop storage
      try {
        setShopToken(res.data.token);
        if (res.data.refreshToken) setShopRefreshToken(res.data.refreshToken);
      } catch {}
      // Mirror the access token into a cross-subdomain cookie so the
      // storefront admin switcher (top owner strip + chip) can detect
      // ownership when the seller visits their own wildcard subdomain
      // (e.g. https://<slug>.otofine.com). The backend uses Bearer
      // auth — this cookie is purely UX-shared-state.
      writeOwnerCookie(res.data.token);

      const sellerShopPk = res.data.shop?.id;

      if (sellerShopPk != null && sellerShopPk !== "") {
        try { setShopId(String(sellerShopPk)); } catch {}

        const playerId =
          OneSignal.User?.PushSubscription?.id ||
          OneSignal.User?.onesignalId ||
          null;

        

        if (playerId) {
          try {
            const rs = await fetch(
              `${API_BASE}/push/save-player-id`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  playerId,
                  shopId: sellerShopPk,
                }),
              }
            );

            
          } catch (e) {
            console.error("SHOP PLAYER LINK ERROR:", e);
          }
        }
      }

      try {
        setShopAuth({ role: "shop", email: res.data.shop.email });
      } catch {}

      window.dispatchEvent(new Event("auth-changed"));

      setMsg("Đăng nhập thành công!");

      const destination = getShopLoginDestinationFromSearch(window.location.search);
      router.replace(destination);
    } catch (err) {
      console.error(err);

      const status = err.response?.status;
      const serverMsg = err.response?.data?.message;
      if (status === 401) {
        setMsg(serverMsg || "Sai tài khoản hoặc mật khẩu");
      } else if (status === 403) {
        setMsg(serverMsg || "Shop chưa được duyệt hoặc đã bị khóa");
      } else if (status === 429) {
        setMsg(serverMsg || "Quá nhiều yêu cầu — thử lại sau ít phút");
      } else if (status === 400) {
        setMsg(serverMsg || "Sai tài khoản hoặc mật khẩu");
      } else {
        setMsg(serverMsg || "Lỗi hệ thống, thử lại");
      }
    }
  }

  return (
    <>
      <ShopPushPrompt />

      <AuthCard title="Đăng nhập Shop">
        <form
          onSubmit={submit}
          className="space-y-3"
        >
          <input
            className="w-full p-3 rounded-xl border border-gray-300 bg-white"
            placeholder="Email hoặc SĐT"
            onChange={(e) =>
              setEmailOrPhone(e.target.value)
            }
          />

          <PasswordInput
            className="w-full p-3 rounded-xl border border-gray-300 bg-white"
            placeholder="Mật khẩu"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            className="w-full p-3 rounded-xl bg-blue-600 text-white font-semibold"
          >
            Đăng nhập
          </button>

          <p className="text-gray-700 text-sm">
            {msg}
          </p>

          <p className="text-sm text-center mt-2">
            <Link
              href="/shop/forgot-password"
              className="text-blue-600"
              prefetch={false}
            >
              Quên mật khẩu?
            </Link>
          </p>

          <p className="text-sm text-center mt-3">
            Chưa có shop?{" "}
            <Link
              href="/shop/register"
              className="text-blue-600 font-semibold"
              prefetch={false}
            >
              Đăng ký ngay
            </Link>
          </p>
        </form>
      </AuthCard>
    </>
  );
}