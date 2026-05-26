const DEFAULT_SHOP_LOGIN_DEST = "/shop/settings";

const ALLOWED_PREFIXES = [
  "/rfq/shop/",
  "/shop/settings",
  "/shop/products",
  "/shop/add-product",
];

function isAllowedShopReturnPath(pathOnly) {
  return ALLOWED_PREFIXES.some((prefix) => {
    const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return pathOnly === prefix.replace(/\/$/, "") || pathOnly.startsWith(normalized) || pathOnly === prefix;
  });
}

/**
 * Validate an internal shop return path — rejects external and open redirects.
 */
export function getSafeShopReturnPath(raw, fallback = DEFAULT_SHOP_LOGIN_DEST) {
  if (!raw || typeof raw !== "string") return fallback;

  let path = raw.trim();
  if (!path) return fallback;

  if (path.startsWith("//")) return fallback;

  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (typeof window !== "undefined" && url.origin !== window.location.origin) {
        return fallback;
      }
      path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }

  if (!path.startsWith("/") || path.includes("\\")) return fallback;

  const pathOnly = path.split(/[?#]/)[0];
  if (pathOnly.startsWith("/shop/login") || pathOnly.startsWith("/shop/register")) {
    return fallback;
  }

  if (!isAllowedShopReturnPath(pathOnly)) return fallback;

  return path;
}

export function getCurrentShopReturnPath() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function buildShopLoginUrl(returnPath) {
  const candidate = returnPath || getCurrentShopReturnPath();
  const safe = getSafeShopReturnPath(candidate, "");
  if (!safe) return "/shop/login";
  return `/shop/login?returnTo=${encodeURIComponent(safe)}`;
}

export function getShopLoginDestinationFromSearch(search = "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("returnTo") || params.get("redirect");
  return getSafeShopReturnPath(raw);
}

export { DEFAULT_SHOP_LOGIN_DEST };
