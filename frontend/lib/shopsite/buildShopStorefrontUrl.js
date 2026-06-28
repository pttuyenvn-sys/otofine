/**
 * Build absolute storefront URLs on shop subdomains.
 *
 * Production: https://{slug}.otofine.com/
 * Local dev:  http://{slug}.localhost:{port}/
 *
 * Mirrors the suffixes accepted by `lib/shopHost.classifyHost`.
 */

const DEFAULT_SUFFIX = "otofine.com";

function normalizeSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  return s || null;
}

/**
 * @param {Pick<Location, "hostname" | "port" | "protocol"> | null | undefined} location
 */
export function resolveShopSubdomainContext(location) {
  const envSuffix = (process.env.NEXT_PUBLIC_SHOP_SUBDOMAIN_SUFFIX || "")
    .trim()
    .replace(/^\./, "");

  const hostname = String(location?.hostname || "").toLowerCase();
  const port = location?.port || "";
  const protocol = location?.protocol || "https:";

  if (envSuffix) {
    const isLocal = envSuffix === "localhost" || envSuffix.endsWith(".localhost");
    return {
      suffix: envSuffix,
      protocol: isLocal ? "http:" : protocol === "http:" ? "http:" : "https:",
      port: isLocal ? port || "3000" : "",
    };
  }

  if (!location) {
    return { suffix: DEFAULT_SUFFIX, protocol: "https:", port: "" };
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1"
  ) {
    return { suffix: "localhost", protocol: "http:", port: port || "3000" };
  }

  if (hostname.endsWith(".lvh.me") || hostname === "lvh.me") {
    return { suffix: "lvh.me", protocol: "http:", port: port || "3000" };
  }

  if (hostname.endsWith(".nip.io")) {
    return { suffix: "nip.io", protocol: "http:", port: port || "" };
  }

  return { suffix: DEFAULT_SUFFIX, protocol: "https:", port: "" };
}

/**
 * @param {string} slug
 * @param {{ subPath?: string, location?: Pick<Location, "hostname" | "port" | "protocol"> | null }} [options]
 * @returns {string | null}
 */
export function buildShopStorefrontUrl(slug, options = {}) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;

  const rawSubPath = options.subPath
    ? String(options.subPath).replace(/^\/+/, "").replace(/\/+$/, "")
    : "";
  const path = rawSubPath ? `/${rawSubPath}` : "/";

  const location =
    options.location ??
    (typeof window !== "undefined" ? window.location : null);

  const ctx = resolveShopSubdomainContext(location);
  const portPart = ctx.port ? `:${ctx.port}` : "";

  return `${ctx.protocol}//${normalized}.${ctx.suffix}${portPart}${path}`;
}
