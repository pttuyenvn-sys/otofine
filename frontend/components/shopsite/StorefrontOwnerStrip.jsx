"use client";

/**
 * Storefront Owner Status Strip.
 *
 * A slim top-of-page bar that ONLY mounts for the authenticated owner
 * of the current storefront. It gives the seller an immediate "this is
 * MY shop" signal plus a 1-glance snapshot of today's commerce
 * activity, without polluting the customer-facing layout.
 *
 * For everyone else (anonymous visitors, sellers of OTHER shops) the
 * component returns null and never paints — SSR is unaffected.
 *
 * What it shows when active:
 *   - "Đây là shop của bạn" status with the seller's email.
 *   - Today's storefront views / RFQ / CTA click counts (compact pills).
 *   - A "Quản lý shop" CTA that targets the apex seller workspace.
 *   - A "✕" dismiss button — the strip is dismissed per session so the
 *     seller can browse their own page cleanly after acknowledging it.
 *
 * Data source:
 *   `GET /shop/metrics/overview` — same endpoint the `/shop/insights`
 *   dashboard already calls; no extra back-end work. We fetch ONCE
 *   when ownership is confirmed and cache the result on the component
 *   so the strip stays cheap (no polling).
 *
 * Performance:
 *   - SSR renders nothing (`"use client"`, ownership only known after
 *     hydration). No layout shift on customer-facing renders.
 *   - The metrics call only fires when `isOwner === true`. Anonymous
 *     visitors never trigger the request.
 *   - Dismissal is persisted in `sessionStorage` keyed by shopId so
 *     dismissing on one tab survives navigation inside the session
 *     but doesn't hide the strip forever.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/config";
import { apexUrl } from "@/lib/apexOrigin";
import useStorefrontOwnerState from "@/hooks/useStorefrontOwnerState";

function compact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(Math.max(0, Math.floor(v)));
}

function dismissKey(shopId) {
  return `ot:ownerStrip:dismiss:${shopId || "anon"}`;
}

function isApexHost() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "otofine.com" || host === "www.otofine.com") return true;
  return false;
}

export default function StorefrontOwnerStrip({ shopId, shopName }) {
  const { isOwner, token, email, ready } = useStorefrontOwnerState(shopId);

  const [dismissed, setDismissed] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    try {
      const raw = sessionStorage.getItem(dismissKey(shopId));
      if (raw === "1") setDismissed(true);
    } catch {
      /* swallow */
    }
  }, [isOwner, shopId]);

  useEffect(() => {
    if (!isOwner || !token) return undefined;
    let cancelled = false;
    setLoading(true);
    axios
      .get(`${API_BASE}/shop/metrics/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (cancelled) return;
        setMetrics(res.data || null);
      })
      .catch(() => {
        if (cancelled) return;
        setMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, token]);

  const manageHref = useMemo(
    () => (isApexHost() ? "/shop/settings" : apexUrl("/shop/settings")),
    [],
  );
  const insightsHref = useMemo(
    () => (isApexHost() ? "/shop/insights" : apexUrl("/shop/insights")),
    [],
  );
  const productsHref = useMemo(
    () => (isApexHost() ? "/shop/products" : apexUrl("/shop/products")),
    [],
  );

  if (!ready) return null;
  if (!isOwner) return null;
  if (dismissed) return null;

  const cardsToday = metrics?.cardsToday || {};

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(dismissKey(shopId), "1");
    } catch {
      /* swallow */
    }
  }

  return (
    <div className="storefront-owner-strip" role="status" aria-live="polite">
      <div className="storefront-owner-strip__inner">
        <div className="storefront-owner-strip__lead">
          <span className="storefront-owner-strip__badge">SELLER</span>
          <span className="storefront-owner-strip__title">
            <span className="storefront-owner-strip__title-text">
              Đây là shop của bạn
            </span>
            {email ? (
              <span className="storefront-owner-strip__email">· {email}</span>
            ) : null}
          </span>
        </div>

        <div className="storefront-owner-strip__metrics" aria-label="Hoạt động hôm nay">
          <a className="storefront-owner-strip__metric" href={insightsHref}>
            <span className="storefront-owner-strip__metric-label">Lượt xem hôm nay</span>
            <span className="storefront-owner-strip__metric-value">
              {loading ? "…" : compact(cardsToday.storefrontViewsToday)}
            </span>
          </a>
          <a className="storefront-owner-strip__metric" href={insightsHref}>
            <span className="storefront-owner-strip__metric-label">CTA</span>
            <span className="storefront-owner-strip__metric-value">
              {loading ? "…" : compact(cardsToday.ctaClicksToday)}
            </span>
          </a>
          <a className="storefront-owner-strip__metric" href={insightsHref}>
            <span className="storefront-owner-strip__metric-label">RFQ mới</span>
            <span className="storefront-owner-strip__metric-value">
              {loading ? "…" : compact(cardsToday.rfqReceivedToday)}
            </span>
          </a>
          {cardsToday.outOfStockCount > 0 ? (
            <a
              className="storefront-owner-strip__metric storefront-owner-strip__metric--warn"
              href={productsHref}
              title="Sản phẩm hết hàng"
            >
              <span className="storefront-owner-strip__metric-label">Hết hàng</span>
              <span className="storefront-owner-strip__metric-value">
                {compact(cardsToday.outOfStockCount)}
              </span>
            </a>
          ) : null}
        </div>

        <div className="storefront-owner-strip__actions">
          <a
            href={manageHref}
            className="storefront-owner-strip__cta"
            aria-label={`Quản lý shop ${shopName || ""}`.trim()}
          >
            <span aria-hidden>⚙</span>
            <span>Quản lý shop</span>
          </a>
          <button
            type="button"
            className="storefront-owner-strip__dismiss"
            onClick={handleDismiss}
            aria-label="Ẩn thanh quản lý"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
