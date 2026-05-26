"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/config";

/**
 * Lightweight per-page hook that fetches the seller's
 * "product click heat" map ONCE per session and shares it across
 * every component that mounts on the seller products page.
 *
 * The heat map keys are product IDs and values are click counts over
 * the last 7 days, served by `/api/shop/metrics/overview` as
 * `productClickHeatLast7d`. The endpoint is already used by the
 * `/shop/insights` dashboard so the network round-trip is paid
 * either way.
 *
 * Implementation notes:
 *   - Module-scoped cache. Multiple `useShopProductHeat()` callers on
 *     the same page share one inflight request.
 *   - 5-minute TTL. After 5 minutes the next caller forces a refresh.
 *   - SSR-safe: returns an empty map on the server.
 *   - Silently degrades to `{}` on auth / network failure. Heat is a
 *     hint, never a hard requirement, so the page must keep working.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached = null; // { ts: number, map: Map<number, number>, top?: {...} }
let inflight = null;

async function fetchHeatMap() {
  if (typeof window === "undefined") return { map: new Map(), top: null };
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached;
  if (inflight) return inflight;

  const token = (() => {
    try {
      return localStorage.getItem("token");
    } catch {
      return null;
    }
  })();
  if (!token) {
    cached = { ts: Date.now(), map: new Map(), top: null };
    return cached;
  }

  inflight = axios
    .get(`${API_BASE}/shop/metrics/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then((res) => {
      const raw = res?.data?.productClickHeatLast7d || {};
      const map = new Map();
      for (const [k, v] of Object.entries(raw)) {
        const id = Number(k);
        const c = Number(v);
        if (Number.isFinite(id) && Number.isFinite(c)) map.set(id, c);
      }
      const top = res?.data?.cardsToday?.topProduct || null;
      cached = { ts: Date.now(), map, top };
      return cached;
    })
    .catch(() => {
      cached = { ts: Date.now(), map: new Map(), top: null };
      return cached;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function useShopProductHeat() {
  const [state, setState] = useState(() => ({
    map: cached?.map || new Map(),
    top: cached?.top || null,
    loading: !cached,
  }));

  useEffect(() => {
    let cancelled = false;
    fetchHeatMap().then((c) => {
      if (cancelled) return;
      setState({ map: c.map, top: c.top, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * Pure helper: classify a single product's click count into a heat
 * tier shared by the chip renderers (table + mobile card). Mirrors
 * the language the seller-intelligence brief asked for.
 *
 *   tier "hot"    → "🔥 Quan tâm cao"     ≥ 20 clicks
 *   tier "rising" → "📈 Tăng tương tác"   ≥ 10 clicks
 *   tier "viewed" → "👀 Được xem nhiều"   ≥ 5 clicks
 *   tier null     → no chip
 */
export function deriveProductHeatBadge(clicks) {
  const c = Number(clicks) || 0;
  if (c >= 20) {
    return { tier: "hot", label: "🔥 Quan tâm cao", tone: "hot", clicks: c };
  }
  if (c >= 10) {
    return { tier: "rising", label: "📈 Tăng tương tác", tone: "warm", clicks: c };
  }
  if (c >= 5) {
    return { tier: "viewed", label: "👀 Được xem nhiều", tone: "info", clicks: c };
  }
  return null;
}
