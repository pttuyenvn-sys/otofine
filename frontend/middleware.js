import { NextResponse } from "next/server";
import { handleEvcsHostRouting } from "@evcs/lib/evcsMiddleware";
import {
  HOST_DECISIONS,
  classifyHost,
  getWildcardStorefrontProbe,
  isShopSubdomainAllowed,
  resolveShopRewrite,
} from "@/lib/shopHost";
import { buildUnknownStorefrontResponse } from "@/lib/shopsite/buildUnknownStorefrontResponse";
import { resolveShopLifecycle } from "@/lib/shopsite/resolveShopLifecycle";
import { resolveShopSunsetRedirectUrl } from "@/lib/shopsite/resolveShopSunsetRedirectUrl";
import { SHOP_COLLECTION_PATH } from "@/lib/shopseo/namespace.js";
import {
  buildShopLegacyCollectionRedirectTarget,
  buildSubdomainLegacyCollectionRedirectUrl,
  isShopLegacyCollectionSubdomainPath,
  locationFromRequestUrl,
  parseShopLegacyCollectionApexPath,
} from "@/lib/shopsite/shopLegacyCollectionRedirect";

/**
 * Two responsibilities, both intentionally tiny:
 *
 *   1. Preserve the legacy `/product` (no id) → `/` redirect so that
 *      `app/[slug]` doesn't accidentally render product-less landings.
 *
 *   2. Host-aware rewrite for the public shop site:
 *
 *        https://cuahangoto355.otofine.com/           → /shops/cuahangoto355
 *        https://cuahangoto355.otofine.com/phu-tung-o-to → /shops/cuahangoto355/seo/phu-tung-o-to
 *        https://cuahangoto355.otofine.com/phu-tung-kia   → /shops/cuahangoto355/seo/phu-tung-kia
 *        https://cuahangoto355.otofine.com/sitemap.xml      → /shops/cuahangoto355/sitemap.xml
 *        https://cuahangoto355.otofine.com/gioi-thieu → /shops/cuahangoto355/gioi-thieu
 *        https://cuahangoto355.otofine.com/lien-he    → /shops/cuahangoto355/lien-he
 *
 *      The browser URL stays on the subdomain (NextResponse.rewrite,
 *      NOT redirect). All other paths on the subdomain — product
 *      detail, _next assets, fetch calls, etc. — pass through
 *      untouched so existing apex behaviour keeps working.
 *
 * ARCH-06.2C — wildcard host protection:
 *   Unknown / invalid `{slug}.otofine.com` hosts MUST NOT fall through
 *   to the marketplace homepage. They receive a hard 404 with
 *   `noindex,nofollow`. Only slugs that exist in the public shop API
 *   (`shops.slug` + `public_status = 'public'`) and pass the rollout
 *   allowlist may render storefront content.
 *
 * Both safety nets remain:
 *   - PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false → subdomain rewrite is a
 *     no-op, but wildcard protection still blocks unknown hosts.
 *   - Reserved labels (www, api, admin, rfq, shop, …) → no rewrite.
 *   - apex / localhost / *.vercel.app → no rewrite.
 *
 * Rollback: flip the env flag to false and restart the Next process.
 * No code change required.
 */

const FLAG_RAW = String(
  process.env.PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED ?? "",
)
  .trim()
  .toLowerCase();

const SHOPSITE_SUBDOMAIN_FLAG =
  FLAG_RAW === "1" ||
  FLAG_RAW === "true" ||
  FLAG_RAW === "yes" ||
  FLAG_RAW === "on";

const SUNSET_FLAG_RAW = String(
  process.env.SHOP_SUNSET_REDIRECT_ENABLED ?? "true",
)
  .trim()
  .toLowerCase();

const SHOP_SUNSET_REDIRECT_ENABLED =
  SUNSET_FLAG_RAW !== "0" &&
  SUNSET_FLAG_RAW !== "false" &&
  SUNSET_FLAG_RAW !== "off" &&
  SUNSET_FLAG_RAW !== "no";

/**
 * Lightweight structured logger for the edge. `console.info` is the
 * only side-effect API guaranteed to work across both Edge and Node
 * runtimes for Next.js middleware. NEVER includes IPs or headers.
 */
function logEdge(event, fields) {
  const parts = [`event=${event}`];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined || v === null) continue;
    const s = String(v);
    parts.push(/[\s="]/.test(s) ? `${k}="${s.replace(/"/g, "")}"` : `${k}=${s}`);
  }
  console.info(`[shopsite] ${parts.join(" ")}`);
}

/**
 * Block unregistered wildcard storefront hosts before they reach the
 * marketplace homepage router. Closed shops with redirectEligible receive
 * taxonomy + product 301s to absolute apex URLs.
 *
 * @returns {Promise<NextResponse | null>} 404/301 when handled, null when allowed.
 */
async function guardWildcardStorefrontHost(host, request) {
  const probe = getWildcardStorefrontProbe(host);
  if (!probe) return null;

  if (probe.invalid) {
    logEdge("middleware.blocked-wildcard", {
      slug: probe.slug ?? "-",
      reason: probe.reason,
    });
    return buildUnknownStorefrontResponse();
  }

  const slug = probe.slug;
  if (!slug) {
    logEdge("middleware.blocked-wildcard", { slug: "-", reason: "missing-slug" });
    return buildUnknownStorefrontResponse();
  }

  const lifecycle = await resolveShopLifecycle(slug);

  if (!lifecycle.exists) {
    logEdge("middleware.unknown-shop", { slug, reason: "not-found" });
    return buildUnknownStorefrontResponse();
  }

  if (lifecycle.publicStatus === "public") {
    if (!isShopSubdomainAllowed(slug)) {
      logEdge("middleware.blocked-wildcard", { slug, reason: "rollout-pending" });
      return buildUnknownStorefrontResponse();
    }
    return null;
  }

  if (
    SHOP_SUNSET_REDIRECT_ENABLED &&
    lifecycle.redirectEligible
  ) {
    const target = await resolveShopSunsetRedirectUrl(request.nextUrl);
    if (target) {
      logEdge("middleware.sunset-redirect", {
        slug,
        from: request.nextUrl.pathname,
        to: target.toString(),
      });
      return NextResponse.redirect(target, 301);
    }
    logEdge("middleware.unknown-shop", {
      slug,
      reason: "closed-unhandled-path",
      path: request.nextUrl.pathname,
    });
    return buildUnknownStorefrontResponse();
  }

  logEdge("middleware.unknown-shop", {
    slug,
    reason: lifecycle.publicStatus || "not-public",
  });
  return buildUnknownStorefrontResponse();
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname === "/product" || pathname === "/product/") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const host = request.headers.get("host") || "";

  /** EVCS host rewrite — before shop wildcard (tramsacvinfast.otofine.com → /evcs/*). */
  const evcsResponse = handleEvcsHostRouting(host, request);
  if (evcsResponse) return evcsResponse;

  const cls = classifyHost(host);
  switch (cls.decision) {
    case HOST_DECISIONS.RESERVED_SUBDOMAIN:
      logEdge("middleware.reserved-subdomain", { sub: cls.slug });
      break;
    case HOST_DECISIONS.INVALID_SUBDOMAIN:
      logEdge("middleware.invalid-subdomain", { sub: cls.slug ?? "-" });
      break;
    case HOST_DECISIONS.MULTI_LEVEL:
      logEdge("middleware.multi-level-host", { suffix: cls.suffix });
      break;
    case HOST_DECISIONS.HOST_TOO_LONG:
      logEdge("middleware.host-too-long", {});
      break;
    case HOST_DECISIONS.HOST_INVALID_CHARS:
      logEdge("middleware.host-invalid-chars", {});
      break;
    default:
      break;
  }

  const blocked = await guardWildcardStorefrontHost(host, request);
  if (blocked) return blocked;

  // SHOP-SEO-LEGACY-02 — 301 legacy collection before SEO rewrite.
  const apexLegacySlug = parseShopLegacyCollectionApexPath(pathname);
  if (apexLegacySlug) {
    if (process.env.NODE_ENV === "development") {
      logEdge("middleware.legacy-collection-redirect", {
        slug: apexLegacySlug,
        surface: "apex",
        from: pathname,
        to: SHOP_COLLECTION_PATH,
      });
    }
    const target = buildShopLegacyCollectionRedirectTarget(apexLegacySlug, {
      location: locationFromRequestUrl(request.nextUrl),
      search: request.nextUrl.search,
    });
    if (target) {
      return NextResponse.redirect(target, 301);
    }
  }

  const clsLegacy = classifyHost(host);
  if (
    clsLegacy.decision === HOST_DECISIONS.REWRITE_OK &&
    isShopSubdomainAllowed(clsLegacy.slug) &&
    isShopLegacyCollectionSubdomainPath(pathname)
  ) {
    if (process.env.NODE_ENV === "development") {
      logEdge("middleware.legacy-collection-redirect", {
        slug: clsLegacy.slug,
        surface: "subdomain",
        from: pathname,
        to: SHOP_COLLECTION_PATH,
      });
    }
    const target = buildSubdomainLegacyCollectionRedirectUrl(request.nextUrl);
    return NextResponse.redirect(target, 301);
  }

  if (pathname === "/sitemap.xml" || pathname === "/sitemap.xml/") {
    const cls = classifyHost(host);
    if (
      cls.decision === HOST_DECISIONS.REWRITE_OK &&
      isShopSubdomainAllowed(cls.slug)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/shops/${cls.slug}/sitemap.xml`;
      const res = NextResponse.rewrite(url);
      res.headers.set("x-otofine-shop-slug", cls.slug);
      return res;
    }
    return NextResponse.next();
  }

  if (!SHOPSITE_SUBDOMAIN_FLAG) {
    return NextResponse.next();
  }

  const decision = resolveShopRewrite({
    host,
    pathname,
    flagEnabled: true,
  });

  if (!decision) {
    return NextResponse.next();
  }

  if (decision.blocked === "not-allowlisted") {
    logEdge("middleware.blocked-wildcard", {
      slug: decision.slug,
      reason: "not-allowlisted",
      path: pathname,
    });
    return buildUnknownStorefrontResponse();
  }

  logEdge("middleware.rewrite", {
    slug: decision.slug,
    path: pathname,
  });

  const url = request.nextUrl.clone();
  url.pathname = decision.internalPath;
  const res = NextResponse.rewrite(url);
  res.headers.set("x-otofine-shop-slug", decision.slug);
  return res;
}

export const config = {
  matcher: [
    "/sitemap.xml",
    "/((?!_next/|api/|favicon\\.ico|robots\\.txt|images/|uploads/|assets/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|js|css|map|woff|woff2|ttf|json)$).*)",
  ],
};
