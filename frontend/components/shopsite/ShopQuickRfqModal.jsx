"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { API_BASE } from "@/lib/config";
import { normalizePhoneVN } from "@/lib/rfq/rfqCreateValidation";
import { ShopsiteEvents, trackShopsiteEvent } from "@/lib/shopsite/shopsiteAnalytics";

/**
 * Compact RFQ modal for storefront pages.
 *
 * Fields (intentionally minimal):
 *   - Tên phụ tùng (text, required)
 *   - Xe (text, required — single-line, free-form)
 *   - Số điện thoại (text, required, normalised to +84)
 *
 * On submit:
 *   - POST `/api/rfq/create` with `{ phone, partDescription, vehicle }`
 *   - Saves `rfq_public_id` + `rfq_phone` to `sessionStorage` exactly
 *     like the full `/rfq/new` flow so the existing `/rfq/success`
 *     OTP page picks up where we left off.
 *   - Redirects to `/rfq/success` (apex-relative, so it works on both
 *     wildcard subdomain and apex).
 *
 * Reuses the EXISTING create endpoint + EXISTING OTP success flow —
 * zero backend surface change. The vehicle string is sent as
 * `{ brand: "", model: "", year: "", text: "<raw>" }` so the
 * backend's existing parser doesn't choke (it expects the object
 * shape).
 *
 * Why a real `<dialog>`-style portal:
 *   - keeps the modal visually owned by `<body>` so it can never be
 *     clipped by a parent `overflow:hidden` (the contact card column
 *     uses it for the rounded radius).
 *   - body-scroll-lock prevents the background from scrolling on
 *     mobile when the modal is open.
 *
 * Open/close is controlled — the modal itself doesn't own visibility;
 * the launcher button (floating CTA / product-card mini button) does.
 */
export default function ShopQuickRfqModal({
  open,
  onClose,
  shop,
  prefill = {},
}) {
  const [mounted, setMounted] = useState(false);
  const [phone, setPhone] = useState("");
  const [part, setPart] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstFieldRef = useRef(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    // Pre-fill from props once each open. Falls back to last known
    // phone in sessionStorage so repeat-buyers don't have to retype.
    setPart(prefill.part || "");
    const parsed = parseVehicleHint(prefill.vehicle || "");
    setBrand(prefill.brand || parsed.brand || "");
    setModel(prefill.model || parsed.model || "");
    setYear(prefill.year || parsed.year || "");
    const stored =
      typeof window !== "undefined"
        ? sessionStorage.getItem("rfq_phone") || ""
        : "";
    setPhone(prefill.phone || stored || "");
    setError("");
    setBusy(false);
    document.body.classList.add("overflow-hidden");
    const t = setTimeout(() => {
      try {
        firstFieldRef.current?.focus();
      } catch {/* noop */}
    }, 60);
    return () => {
      document.body.classList.remove("overflow-hidden");
      clearTimeout(t);
    };
  }, [open, prefill.part, prefill.vehicle, prefill.brand, prefill.model, prefill.year, prefill.phone]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");

    const p = part.trim();
    const b = brand.trim();
    const m = model.trim();
    const y = year.trim();
    const phoneE164 = normalizePhoneVN(phone);

    if (p.length < 3) {
      setError("Vui lòng mô tả phụ tùng cần tìm (ít nhất 3 ký tự).");
      return;
    }
    if (!/^\+84\d{9,10}$/.test(phoneE164)) {
      setError("Số điện thoại không hợp lệ.");
      return;
    }
    if (b.length < 2) {
      setError("Vui lòng nhập hãng xe (ít nhất 2 ký tự).");
      return;
    }
    if (m.length < 1) {
      setError("Vui lòng nhập dòng xe.");
      return;
    }
    const yearNum = Number(y);
    const maxYear = new Date().getFullYear() + 1;
    if (!Number.isFinite(yearNum) || yearNum < 1990 || yearNum > maxYear) {
      setError("Năm sản xuất không hợp lệ (1990 – nay).");
      return;
    }

    setBusy(true);
    try {
      const res = await axios.post(
        `${API_BASE}/rfq/create`,
        {
          phone: phoneE164,
          partDescription: p,
          vehicle: { brand: b, model: m, year: yearNum },
          imageUrls: [],
        },
        { timeout: 25_000 },
      );
      const pid = res.data?.publicId;
      if (!pid) throw new Error("NO_PUBLIC_ID");
      try {
        sessionStorage.setItem("rfq_public_id", pid);
        sessionStorage.setItem("rfq_phone", phone.trim());
        if (res.data.devOtpCode) {
          sessionStorage.setItem("rfq_dev_otp", String(res.data.devOtpCode));
        }
      } catch {/* private mode */}
      trackShopsiteEvent(
        ShopsiteEvents.RFQ_CTA_CLICK || "rfq_cta_click",
        {
          shopSlug: shop?.slug || null,
          source: prefill.source || "quick_rfq_modal",
        },
      );
      window.location.href = "/rfq/success";
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Không gửi được yêu cầu. Vui lòng thử lại.",
      );
      setBusy(false);
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-rfq-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 sm:p-5"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#e60012]/10 text-[#e60012] shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div
              id="quick-rfq-title"
              className="text-base sm:text-lg font-bold text-gray-900 leading-tight"
            >
              Tìm phụ tùng nhanh
            </div>
            <div className="text-[12px] text-gray-500 mt-0.5">
              {shop?.name ? `Gửi yêu cầu trực tiếp tới ${shop.name} và các shop phù hợp.` : "Shop sẽ liên hệ lại trong ít phút."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-gray-400 hover:text-gray-700 -m-1 p-1"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <Field label="Tên phụ tùng">
            <input
              ref={firstFieldRef}
              type="text"
              value={part}
              onChange={(e) => setPart(e.target.value)}
              placeholder="VD: Lọc gió, má phanh trước…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e60012]/40 focus:border-[#e60012]"
              autoComplete="off"
              required
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Hãng xe">
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Toyota"
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e60012]/40 focus:border-[#e60012]"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Dòng xe">
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Vios"
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e60012]/40 focus:border-[#e60012]"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Năm SX">
              <input
                type="text"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2020"
                maxLength={4}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e60012]/40 focus:border-[#e60012] tabular-nums"
                autoComplete="off"
                required
              />
            </Field>
          </div>
          <Field label="Số điện thoại">
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="VD: 0901 234 567"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e60012]/40 focus:border-[#e60012]"
              autoComplete="tel"
              required
            />
          </Field>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white bg-[#e60012] hover:bg-[#c1000f] disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
            >
              {busy ? "Đang gửi…" : "Gửi yêu cầu"}
            </button>
          </div>

          <p className="text-[11px] text-gray-400 leading-snug">
            Bằng việc gửi, bạn đồng ý chia sẻ số điện thoại với shop để nhận
            báo giá phụ tùng.
          </p>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-gray-700 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Heuristic parser for a free-form vehicle hint string like
 * "Toyota • Vios • 2018-2021" (the format the product card's
 * fitment line emits). Returns { brand, model, year } with empty
 * strings when a field can't be recovered. Conservative: never
 * fabricates data — if the input is ambiguous we leave the field
 * blank and let the user fill it in.
 */
function parseVehicleHint(raw) {
  const text = String(raw || "").trim();
  if (!text) return { brand: "", model: "", year: "" };
  // Split on the bullet separator first (matches our own emitted
  // format). Falls back to plain whitespace tokens for "Toyota
  // Vios 2020" style strings.
  const parts = text.includes("•")
    ? text.split("•").map((s) => s.trim()).filter(Boolean)
    : text.split(/\s+/).filter(Boolean);
  let brand = "";
  let model = "";
  let year = "";
  if (parts.length >= 1) brand = parts[0];
  if (parts.length >= 2) model = parts[1];
  // Year is the last 4-digit-ish token in the string. Strip a
  // trailing range ("2018-2021" → "2018") so the modal isn't
  // pre-filled with a value the backend would reject.
  const yearMatch = text.match(/(19|20)\d{2}/);
  if (yearMatch) year = yearMatch[0];
  return { brand, model, year };
}
