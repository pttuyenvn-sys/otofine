"use client";

/**
 * Shop metrics overview — surfaced at the top of /shop/settings.
 *
 * Goals (per seller-nav + metrics overview spec):
 *   - 4 compact stat cards (desktop: 1 row, mobile: 2x2 grid)
 *   - Subtle icons, no charts
 *   - Loading skeletons
 *   - Aggregate-only data — fed by `/api/shop/metrics/overview` which
 *     runs every count as a single SELECT in parallel (no N+1).
 *
 * Failure mode:
 *   - On network error the cards collapse to "—" rather than vanishing
 *     so the layout doesn't shift. The page header / settings form
 *     keep working — nothing here is allowed to gate /shop/settings.
 */

import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/config";

function compactNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) {
    const k = v / 1000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(v);
}

function MetricCard({ icon, label, value, hint, loading }) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-start gap-3 min-w-0"
      aria-label={label}
    >
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-base sm:text-lg shrink-0"
        style={{ background: "#ecfdf5", color: "#059669" }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-[11px] sm:text-xs text-gray-500 font-medium leading-tight"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {label}
        </div>
        <div className="mt-1 text-lg sm:text-2xl font-bold text-gray-900 leading-none tabular-nums">
          {loading ? (
            <span
              className="inline-block w-12 h-5 sm:h-6 rounded bg-gray-100 animate-pulse align-middle"
              aria-hidden="true"
            />
          ) : (
            value
          )}
        </div>
        {hint && (
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-gray-400 truncate">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShopMetricsOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    const token = (() => {
      try { return localStorage.getItem("token"); } catch { return null; }
    })();
    if (!token) {
      setLoading(false);
      return undefined;
    }

    axios
      .get(`${API_BASE}/shop/metrics/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const cards = data?.cards || {};
  const showValue = (raw) => (error ? "—" : compactNumber(raw));

  return (
    <section
      aria-label="Tổng quan shop"
      className="mb-4"
    >
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-semibold text-gray-900">
          Tổng quan shop
        </h2>
        <span className="text-[11px] text-gray-400">30 ngày qua</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <MetricCard
          icon="📦"
          label="Sản phẩm"
          value={showValue(cards.productCount)}
          hint="Toàn bộ shop"
          loading={loading}
        />
        <MetricCard
          icon="📨"
          label="RFQ nhận được"
          value={showValue(cards.rfqReceivedLast30d)}
          hint="Yêu cầu báo giá"
          loading={loading}
        />
        <MetricCard
          icon="📞"
          label="Lượt CTA"
          value={showValue(cards.ctaClicksLast30d)}
          hint="Gọi + Zalo"
          loading={loading}
        />
        <MetricCard
          icon="💬"
          label="Cuộc hội thoại"
          value={showValue(cards.conversationsLast30d)}
          hint="Khách nhắn shop"
          loading={loading}
        />
      </div>
    </section>
  );
}
