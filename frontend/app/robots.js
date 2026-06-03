import { getSiteUrl } from "@/lib/seo/siteUrl";

export default function robots() {
  const base = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: ["/",
        "/phu-tung-",
      ],
      disallow: [
        "/xe/",
        "/rfq/",
        // Legacy `/product/<id>` URLs are kept disallowed (pre-
        // migration policy). The redirect-only page still answers
        // direct browser nav from external backlinks, but crawlers
        // discover products through the sitemap `/p/<id>` entries
        // that resolve to the root canonical in a single 308 hop.
        //
        // Storefront tab pages (`{slug}.otofine.com`) are listed in
        // `/sitemap.xml` with subdomain canonical URLs (Phase 6B.5).
        // Apex `/shops/{slug}` remains reachable but is not sitemapped;
        // metadata canonical + optional slug-history 308 handle dedup.
        //
        // `/phu-tung/` and `/p/` are NOT disallowed: those redirect-
        // only namespaces need to remain crawlable so Googlebot can
        // (a) follow the 308 from sitemap `/p/<id>` entries to the
        // canonical, and (b) pass link-equity from legacy
        // `/phu-tung/<slug>-<id>` backlinks through to the new
        // canonical via the redirect.
        "/product/",
        "/shop/",
        "/admin/",
        "/api/",
        "/search/",
        "/*?q=*",
        "/*?pagenumber=*",
        "/*?*",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}