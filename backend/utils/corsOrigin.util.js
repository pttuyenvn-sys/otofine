/**
 * Browser CORS origin allowlist — Phase 6B.3b.1.
 *
 * Allows apex + single-label https://*.otofine.com storefront hosts.
 * Rejects malformed origins and arbitrary third-party domains.
 * Does NOT use Access-Control-Allow-Origin: *
 */

const ALLOWED_APEX_ORIGINS = Object.freeze([
  "https://otofine.com",
  "https://www.otofine.com",
]);

const PLATFORM_SUFFIX = ".otofine.com";

/** DNS-safe single subdomain label (RFC 1035-ish, lowercase). */
const SUBDOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function parseOrigin(origin) {
  if (!origin || typeof origin !== "string") return null;
  const trimmed = origin.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

/**
 * True when origin is https apex otofine.com or https://*.otofine.com.
 * @param {string} origin
 */
export function isAllowedOtofineBrowserOrigin(origin) {
  const url = parseOrigin(origin);
  if (!url) return false;

  const normalized = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  if (ALLOWED_APEX_ORIGINS.includes(normalized)) return true;
  if (url.origin === "https://otofine.com" || url.origin === "https://www.otofine.com") {
    return true;
  }

  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "otofine.com" || host === "www.otofine.com") return true;
  if (!host.endsWith(PLATFORM_SUFFIX)) return false;

  const label = host.slice(0, -PLATFORM_SUFFIX.length);
  if (!label || label.includes(".")) return false;
  if (!SUBDOMAIN_LABEL_REGEX.test(label)) return false;

  return true;
}

/**
 * Express cors `origin` callback helper.
 * @param {string|undefined} origin
 * @param {string[]} staticAllowlist exact-match dev/extra origins
 */
export function resolveCorsOrigin(origin, staticAllowlist = []) {
  if (!origin) return true;
  if (staticAllowlist.includes(origin)) return true;
  return isAllowedOtofineBrowserOrigin(origin);
}
