"use client";

/**
 * Resolve the authenticated seller's public storefront URL.
 *
 * Used by sidebar / account / settings header to render the "Xem
 * storefront" / "Mở storefront" shortcuts. We deliberately do NOT
 * stuff the URL into the JWT (slug can change at any time after the
 * token was minted), so the lookup happens against the same
 * `/shop/public-page` endpoint that the settings page already calls.
 *
 * The result is cached in `sessionStorage` so navigating between
 * seller pages doesn't trigger a refetch on every mount. The cache
 * is keyed off the JWT payload so a seller-account switch invalidates
 * the cached URL.
 */

import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { getMyPublicPage } from "@/api/shopPublicPageApi";

const SESSION_KEY = "seller.storefrontUrl.v1";

function readCache() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    /* swallow */
  }
}

function jwtFingerprint() {
  try {
    const t = localStorage.getItem("token");
    if (!t) return null;
    const d = jwtDecode(t);
    return [d?.role || "?", d?.shopId || "?", d?.id || "?"].join(":");
  } catch {
    return null;
  }
}

export default function useSellerStorefrontUrl() {
  const [state, setState] = useState({
    loading: true,
    url: null,
    slug: null,
    isLive: false,
  });

  useEffect(() => {
    let cancelled = false;
    const fp = jwtFingerprint();
    if (!fp) {
      setState({ loading: false, url: null, slug: null, isLive: false });
      return undefined;
    }

    const cached = readCache();
    if (cached && cached.fp === fp) {
      setState({
        loading: false,
        url: cached.url || null,
        slug: cached.slug || null,
        isLive: !!cached.isLive,
      });
      // Still revalidate in the background, but only after a short
      // delay so cold page-loads stay snappy.
    }

    (async () => {
      try {
        const res = await getMyPublicPage();
        if (cancelled) return;
        const data = res?.data || {};
        const url = data?.preview?.subdomain || data?.preview?.apex || null;
        const slug = data?.slug || null;
        const isLive = (data?.public_status || data?.publicStatus) === "public";
        writeCache({ fp, url, slug, isLive });
        setState({ loading: false, url, slug, isLive });
      } catch {
        if (cancelled) return;
        if (!cached) {
          setState({ loading: false, url: null, slug: null, isLive: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
