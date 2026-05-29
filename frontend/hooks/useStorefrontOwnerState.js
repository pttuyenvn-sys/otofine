"use client";

/**
 * Storefront owner-detection hook.
 *
 * Resolves whether the current visitor is the verified owner of the
 * storefront with `shopId === expectedShopId`.
 *
 * Token lookup order:
 *   1. `localStorage.token`  — works on the apex (where the seller
 *      logged in) and on previewing under the seller workspace.
 *   2. `document.cookie`     — set with `Domain=.otofine.com` after
 *      login (see lib/auth/sellerOwnerCookie.js). This is how the
 *      wildcard subdomain (`<slug>.otofine.com`) sees the seller's
 *      credentials even though its localStorage is empty.
 *
 * Token verification:
 *   - JWT is `jwt-decode`d only (no signature verification — the
 *     storefront has no JWT_SECRET). The decoded payload determines
 *     UI visibility ONLY. Every back-end API the chip links into
 *     (seller workspace pages, /shop/metrics/overview, etc.) verifies
 *     the token server-side, so a spoofed JWT can't escalate beyond
 *     "see a chip that links into a page that returns 401".
 *
 * Returns a stable object:
 *   { isOwner, token, role, shopId, email, ready }
 *   - `ready=false` during SSR + the first client tick so callers can
 *     render a blank placeholder without hydration mismatch.
 */

import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { readOwnerCookie } from "@/lib/auth/sellerOwnerCookie";
import { getShopToken } from "@/lib/auth/storage";

function decodeSafe(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function readToken() {
  try {
    const fromLocal = getShopToken();
    if (fromLocal) return fromLocal;
  } catch {
    /* swallow */
  }
  return readOwnerCookie();
}

function computeState(expectedShopId) {
  const token = readToken();
  if (!token) {
    return { isOwner: false, token: null, role: null, shopId: null, email: null };
  }
  const decoded = decodeSafe(token);
  if (!decoded || decoded.role !== "shop") {
    return { isOwner: false, token, role: decoded?.role || null, shopId: null, email: null };
  }
  const matches =
    decoded.shopId != null &&
    expectedShopId != null &&
    String(decoded.shopId) === String(expectedShopId);
  return {
    isOwner: matches,
    token,
    role: "shop",
    shopId: decoded.shopId || null,
    email: decoded.email || null,
  };
}

export default function useStorefrontOwnerState(expectedShopId) {
  const [state, setState] = useState({
    isOwner: false,
    token: null,
    role: null,
    shopId: null,
    email: null,
    ready: false,
  });

  useEffect(() => {
    function recompute() {
      const next = computeState(expectedShopId);
      setState({ ...next, ready: true });
    }
    recompute();
    window.addEventListener("storage", recompute);
    window.addEventListener("auth-changed", recompute);
    return () => {
      window.removeEventListener("storage", recompute);
      window.removeEventListener("auth-changed", recompute);
    };
  }, [expectedShopId]);

  return state;
}
