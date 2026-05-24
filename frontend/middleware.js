import { NextResponse } from "next/server";
import { resolveShopRewrite } from "@/lib/shopHost";

/**
 * Two responsibilities, both intentionally tiny:
 *
 *   1. Preserve the legacy `/product` (no id) → `/` redirect so that
 *      `app/[slug]` doesn't accidentally render product-less landings.
 *
 *   2. Host-aware rewrite for the public shop site:
 *
 *        https://cuahangoto355.otofine.com/           → /shops/cuahangoto355
 *        https://cuahangoto355.otofine.com/san-pham   → /shops/cuahangoto355/san-pham
 *        https://cuahangoto355.otofine.com/gioi-thieu → /shops/cuahangoto355/gioi-thieu
 *        https://cuahangoto355.otofine.com/lien-he    → /shops/cuahangoto355/lien-he
 *
 *      The browser URL stays on the subdomain (NextResponse.rewrite,
 *      NOT redirect). All other paths on the subdomain — product
 *      detail, _next assets, fetch calls, etc. — pass through
 *      untouched so existing apex behaviour keeps working.
 *
 * Both safety nets:
 *   - PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false → middleware is a no-op
 *     for subdomain logic (the /product redirect still runs).
 *   - Reserved labels (www, api, admin, rfq, shop, …) → no rewrite.
 *   - Invalid slug shapes → no rewrite.
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

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname === "/product" || pathname === "/product/") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!SHOPSITE_SUBDOMAIN_FLAG) {
    return NextResponse.next();
  }

  const host = request.headers.get("host") || "";
  const decision = resolveShopRewrite({
    host,
    pathname,
    flagEnabled: true,
  });

  if (!decision) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = decision.internalPath;
  const res = NextResponse.rewrite(url);
  // Pin a header so downstream RSC / server components can recognise
  // they were entered via a subdomain (used for basePath generation).
  res.headers.set("x-otofine-shop-slug", decision.slug);
  return res;
}

export const config = {
  // Run on everything that is NOT an internal asset, API route, or
  // static file. Keep the negative lookahead narrow so we don't
  // accidentally start running middleware on `/_next/data`, image
  // optimization, etc. — that path is performance-sensitive.
  matcher: [
    "/((?!_next/|api/|favicon\\.ico|robots\\.txt|sitemap\\.xml|images/|uploads/|assets/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|js|css|map|woff|woff2|ttf|json)$).*)",
  ],
};
