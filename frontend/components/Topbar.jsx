"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";

export default function Topbar() {
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState(null);
  const ref = useRef();
  const router = useRouter();

  useEffect(() => {
    function loadAuth() {
      const token = localStorage.getItem("token");
      if (!token) {
        setAuth(null);
        return;
      }

      try {
        const decoded = jwtDecode(token);
        let emailFromStorage = "";
        try {
          const raw = localStorage.getItem("auth");
          if (raw) emailFromStorage = JSON.parse(raw).email || "";
        } catch {
          /* ignore */
        }
        setAuth({
          ...decoded,
          email: decoded.email || emailFromStorage || "",
        });
      } catch {
        setAuth(null);
      }
    }

    loadAuth();

    window.addEventListener("storage", loadAuth);
    window.addEventListener("auth-changed", loadAuth);
    return () => {
      window.removeEventListener("storage", loadAuth);
      window.removeEventListener("auth-changed", loadAuth);
    };
  }, []);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  function handleLogout() {
    localStorage.clear();
    setAuth(null);
    setOpen(false);

    if (auth?.role === "admin") {
      router.push("/admin/login");
    } else {
      router.push("/shop/login");
    }
  }

  const email = (auth?.email || "").trim();
  const roleLabel =
    auth?.role === "admin"
      ? "Admin"
      : auth?.role === "shop"
        ? "Shop"
        : "Đăng nhập";

  return (
    <header
      style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        borderBottom: "1px solid #eef2f6",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          Back
        </button>
        <div style={{ fontWeight: 700 }}>Otofine Seller Center</div>
      </div>

      <div ref={ref} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #eef2f6",
            background: "#fff",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#0ea5a1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {(email || "U")[0]?.toUpperCase()}
          </div>

          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {email || "Chưa đăng nhập"}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{roleLabel}</div>
          </div>
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 48,
              minWidth: 220,
              background: "#fff",
              boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
              borderRadius: 10,
              padding: 8,
            }}
          >
            {auth?.role === "admin" && (
              <>
                <Link href="/admin/shops" style={menuStyle}>
                  Quản lý Shop
                </Link>
                <div style={menuStyle} onClick={handleLogout} role="presentation">
                  Logout
                </div>
              </>
            )}

            {auth?.role === "shop" && (
              <>
                <Link href="/shop/settings" style={menuStyle}>
                  Shop Settings
                </Link>
                <Link href="/shop/products" style={menuStyle}>
                  Products
                </Link>
                <div style={menuStyle} onClick={handleLogout} role="presentation">
                  Logout
                </div>
              </>
            )}

            {!auth && (
              <>
                <Link href="/shop/login" style={menuStyle}>
                  Shop Login
                </Link>
                <Link href="/shop/register" style={menuStyle}>
                  Shop Register
                </Link>
                <Link href="/admin/login" style={menuStyle}>
                  Admin Login
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

const menuStyle = {
  display: "block",
  padding: "10px 12px",
  textDecoration: "none",
  color: "#0f172a",
  borderRadius: 8,
  marginTop: 6,
  cursor: "pointer",
};
