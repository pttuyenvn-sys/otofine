/**
 * Canonical storefront preview URLs — shared by seller settings and admin governance.
 * Subdomain primary when PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED; otherwise apex /shops/{slug}.
 */

const FRONTEND_BASE =
  process.env.FRONTEND_URL?.replace(/\/$/, "") || "https://otofine.com";

function parseFlag(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function apexHost() {
  try {
    return new URL(FRONTEND_BASE).hostname.replace(/^www\./, "");
  } catch {
    return "otofine.com";
  }
}

/**
 * @param {string|null|undefined} slug
 * @param {string|null|undefined} publicStatus DB enum (pending/public/suspended)
 * @returns {{ subdomain: string, apex: string, primary: string, isLive: boolean } | null}
 */
export function buildStorefrontPreviewUrl(slug, publicStatus) {
  if (!slug) return null;
  const subdomain = `https://${slug}.${apexHost()}`;
  const apex = `${FRONTEND_BASE}/shops/${slug}`;
  const subdomainEnabled = parseFlag(process.env.PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED);
  return {
    subdomain,
    apex,
    primary: subdomainEnabled ? subdomain : apex,
    isLive: String(publicStatus || "").trim().toLowerCase() === "public",
  };
}
