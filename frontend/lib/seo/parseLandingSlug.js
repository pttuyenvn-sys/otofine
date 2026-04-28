import { API_BASE } from "@/lib/config";
import {
  slugifyVi,
  SEO_BASE_SLUG,
  categoryLandingSlugFromName,
} from "./slugify.js";

/** Tránh trùng với route hệ thống (segment đơn). */
export const RESERVED_SLUGS = new Set([
  "shop",
  "admin",
  "product",
  "api",
  "_next",
  "favicon",
  "favicon.svg",
  "robots",
  "robots.txt",
  "sitemap",
  "sitemap.xml",
]);

async function fetchJson(path) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

/**
 * @param {string} slug
 * @returns {Promise<{
 *   kind: 'vehicle' | 'category' | 'invalid',
 *   filters: { brand?: string, model?: string, year?: string, category?: string },
 *   h1: string,
 *   breadcrumb: { name: string, href: string }[],
 * }>}
 */
export async function parseLandingSlug(slug) {
  const base = { name: "Trang chủ", href: "/" };

  if (!slug || typeof slug !== "string") {
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  const s = slug.trim().toLowerCase();
  if (!s) {
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  /* --- Category: {name}-o-to (không dùng prefix phu-tung) --- */
  if (s.endsWith("-o-to") && !s.startsWith(SEO_BASE_SLUG)) {
    const categories = await fetchJson("/filter/categories");
    const list = Array.isArray(categories) ? categories : [];
    for (const rawName of list) {
      const name = String(rawName || "").trim();
      if (!name) continue;
      if (categoryLandingSlugFromName(name) === s) {
        const h1 = `${name} ô tô`;
        return {
          kind: "category",
          filters: { category: name },
          h1,
          breadcrumb: [
            base,
            { name: "Phụ tùng ô tô", href: `/${SEO_BASE_SLUG}` },
            { name: h1, href: `/${s}` },
          ],
        };
      }
    }
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  /* --- Vehicle / base: phu-tung-o-to ... --- */
  if (s === SEO_BASE_SLUG) {
    const h1 = "Phụ tùng ô tô";
    return {
      kind: "vehicle",
      filters: {},
      h1,
      breadcrumb: [base, { name: h1, href: `/${SEO_BASE_SLUG}` }],
    };
  }

  if (!s.startsWith(`${SEO_BASE_SLUG}-`)) {
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  let rest = s.slice(SEO_BASE_SLUG.length + 1);
  if (!rest) {
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  let tokens = rest.split("-").filter(Boolean);

  let year = null;
  if (tokens.length && /^(19|20)\d{2}$/.test(tokens[tokens.length - 1])) {
    year = tokens.pop();
  }

  const brands = await fetchJson("/filter/brands");
  const brandRows = Array.isArray(brands) ? brands : [];

  const brandCandidates = brandRows
    .map((b) => {
      const name = b.hang_xe;
      const tks = slugifyVi(name).split("-").filter(Boolean);
      return { name, tokens: tks, key: tks.join("-") };
    })
    .filter((b) => b.key.length)
    .sort((a, b) => b.tokens.length - a.tokens.length);

  let matchedBrand = null;
  for (const b of brandCandidates) {
    if (tokens.length < b.tokens.length) continue;
    const head = tokens.slice(0, b.tokens.length).join("-");
    if (head === b.key) {
      matchedBrand = b.name;
      tokens = tokens.slice(b.tokens.length);
      break;
    }
  }

  if (!matchedBrand) {
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  const filters = { brand: matchedBrand };

  let matchedModel = null;
  if (tokens.length) {
    const models = await fetchJson(
      `/filter/models?brand=${encodeURIComponent(matchedBrand)}`,
    );
    const modelRows = Array.isArray(models) ? models : [];

    const modelCandidates = modelRows
      .map((m) => {
        const name = m.ten_xe;
        const tks = slugifyVi(name).split("-").filter(Boolean);
        return { name, tokens: tks, key: tks.join("-") };
      })
      .filter((m) => m.key.length)
      .sort((a, b) => b.tokens.length - a.tokens.length);

    for (const m of modelCandidates) {
      if (tokens.length < m.tokens.length) continue;
      const head = tokens.slice(0, m.tokens.length).join("-");
      if (head === m.key) {
        matchedModel = m.name;
        tokens = tokens.slice(m.tokens.length);
        break;
      }
    }

    if (tokens.length > 0) {
      return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
    }

    if (matchedModel) filters.model = matchedModel;
  }

  if (year) filters.year = year;

  let h1 = "Phụ tùng ô tô";
  h1 += ` ${matchedBrand}`;
  if (matchedModel) h1 += ` ${matchedModel}`;
  if (year) h1 += ` ${year}`;

  const bc = [
    base,
    { name: "Phụ tùng ô tô", href: `/${SEO_BASE_SLUG}` },
    {
      name: matchedBrand,
      href: `/${SEO_BASE_SLUG}-${slugifyVi(matchedBrand)}`,
    },
  ];
  if (matchedModel) {
    bc.push({
      name: matchedModel,
      href: `/${SEO_BASE_SLUG}-${slugifyVi(matchedBrand)}-${slugifyVi(matchedModel)}`,
    });
  }
  if (year) {
    bc.push({ name: String(year), href: `/${s}` });
  }

  return {
    kind: "vehicle",
    filters,
    h1,
    breadcrumb: bc,
  };
}
