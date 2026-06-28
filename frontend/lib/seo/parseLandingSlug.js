import { API_BASE } from "@/lib/config";
import {
  slugifyVi,
  SEO_BASE_SLUG,
  categoryLandingSlugFromName,
} from "./slugify.js";
import {
  buildListingIdentity,
  buildPageTitle,
} from "@/components/pages/home/services/listingSeoState";
import listingUrlHelpers from "@/components/pages/home/services/listingUrlState";
import { parseVehicleYearSuffix } from "@/lib/seo/parseVehicleYearSuffix";
import { fetchProductCategoryRows } from "@/lib/seo/fetchProductCategoryCatalog.server";

const { buildListingUrlFromIdentity } = listingUrlHelpers;

const CATEGORY_NAME_OVERRIDES = {
  "giam-xoc-truoc-phai": "Giảm Xóc Trước Phải",
};

function normalizeCategoryDisplayName(name) {
  const key = slugifyVi(name);
  return CATEGORY_NAME_OVERRIDES[key] || name;
}

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

async function fetchCategoryRows() {
  return fetchProductCategoryRows();
}

function categorySlugCandidates(raw) {
  const canonicalSlug = String(raw?.canonical_slug || "")
    .trim()
    .toLowerCase();
  const categorySlug = String(raw?.category_slug || "")
    .trim()
    .toLowerCase();
  const name = normalizeCategoryDisplayName(
    String(raw?.canonical_name || raw?.category_name || raw || "").trim(),
  );
  const nameSlug = categoryLandingSlugFromName(name);
  return [canonicalSlug, categorySlug, nameSlug].filter(Boolean);
}

function resolveCategoryName(raw) {
  return normalizeCategoryDisplayName(
    String(raw?.canonical_name || raw?.category_name || raw || "").trim(),
  );
}

async function resolveLocationNameFromSlug(locationSlug) {
  const rows = await fetchJson("/address/provinces");
  const list = Array.isArray(rows) ? rows : [];
  const target = String(locationSlug || "").trim().toLowerCase();
  if (!target) return "";
  const fallback = {
    "ha-noi": "Hà Nội",
    "tp-ho-chi-minh": "TP Hồ Chí Minh",
  };
  const hit = list.find((row) => {
    const db = String(row?.tinh_tp || "").trim();
    if (!db) return false;
    const plain = db.replace(/^TP\\s+/i, "").trim();
    const candidates = [slugifyVi(db), slugifyVi(plain)].filter(Boolean);
    return candidates.includes(target);
  });
  if (!hit) return fallback[target] || "";
  const raw = String(hit.tinh_tp || "").trim();
  if (!raw) return fallback[target] || "";
  if (target.startsWith("tp-")) return raw;
  if (/^TP\\s+/i.test(raw)) return raw.replace(/^TP\\s+/i, "").trim();
  return raw;
}

function listingOwnerPathFromState({ categoryName = "", brand = "", model = "", year = "", location = "" } = {}) {
  const identity = buildListingIdentity({
    categoryName,
    hasCategory: Boolean(String(categoryName || "").trim()),
    brand,
    model,
    year,
    location,
  });
  return buildListingUrlFromIdentity(identity);
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

  const taiIndex = s.lastIndexOf("-tai-");
  if (taiIndex > 0 && !s.startsWith(SEO_BASE_SLUG)) {
    const categorySlug = s.slice(0, taiIndex).trim();
    const locationSlug = s.slice(taiIndex + "-tai-".length).trim();
    if (categorySlug && locationSlug) {
      const locationName = await resolveLocationNameFromSlug(locationSlug);
      if (locationName) {
        const categories = await fetchCategoryRows();
        for (const raw of categories) {
          const name = resolveCategoryName(raw);
          if (!name) continue;
          const candidates = categorySlugCandidates(raw);
          const normalizedCandidates = new Set(
            candidates.flatMap((value) => [
              value,
              value.replace(/-o-to$/, ""),
            ]),
          );
          if (!normalizedCandidates.has(categorySlug)) continue;
          const h1 = buildPageTitle({
            categoryName: name,
            hasCategory: true,
            brand: "",
            model: "",
            year: "",
            location: locationName,
          });
          return {
            kind: "category",
            filters: { category: name, location: locationName },
            h1,
            breadcrumb: [
              base,
              { name: "Phụ tùng ô tô", href: "/" },
              {
                name: h1,
                href: listingOwnerPathFromState({
                  categoryName: name,
                  location: locationName,
                }),
              },
            ],
          };
        }
      }
    }
  }

  /* --- Category: {name}-o-to (không dùng prefix phu-tung) --- */
  if (s.endsWith("-o-to") && !s.startsWith(SEO_BASE_SLUG)) {
    const list = await fetchCategoryRows();
    for (const raw of list) {
      const name = resolveCategoryName(raw);
      if (!name) continue;
      const candidates = categorySlugCandidates(raw);
      if (!candidates.includes(s)) continue;
      const h1 = buildPageTitle({
        categoryName: name,
        hasCategory: true,
        brand: "",
        model: "",
        year: "",
        location: "",
      });
      return {
        kind: "category",
        filters: { category: name },
        h1,
        breadcrumb: [
          base,
          { name: "Phụ tùng ô tô", href: "/" },
          {
            name: h1,
            href: listingOwnerPathFromState({
              categoryName: name,
            }),
          },
        ],
      };
    }
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  /* --- Vehicle / base: phu-tung-o-to ... --- */
  if (s === SEO_BASE_SLUG) {
    const h1 = buildPageTitle({
      categoryName: "",
      hasCategory: false,
      brand: "",
      model: "",
      year: "",
      location: "",
    });
    return {
      kind: "vehicle",
      filters: {},
      h1,
      breadcrumb: [base, { name: h1, href: "/" }],
    };
  }

  const PART_VEHICLE_SLUG_PREFIX = "phu-tung-";
  let rest = "";
  if (s.startsWith(`${SEO_BASE_SLUG}-`)) {
    rest = s.slice(SEO_BASE_SLUG.length + 1);
  } else if (
    s.startsWith(PART_VEHICLE_SLUG_PREFIX) &&
    s !== SEO_BASE_SLUG
  ) {
    rest = s.slice(PART_VEHICLE_SLUG_PREFIX.length);
  } else {
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  if (!rest) {
    return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
  }

  // Strip `-tai-{location}` before brand/model/year parsing so year ranges
  // like `2014-2020` are not broken by `tai-ha-noi` tail tokens.
  let locationName = "";
  const vehicleTaiIdx = rest.lastIndexOf("-tai-");
  if (vehicleTaiIdx > 0) {
    const locationSlug = rest.slice(vehicleTaiIdx + "-tai-".length).trim();
    const resolvedLocation = await resolveLocationNameFromSlug(locationSlug);
    if (resolvedLocation) {
      locationName = resolvedLocation;
      rest = rest.slice(0, vehicleTaiIdx);
    }
  }

  if (rest.startsWith("tai-")) {
    const locationSlug = rest.slice("tai-".length).trim();
    const locationName = await resolveLocationNameFromSlug(locationSlug);
    if (!locationName) {
      return { kind: "invalid", filters: {}, h1: "", breadcrumb: [base] };
    }
    const h1 = buildPageTitle({
      categoryName: "",
      hasCategory: false,
      brand: "",
      model: "",
      year: "",
      location: locationName,
    });
    return {
      kind: "vehicle",
      filters: { location: locationName },
      h1,
      breadcrumb: [
        base,
        { name: "Phụ tùng ô tô", href: "/" },
        {
          name: `Tại ${locationName}`,
          href: listingOwnerPathFromState({
            location: locationName,
          }),
        },
      ],
    };
  }

  let tokens = rest.split("-").filter(Boolean);

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

  const { year, tokens: modelTokens } = parseVehicleYearSuffix(tokens);
  tokens = modelTokens;

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
  if (locationName) filters.location = locationName;

  const h1 = buildPageTitle({
    categoryName: "",
    hasCategory: false,
    brand: matchedBrand,
    model: matchedModel || "",
    year: year || "",
    location: locationName,
  });

  const bc = [
    base,
    { name: "Phụ tùng ô tô", href: "/" },
    {
      name: matchedBrand,
      href: listingOwnerPathFromState({
        brand: matchedBrand,
      }),
    },
  ];
  if (matchedModel) {
    bc.push({
      name: matchedModel,
      href: listingOwnerPathFromState({
        brand: matchedBrand,
        model: matchedModel,
      }),
    });
  }
  if (year) {
    bc.push({
      name: String(year),
      href: listingOwnerPathFromState({
        brand: matchedBrand,
        model: matchedModel || "",
        year: String(year),
      }),
    });
  }

  return {
    kind: "vehicle",
    filters,
    h1,
    breadcrumb: bc,
  };
}
