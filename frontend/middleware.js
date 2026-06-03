import { NextResponse } from "next/server";
import {
  classifyShopSubdomainHost,
  resolveSubdomainInternalRewrite,
} from "@/lib/shopHost";

/**
 * Edge middleware — Phase 6B.3a internal subdomain rewrite.
 *
 *   https://phutungtoyota.otofine.com/  → rewrite → /shops/phutungtoyota
 *
 * Uses NextResponse.rewrite only (no redirects). Invalid tenant slugs on
 * *.otofine.com rewrite to /404 (loop-safe). Reserved labels (www, api,
 * admin, …) and apex localhost pass through untouched.
 *
 * Rollback: PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false
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

function logEdge(event, fields) {
  const parts = [`event=${event}`];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined || v === null) continue;
    const s = String(v);
    parts.push(/[\s="]/.test(s) ? `${k}="${s.replace(/"/g, "")}"` : `${k}=${s}`);
  }
  console.info(`[shopsite] ${parts.join(" ")}`);
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname === "/product" || pathname === "/product/") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const attachPathname = (response) => {
    response.headers.set("x-otofine-pathname", pathname);
    return response;
  };

  if (!SHOPSITE_SUBDOMAIN_FLAG) {
    return attachPathname(NextResponse.next());
  }

  const host = request.headers.get("host") || "";
  const hostCls = classifyShopSubdomainHost(host);

  if (hostCls.kind === "ignored") {
    logEdge("middleware.reserved-subdomain", { sub: hostCls.label });
    return attachPathname(NextResponse.next());
  }
  if (hostCls.kind === "invalid") {
    logEdge("middleware.invalid-subdomain", { sub: hostCls.label ?? "-" });
  }

  const decision = resolveSubdomainInternalRewrite({
    host,
    pathname,
    flagEnabled: true,
  });

  if (!decision) {
    return attachPathname(NextResponse.next());
  }

  const url = request.nextUrl.clone();
  url.pathname = decision.internalPath;

  if (decision.invalid) {
    logEdge("middleware.rewrite-404", {
      sub: decision.slug ?? "-",
      path: pathname,
    });
    return attachPathname(NextResponse.rewrite(url));
  }

  logEdge("middleware.rewrite", {
    slug: decision.slug,
    path: pathname,
    internal: decision.internalPath,
  });

  const res = NextResponse.rewrite(url);
  res.headers.set("x-otofine-shop-slug", decision.slug);
  res.headers.set("x-otofine-pathname", pathname);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/|api/|favicon\\.ico|robots\\.txt|sitemap\\.xml|static/|images/|uploads/|assets/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|js|css|map|woff|woff2|ttf|json)$).*)",
  ],
};
