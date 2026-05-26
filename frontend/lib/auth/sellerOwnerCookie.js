/**
 * Shared cross-subdomain "I'm the owner of this shop" cookie.
 *
 * Problem this solves:
 *   The seller logs in on `https://otofine.com` (apex). The login flow
 *   writes the JWT into `localStorage` — which is per-origin. When the
 *   same seller later visits their own storefront at
 *   `https://<slug>.otofine.com` (wildcard subdomain), the subdomain's
 *   localStorage is empty, so the storefront admin switcher chip never
 *   thinks they're the owner.
 *
 * Approach:
 *   Mirror the access token into a cookie whose Domain attribute is
 *   `.otofine.com`. The browser sends this cookie automatically to
 *   every subdomain, and JavaScript on a subdomain can read it via
 *   `document.cookie`.
 *
 * Security notes:
 *   - The backend uses Authorization: Bearer for auth — it never reads
 *     this cookie. So setting/clearing it has no impact on auth
 *     behaviour (no CSRF surface, no session promotion).
 *   - The cookie is `SameSite=Lax + Secure` in production. The value
 *     IS the JWT, so an XSS still leaks it — same risk profile as the
 *     existing localStorage token (no incremental risk).
 *   - On localhost / non-otofine origins we no-op so dev environments
 *     and previews don't try to set `.otofine.com` cookies that the
 *     browser would reject.
 *
 * The cookie is consumed by:
 *   - `StorefrontSellerShortcut` (admin switcher chip on the public
 *     storefront)
 *   - `StorefrontOwnerStrip` (owner-only top status bar)
 *
 * Both fall back to localStorage when the cookie isn't present (apex
 * path on a freshly-logged-in browser), so the chip keeps working in
 * its previous environments.
 */

const COOKIE_NAME = "ot_owner";

function getCookieDomain() {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (!host) return null;
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  // For *.otofine.com (apex or any subdomain) — set the cookie on the
  // shared parent so wildcard subdomains can see it too. Falling back
  // to `null` means "default to current host" which is the right
  // behaviour for any non-otofine host (preview deploys, etc.).
  if (host === "otofine.com" || host.endsWith(".otofine.com")) {
    return ".otofine.com";
  }
  // Same wildcard rule for any custom apex — pop the leftmost label
  // and prefix with a leading dot. Conservative: only if there are at
  // least two labels.
  const parts = host.split(".");
  if (parts.length >= 2) return `.${parts.slice(-2).join(".")}`;
  return null;
}

function isSecureContext() {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:";
}

/**
 * Write the current access token into the cross-subdomain owner cookie.
 * No-op outside the browser, on localhost, or when the token is empty.
 *
 * @param {string} token  The JWT returned by /auth/shop-login.
 * @param {{ maxAgeSeconds?: number }} [opts]
 */
export function writeOwnerCookie(token, opts = {}) {
  if (typeof document === "undefined") return;
  if (!token || typeof token !== "string") return;
  const domain = getCookieDomain();
  if (!domain) return; // Skip on localhost / IPs.

  const maxAge = Math.max(60, Number(opts.maxAgeSeconds) || 7 * 24 * 60 * 60);
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Domain=${domain}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (isSecureContext()) attrs.push("Secure");
  try {
    document.cookie = attrs.join("; ");
  } catch {
    /* swallow — cookie writes can throw under sandbox/file:// */
  }
}

/**
 * Read the cross-subdomain owner token cookie. Returns the raw token
 * string or null. Never throws.
 */
export function readOwnerCookie() {
  if (typeof document === "undefined") return null;
  try {
    const raw = document.cookie || "";
    if (!raw) return null;
    const parts = raw.split(/;\s*/);
    for (const part of parts) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const name = part.slice(0, eq).trim();
      if (name !== COOKIE_NAME) continue;
      const value = part.slice(eq + 1);
      if (!value) return null;
      return decodeURIComponent(value);
    }
  } catch {
    /* swallow */
  }
  return null;
}

/**
 * Clear the cross-subdomain owner cookie. Called on logout from any
 * surface that touches localStorage (Topbar dropdown, ShopAccount
 * logout row). Safe to call when no cookie is set.
 */
export function clearOwnerCookie() {
  if (typeof document === "undefined") return;
  const domain = getCookieDomain();
  if (!domain) return;
  const attrs = [
    `${COOKIE_NAME}=`,
    `Domain=${domain}`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
  ];
  if (isSecureContext()) attrs.push("Secure");
  try {
    document.cookie = attrs.join("; ");
  } catch {
    /* swallow */
  }
}

export const __SELLER_OWNER_COOKIE_NAME = COOKIE_NAME;
