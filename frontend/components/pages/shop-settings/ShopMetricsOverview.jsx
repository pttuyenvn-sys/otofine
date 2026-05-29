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
import axiosClient from "@/api/axiosClient";
import { getShopToken } from "@/lib/auth/storage";
import { deriveTodayRecommendations } from "@/lib/rfq/buyerIntent";

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
      className="bg-white rounded-xl border border-gray-200 px-2.5 py-2.5 sm:px-4 sm:py-3.5 flex items-start gap-2 sm:gap-3 min-w-0"
      aria-label={label}
    >
      <div
        className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-sm sm:text-lg shrink-0"
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
      try { return getShopToken(); } catch { return null; }
    })();
    if (!token) {
      setLoading(false);
      return undefined;
    }

    axiosClient
      .get("/shop/metrics/overview")
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
  const cardsToday = data?.cardsToday || {};
  const showValue = (raw) => (error ? "—" : compactNumber(raw));

  return (
    <section
      aria-label="Tổng quan shop"
      className="mb-3 sm:mb-4"
    >
      {/* "Hôm nay" mini-row — additive operational signals, sourced from
          the same `/shop/metrics/overview` payload (no extra request).
          On mobile the row is a horizontally scrollable carousel of
          compact pills; desktop renders it inline as a 4-col grid. */}
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[12px] font-semibold text-gray-900 uppercase tracking-wide">
          Hôm nay
        </h3>
        <span className="text-[10px] text-gray-400">cập nhật trực tiếp</span>
      </div>

      <div className="seller-today-row mb-3 sm:mb-4">
        <TodayPill
          icon="📨"
          label="RFQ mới"
          value={showValue(cardsToday.rfqReceivedToday)}
          loading={loading}
        />
        {/*
         * Sales-intelligence pills. Rendered eagerly (no waterfall —
         * they ride the same `/api/shop/metrics/overview` payload as
         * everything else). Hidden when the backend payload omits
         * the keys, so older API versions render the same row as
         * before without layout regression.
         */}
        {hasKey(cardsToday, "hotRfqsToday") ? (
          <TodayPill
            icon="🔥"
            label="RFQ nóng"
            value={showValue(cardsToday.hotRfqsToday)}
            loading={loading}
            tone={Number(cardsToday.hotRfqsToday) > 0 ? "hot" : "info"}
          />
        ) : null}
        {hasKey(cardsToday, "returningBuyersToday") ? (
          <TodayPill
            icon="🔁"
            label="Khách quay lại"
            value={showValue(cardsToday.returningBuyersToday)}
            loading={loading}
          />
        ) : null}
        <TodayPill
          icon="📞"
          label="Lượt CTA"
          value={showValue(cardsToday.ctaClicksToday)}
          loading={loading}
        />
        <TodayPill
          icon="👀"
          label="Lượt xem"
          value={showValue(cardsToday.storefrontViewsToday)}
          loading={loading}
        />
        <TodayPill
          icon="⚠️"
          label="Hết hàng"
          value={showValue(cardsToday.outOfStockCount)}
          loading={loading}
          tone="warn"
        />
      </div>

      <SmartRecommendations cardsToday={cardsToday} loading={loading} error={error} />

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-900">
          Tổng quan shop
        </h2>
        <span className="text-[11px] text-gray-400">30 ngày qua</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
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

/**
 * Compact pill used for the "Hôm nay" operational row. Smaller than
 * MetricCard so the row reads as a quick glance band rather than a
 * second full grid.
 */
function TodayPill({ icon, label, value, loading, tone = "info" }) {
  let toneCls = "border-gray-100 bg-white";
  if (tone === "warn") toneCls = "border-amber-100 bg-amber-50";
  if (tone === "hot") toneCls = "border-red-200 bg-red-50";
  return (
    <div
      className={
        "seller-today-pill inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 shrink-0 " +
        toneCls
      }
    >
      <span aria-hidden className="text-[14px]">{icon}</span>
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] text-gray-500 font-medium">{label}</span>
        <span className="text-[13px] font-bold text-gray-900 tabular-nums">
          {loading ? (
            <span
              className="inline-block w-6 h-3.5 rounded bg-gray-100 animate-pulse align-middle"
              aria-hidden
            />
          ) : (
            value
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Helper: are we allowed to render this pill? We only render new
 * pills when the backend payload includes the key. This lets the
 * frontend roll out independently from a backend version bump
 * without showing "—" placeholders.
 */
function hasKey(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Auto-recommendations card — "AI hint" surface fed by the same
 * `/api/shop/metrics/overview` payload. The derivation is pure
 * (`deriveTodayRecommendations` in `lib/rfq/buyerIntent.js`) so the
 * server and the client never disagree.
 *
 * Renders nothing when there are zero recommendations — the seller
 * already has too many "empty state" cards on the dashboard. We do
 * not render a "no recommendations" placeholder.
 *
 * Also hidden during the initial load skeleton: blinking a card
 * in/out as the payload arrives looks broken.
 */
function SmartRecommendations({ cardsToday, loading, error }) {
  if (loading || error) return null;
  const recs = deriveTodayRecommendations(cardsToday);
  if (!recs.length) return null;
  return (
    <section
      aria-label="Gợi ý cho hôm nay"
      className="mb-3 sm:mb-4 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 sm:px-4 sm:py-3"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span aria-hidden className="text-[14px]">💡</span>
        <h3 className="text-[12px] font-semibold text-emerald-900 uppercase tracking-wide">
          Gợi ý cho hôm nay
        </h3>
      </div>
      <ul className="space-y-1 text-[12px] sm:text-[13px] text-emerald-900/90 leading-snug">
        {recs.map((r) => (
          <li key={r} className="flex gap-1.5">
            <span aria-hidden className="text-emerald-600 shrink-0">›</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
