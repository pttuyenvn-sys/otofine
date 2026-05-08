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
  if (!t || t === "Phụ tùng ô tô" || t === "Phụ tùng ô tô chính hãng giá tốt") return "";
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
 * Generate URL from H1 only.
 * @param {string} h1
 * @param {{ q?: string, page?: number }} [opts]
 * @returns {string} path + query (bắt đầu bằng /)
 */
export function buildUrlFromH1(h1, opts) {
  const t = (h1 || "").trim();
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
 * @param {string} pageTitle — H1 từ buildHomePageTitle
 * @param {{ q?: string, page?: number }} [opts]
 * @returns {string} path + query (bắt đầu bằng /)
 * @deprecated Use buildUrlFromH1 instead
 */
export function buildHomeListingUrl(pageTitle, opts) {
  return buildUrlFromH1(pageTitle, opts);
}
