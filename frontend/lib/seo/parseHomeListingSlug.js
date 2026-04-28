import { API_BASE } from "@/lib/config";
import { slugifyVi, SEO_BASE_SLUG } from "./slugify.js";
import { parseLandingSlug } from "./parseLandingSlug.js";
import { buildHomePageTitle, EMPTY_HOME_FILTERS } from "./homePageTitle.js";

/**
 * Slug path segment từ H1 (buildHomePageTitle rồi slugify) — sync với URL.
 * @param {string} title
 * @returns {string} rỗng nghĩa là trang gốc `/`
 */
export function homeListingPathFromTitle(title) {
  const t = (title || "").trim();
  if (!t || t === "Phụ tùng ô tô") return "";
  return slugifyVi(t);
}

/**
 * @param {typeof fetch} fetcher
 * @param {string} path
 */
async function fetchJsonForParse(fetcher, path) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetcher(url, { next: { revalidate: 120 } });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Parse phần sau category: "toyota-camry-2010" -> brand, model, year
 * (cùng thuật toán với parseLandingSlug cho phu-tung-o-to-...).
 */
export async function parseVehicleFiltersFromRest(
  restString,
  fetchJson = (u, o) => fetch(u, o),
) {
  const s = (restString || "").trim();
  if (!s) return { ...EMPTY_HOME_FILTERS };
  let tokens = s.split("-").filter(Boolean);
  if (!tokens.length) return { ...EMPTY_HOME_FILTERS };

  let year = "";
  if (tokens.length && /^(19|20)\d{2}$/.test(tokens[tokens.length - 1])) {
    year = String(tokens.pop());
  }

  const brandRows = (await fetchJsonForParse(
    fetchJson,
    "/filter/brands",
  ).catch(() => null)) || [];
  const list = Array.isArray(brandRows) ? brandRows : [];

  const brandCandidates = list
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

  if (!matchedBrand) return null;

  const filters = {
    ...EMPTY_HOME_FILTERS,
    brand: matchedBrand,
    model: "",
    year: year || "",
  };

  if (tokens.length) {
    const modelRows =
      (await fetchJsonForParse(
        fetchJson,
        `/filter/models?brand=${encodeURIComponent(matchedBrand)}`,
      ).catch(() => null)) || [];
    const mlist = Array.isArray(modelRows) ? modelRows : [];
    const modelCandidates = mlist
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
        filters.model = m.name;
        tokens = tokens.slice(m.tokens.length);
        break;
      }
    }
    if (tokens.length > 0) return null;
  }

  return filters;
}

/**
 * @param {string} pageTitle — H1 từ buildHomePageTitle
 * @param {{ q?: string, page?: number }} [opts]
 * @returns {string} path + query (bắt đầu bằng /)
 */
export function buildHomeListingUrl(pageTitle, opts) {
  const t = (pageTitle || "").trim();
  const seg = homeListingPathFromTitle(t);
  const path = seg ? `/${seg}` : "/";
  const q = new URLSearchParams();
  const kw = (opts?.q || "").trim();
  if (kw) q.set("q", kw);
  const p = Math.max(1, Number(opts?.page) || 1);
  if (p > 1) q.set("page", String(p));
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * @returns {Promise<{
 *   selectedCategory: string,
 *   filters: typeof EMPTY_HOME_FILTERS
 * } | null>}
 */
export async function parseHomeListingStateFromSlug(
  rawSlug,
  fetchImpl = (u, o) => fetch(u, o),
) {
  const s = (rawSlug || "").toLowerCase().trim();
  if (!s) return null;

  if (s === SEO_BASE_SLUG) {
    return { selectedCategory: "", filters: { ...EMPTY_HOME_FILTERS } };
  }

  if (s.startsWith(`${SEO_BASE_SLUG}-`)) {
    const rest = s.slice(SEO_BASE_SLUG.length + 1);
    if (!rest) return null;
    const v = await parseVehicleFiltersFromRest(rest, fetchImpl);
    if (v) {
      return { selectedCategory: "", filters: v };
    }
    return null;
  }

  const categories =
    (await fetchJsonForParse(fetchImpl, "/filter/categories").catch(
      () => null,
    )) || [];
  const catList = Array.isArray(categories) ? categories : [];
  const names = [...catList]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const sortedBySlugLen = [...names].sort(
    (a, b) => slugifyVi(b).length - slugifyVi(a).length,
  );

  for (const name of sortedBySlugLen) {
    const oto = slugifyVi(`${name} ô tô`);
    if (s === oto) {
      return { selectedCategory: name, filters: { ...EMPTY_HOME_FILTERS } };
    }
  }

  for (const name of sortedBySlugLen) {
    const p = slugifyVi(name);
    if (!p) continue;
    const oto = slugifyVi(`${name} ô tô`);
    if (!s.startsWith(`${p}-`) || s === oto) continue;
    const rest = s.slice(p.length + 1);
    const v = await parseVehicleFiltersFromRest(rest, fetchImpl);
    if (v) {
      return { selectedCategory: name, filters: v };
    }
  }

  const legacy = await parseLandingSlug(s);
  if (legacy?.kind === "category" && legacy.filters?.category) {
    return {
      selectedCategory: String(legacy.filters.category),
      filters: { ...EMPTY_HOME_FILTERS },
    };
  }
  if (legacy?.kind === "vehicle" && legacy.filters?.brand) {
    return {
      selectedCategory: "",
      filters: {
        ...EMPTY_HOME_FILTERS,
        brand: legacy.filters.brand || "",
        model: legacy.filters.model || "",
        year: legacy.filters.year ? String(legacy.filters.year) : "",
      },
    };
  }

  return null;
}

/**
 * Xác minh slug khớp H1 từ state (tránh URL lạ).
 */
export function homeSlugMatchesState(slug, selectedCategory, filters) {
  const title = buildHomePageTitle(selectedCategory, filters);
  const expect = homeListingPathFromTitle(title);
  if (!expect) return slug === "" || slug === "phu-tung-o-to";
  return expect === (slug || "").toLowerCase().trim();
}
