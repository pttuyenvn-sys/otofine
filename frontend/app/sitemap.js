import { API_BASE } from "@/lib/config";
import { buildVehicleSlug } from "@/lib/seo/buildVehicleSlug";
import { getSiteUrl } from "@/lib/seo/siteUrl";
import { SEO_BASE_SLUG, categoryLandingSlugFromName } from "@/lib/seo/slugify";
import { buildShopsiteSitemap } from "@/lib/shopsite/shopSitemapBuilder";

/**
 * Apex sitemap (`/sitemap.xml`) — dynamic, revalidated daily.
 *
 * Architecture:
 *   1. Static apex entries (homepage, SEO hub)
 *   2. Remote catalog from GET /api/seo/sitemap-data (products, vehicles,
 *      category landings) — all apex URLs
 *   3. Storefront tab pages from `storefronts[]` — subdomain canonical
 *      URLs only (`https://{slug}.otofine.com/...`)
 *
 * Storefront rows are pre-filtered server-side: public_status=public,
 * SEO-eligible (avatar/cover, intro, phone, ≥1 public product), valid
 * DNS slug, non-reserved label. Suspended/pending shops never appear.
 *
 * Product PDPs intentionally remain on apex — see shopSitemapBuilder.js.
 */
/** @type {import('next').MetadataRoute.Sitemap} */
export default async function sitemap() {
  const base = getSiteUrl();
  const now = new Date();
  const seen = new Set();
  /** @type {import('next').MetadataRoute.Sitemap} */
  const out = [];

  function add(url, opts = {}) {
    if (seen.has(url)) return;
    seen.add(url);
    out.push({
      url,
      lastModified: opts.lastModified || now,
      changeFrequency: opts.changeFrequency || "weekly",
      priority: opts.priority ?? 0.6,
    });
  }

  add(base, { changeFrequency: "daily", priority: 1 });
  add(`${base}/${SEO_BASE_SLUG}`, {
    changeFrequency: "daily",
    priority: 0.95,
  });

  let remote = {
    products: [],
    brandModels: [],
    partNames: [],
    storefronts: [],
  };

  try {
    const res = await fetch(`${API_BASE}/seo/sitemap-data`, {
      next: { revalidate: 86400 },
    });
    if (res.ok) remote = await res.json();
  } catch {
    /* build / offline */
  }

  for (const p of remote.products || []) {
    // The legacy sitemap-data endpoint emits a synthetic `slug` field
    // shaped like "sp-<id>" — there is no real slug column on the
    // products table. We strip the prefix to recover the numeric id
    // and emit the SHORT `/p/<id>` URL.
    //
    // /p/<id> is a stable redirect-only namespace (see app/p/[id]/
    // page.js) that 308-redirects in a SINGLE hop to the root-level
    // canonical `/<slug>-<id>`. Crawlers (Google, Bing, GPTBot)
    // follow the 308 and index ONLY the canonical destination —
    // zero duplicate-content risk.
    //
    // We deliberately do NOT emit the canonical URL directly here:
    // building it would require enriching the sitemap-data endpoint
    // with partName / brand / model / partNumber fields, which is
    // explicitly out-of-scope for this migration (no backend touch).
    // The redirect mechanism keeps the sitemap migration backend-
    // free while still giving search engines a complete catalog.
    const m = String(p?.slug || "").match(/(\d+)$/);
    const id = m ? Number(m[1]) : null;
    if (!Number.isFinite(id) || id <= 0) continue;
    add(`${base}/p/${id}`, {
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      priority: 0.75,
    });
  }

  const brandAdded = new Set();
  for (const bm of remote.brandModels || []) {
    const br = bm.brand;
    const mo = bm.model;
    if (!br || !mo) continue;

    add(`${base}/${buildVehicleSlug({ brand: br, model: mo })}`, {
      priority: 0.8,
    });

    const sb = buildVehicleSlug({ brand: br });
    if (!brandAdded.has(sb)) {
      brandAdded.add(sb);
      add(`${base}/${sb}`, { priority: 0.78 });
    }
  }

  for (const name of remote.partNames || []) {
    const slug = categoryLandingSlugFromName(name);
    if (slug) add(`${base}/${slug}`, { priority: 0.65 });
  }

  // Phase 6B.5 — subdomain storefront tabs (never apex /shops/{slug}).
  for (const entry of buildShopsiteSitemap(remote.storefronts || [])) {
    add(entry.url, {
      lastModified: entry.lastModified || now,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    });
  }

  return out;
}
