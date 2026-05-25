import { NextResponse } from "next/server";
import {
  HOST_DECISIONS,
  classifyHost,
  getShopAllowlist,
  resolveShopRewrite,
} from "@/lib/shopHost";

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
 * Phase 4.5 additions (safety / observability, NOT behavioural):
 *   - Host classification is centralized in `lib/shopHost.classifyHost`.
 *   - Edge logs every interesting decision with `[shopsite]` prefix:
 *       event=middleware.rewrite slug=...
 *       event=middleware.reserved-subdomain sub=...
 *       event=middleware.invalid-subdomain ...
 *       event=middleware.unknown-shop slug=...   (later, page-layer)
 *   - Hard caps on host length / charset reject Host-header poisoning
 *     probes before we even look up routes.
 *
 * Both safety nets remain:
 *   - PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false → middleware is a no-op
 *     for subdomain logic (the /product redirect still runs).
 *   - Reserved labels (www, api, admin, rfq, shop, …) → no rewrite.
 *   - Invalid slug shapes / multi-level subdomains → no rewrite.
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

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname === "/product" || pathname === "/product/") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!SHOPSITE_SUBDOMAIN_FLAG) {
    return NextResponse.next();
  }

  const host = request.headers.get("host") || "";

  // Emit a single classification line for every host we see (sampled
  // by the LOG-only nature of the decision; no behavioural cost). This
  // gives us a clear picture of unknown-subdomain hit rate in prod.
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

  const decision = resolveShopRewrite({
    host,
    pathname,
    flagEnabled: true,
  });

  if (!decision) {
    return NextResponse.next();
  }

  // Phase 6A — staged rollout allowlist. A `blocked` sentinel means
  // the host parsed cleanly into a slug, but the slug is not on the
  // current allowlist (PUBLIC_SHOPSITE_ALLOWED_SLUGS). Log the event
  // and fall through to apex routing — the request still resolves
  // (e.g. via apex `/shops/<slug>` if the visitor knows that URL),
  // but the subdomain is invisible to them.
  if (decision.blocked === "not-allowlisted") {
    logEdge("middleware.allowlist-skip", {
      slug: decision.slug,
      path: pathname,
    });
    return NextResponse.next();
  }

  logEdge("middleware.rewrite", {
    slug: decision.slug,
    path: pathname,
  });

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
