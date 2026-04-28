import { API_BASE } from "@/lib/config";
import { buildVehicleSlug } from "@/lib/seo/buildVehicleSlug";
import { getSiteUrl } from "@/lib/seo/siteUrl";
import { SEO_BASE_SLUG, categoryLandingSlugFromName } from "@/lib/seo/slugify";

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
    if (!p?.slug) continue;
    add(`${base}/product/${encodeURIComponent(p.slug)}`, {
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

  return out;
}
