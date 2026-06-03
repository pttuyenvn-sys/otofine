import { findPublicShopBySlug } from "../repositories/shopPublic.repository.js";
import {
  countPublicShopsForDirectory,
  listPublicShopsForDirectory,
  listPublicShopBrands,
  listPublicShopProvinces,
  listRelatedShops,
  DIRECTORY_SORTS,
  PRODUCT_TIERS,
} from "../repositories/shopDirectory.repository.js";
import { rankShop, RANK_MAX_SCORE } from "../ranking/shopRanking.js";

const DEFAULT_PER_PAGE = 12;
const MAX_PER_PAGE = 48;

/**
 * Convert a single enriched shop row into the directory-card DTO.
 *
 * Cards are intentionally small. We do NOT include the full intro
 * HTML, address detail, or working hours — those live on the
 * storefront. The directory's job is to convince a buyer to click
 * through; once they do, the full SSR storefront takes over.
 */
export function toShopCardDto(row, rank = null) {
  const intro = (row.bio || stripHtml(row.intro_html) || stripHtml(row.descriptionHtml) || "")
    .toString()
    .trim();
  const shortIntro = intro.length > 160 ? `${intro.slice(0, 159)}…` : intro;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatar: row.avatar || null,
    cover: row.cover || null,
    verified: !!row.verified_at,
    province: row.province || null,
    provinceSlug: row.provinceSlug || null,
    productCount: Number(row.productCount) || 0,
    topBrands: (row.topBrands || []).map((b) => ({
      brand: b.brand,
      productCount: Number(b.productCount) || 0,
    })),
    shortIntro: shortIntro || null,
    rank: rank
      ? {
          score: rank.score,
          max: rank.max,
          breakdown: rank.breakdown,
        }
      : null,
    // Phase 5.1 trust signals — same shape as `shopPublic.service.toPublicDto.trust`
    // so client components can stay agnostic about how they got the card.
    trust: {
      verified: !!row.verified_at,
      hasPhone: nonEmpty(row.phone),
      hasZalo: nonEmpty(row.zalo),
      hasFacebook: nonEmpty(row.facebook_url),
    },
  };
}

function nonEmpty(v) {
  if (v == null) return false;
  return String(v).trim().length > 0;
}

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Public directory query.
 *
 * Returns `{ items, total, page, perPage, sort, filters }`.
 * `items` is ordered + paginated; `total` is the unpaged count so
 * the frontend can render "X shops total".
 *
 * The ranking score is computed in-process per request so a change
 * to the formula deploys without a cache flush.
 */
export async function getPublicShopDirectory(input = {}) {
  const filters = sanitizeFilters(input);
  const page = sanitizePage(input.page);
  const perPage = sanitizePerPage(input.perPage);
  const sort = sanitizeSort(input.sort);

  const [rows, total] = await Promise.all([
    listPublicShopsForDirectory(filters),
    countPublicShopsForDirectory(filters),
  ]);

  // Rank-then-sort in JS so we can keep the ranking formula in one
  // place and let SQL focus on what it's good at (filtering + joins).
  const ranked = rows.map((row) => ({ row, rank: rankShop(row) }));

  if (sort === "rank") {
    ranked.sort((a, b) => {
      if (b.rank.score !== a.rank.score) return b.rank.score - a.rank.score;
      return Number(a.row.id) - Number(b.row.id);
    });
  } else if (sort === "newest") {
    ranked.sort((a, b) => {
      const ta = new Date(a.row.published_at || a.row.createdAt || 0).getTime();
      const tb = new Date(b.row.published_at || b.row.createdAt || 0).getTime();
      if (tb !== ta) return tb - ta;
      return Number(a.row.id) - Number(b.row.id);
    });
  } else {
    // name (a-z, Vietnamese locale)
    ranked.sort((a, b) => {
      const cmp = String(a.row.name || "").localeCompare(String(b.row.name || ""), "vi");
      if (cmp !== 0) return cmp;
      return Number(a.row.id) - Number(b.row.id);
    });
  }

  const sliceStart = (page - 1) * perPage;
  const sliceEnd = sliceStart + perPage;
  const items = ranked
    .slice(sliceStart, sliceEnd)
    .map(({ row, rank }) => toShopCardDto(row, rank));

  return {
    items,
    total,
    page,
    perPage,
    sort,
    rankMax: RANK_MAX_SCORE,
    filters: {
      q: filters.q || null,
      brand: filters.brand || null,
      provinceSlug: filters.provinceSlug || null,
      verified: filters.verified || false,
      minProducts: filters.minProducts || 0,
    },
  };
}

/**
 * Facet helpers — returned as separate endpoints so the directory
 * page can populate dropdowns without re-running the heavy join.
 */
export async function getPublicShopDirectoryProvinces() {
  return listPublicShopProvinces();
}

export async function getPublicShopDirectoryBrands() {
  return listPublicShopBrands();
}

/**
 * Related shops for a given slug. Returns DTOs identical in shape
 * to the directory cards so the storefront's "Shop tương tự" block
 * reuses the same ShopCard component.
 */
export async function getRelatedShopsBySlug(slug, { limit = 6 } = {}) {
  const seedRow = await findPublicShopBySlug(slug);
  if (!seedRow) return null; // 404 on unknown shop, like other endpoints
  const rows = await listRelatedShops({ shopId: seedRow.id, limit });
  return {
    seedSlug: slug,
    items: rows.map((row) => toShopCardDto(row, rankShop(row))),
  };
}

/** ---------------- input sanitisation ---------------- */

function sanitizeFilters(input) {
  const out = {};
  if (typeof input.q === "string" && input.q.trim()) {
    out.q = input.q.trim().slice(0, 60);
  }
  if (typeof input.brand === "string" && input.brand.trim()) {
    out.brand = input.brand.trim().slice(0, 60);
  }
  if (typeof input.provinceSlug === "string" && input.provinceSlug.trim()) {
    out.provinceSlug = input.provinceSlug.trim().toLowerCase().slice(0, 60);
  }
  // Accept booleans, "true"/"1", "false"/"0"
  if (input.verified !== undefined && input.verified !== null && input.verified !== "") {
    const raw = String(input.verified).toLowerCase();
    out.verified = raw === "true" || raw === "1" || raw === "yes";
  }
  // Tier name OR raw integer
  if (input.tier && typeof input.tier === "string" && PRODUCT_TIERS[input.tier] !== undefined) {
    out.minProducts = PRODUCT_TIERS[input.tier];
  } else if (Number.isFinite(Number(input.minProducts)) && Number(input.minProducts) > 0) {
    out.minProducts = Math.min(1000, Math.floor(Number(input.minProducts)));
  }
  return out;
}

function sanitizePage(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0 && n <= 500) return Math.floor(n);
  return 1;
}

function sanitizePerPage(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0 && n <= MAX_PER_PAGE) return Math.floor(n);
  return DEFAULT_PER_PAGE;
}

function sanitizeSort(raw) {
  if (typeof raw !== "string") return "rank";
  const s = raw.toLowerCase();
  return DIRECTORY_SORTS.includes(s) ? s : "rank";
}
