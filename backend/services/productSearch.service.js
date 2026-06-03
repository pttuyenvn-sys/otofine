import Typesense from "typesense";
import { pool } from "../config/db.js";
import * as productListRepo from "../repositories/productList.repository.js";
import * as cardRepo from "../repositories/productCard.repository.js";
import { normalizeText } from "../repositories/productList.repository.js";
import { stripHtml, formatVND } from "../utils/textFormat.js";
import { buildProductCardHighlights } from "../utils/productCardSubtitle.js";
import { legacySlugForId } from "../utils/productSlug.js";
import { sqlCategoryKeyFromPartName } from "../utils/categoryKey.js";
import { TYPESENSE_SEARCH_DEFAULTS as TS_DEF } from "../config/typesenseSearchDefaults.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause, isProductPubliclyVisible } from "../modules/products/services/productPublicVisibility.server.js";
import {
  cleanHttpQueryValue,
  normalizeListFilterYear,
  normalizePartNumber,
} from "../utils/listingQueryNormalize.js";
import { buildSameRowVehicleFitmentExistsSql } from "../utils/listingVehicleFitmentSql.js";
import { resolveKeywordListingPagination } from "../utils/listingKeywordPagination.js";
import {
  discoverKeywordProductIds,
  parseKeywordIntent,
} from "../utils/keywordSearchQuery.js";
import { stabilizeLegacyProductMediaUrl } from "../utils/legacyProductMediaUrl.util.js";

const COLLECTION =
  process.env.TYPESENSE_PRODUCT_COLLECTION || "otofine_products";

let client;

export function isTypesenseConfigured() {
  return Boolean(process.env.TYPESENSE_HOST && process.env.TYPESENSE_API_KEY);
}

export function getTypesenseClient() {
  if (!isTypesenseConfigured()) return null;
  if (!client) {
    client = new Typesense.Client({
      nodes: [
        {
          host: process.env.TYPESENSE_HOST,
          port: process.env.TYPESENSE_PORT || "8108",
          protocol: process.env.TYPESENSE_PROTOCOL || "http",
        },
      ],
      apiKey: process.env.TYPESENSE_API_KEY,
      connectionTimeoutSeconds: 8,
    });
  }
  return client;
}

export function getTypesenseCollectionName() {
  return COLLECTION;
}

/** Schema Typesense — dùng trong script sync. */
export function getProductCollectionSchema() {
  return {
    name: COLLECTION,
    enable_nested_fields: false,
    fields: [
      { name: "id", type: "string" },
      { name: "partNumber", type: "string", stem: false },
      { name: "partNumber_norm", type: "string", stem: false, optional: true },
      { name: "partName", type: "string", locale: "vi" },
      { name: "search_blob", type: "string", locale: "vi" },
      { name: "slug", type: "string", optional: true },
      { name: "category_norm", type: "string", facet: true, optional: true },
      { name: "brands", type: "string[]", facet: true, optional: true },
      { name: "models", type: "string[]", facet: true, optional: true },
      { name: "year_min", type: "int32", optional: true },
      { name: "year_max", type: "int32", optional: true },
      { name: "updated_at", type: "int64" },
    ],
    default_sorting_field: "updated_at",
  };
}

function escapeFilterValue(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeThumbnailUrl(raw, ctx = {}) {
  if (!raw) return null;
  let u = String(raw).trim();
  if (!u) return null;

  u = stabilizeLegacyProductMediaUrl(u, ctx);
  if (!u) return null;

  if (u.startsWith("http")) return u;
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return u;
  return `${base}/${decodeURIComponent(u).replace(/^\/+/, "")}`;
}

async function mysqlSearchIds(opts) {
  const q = (opts.q && String(opts.q).trim()) || "";
  const perPage = Math.min(100, Math.max(1, Number(opts.perPage) || 24));
  const page = Math.max(1, Number(opts.page) || 1);
  const offset = (page - 1) * perPage;
  const cityId = Number(opts.cityId);
  const cityName = String(opts.city || opts.location || "").trim();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const joins = " JOIN shops s ON s.id = p.shopId "
    + (cityId || cityName ? " LEFT JOIN address a ON a.id = s.provinceId " : "");

  if (!q) {
    return { ids: [], found: 0, source: "mysql" };
  }

  const intent = parseKeywordIntent(q);
  if (!intent.words.length && intent.partNorm.length <= 2) {
    return { ids: [], found: 0, source: "mysql" };
  }

  let where = ` WHERE 1=1 ${vis.sql} `;
  const params = [];

  const filterBrand = cleanHttpQueryValue(opts.brand);
  const filterModel = cleanHttpQueryValue(opts.model);
  const filterCategory = cleanHttpQueryValue(opts.category);
  const filterYear = normalizeListFilterYear(opts.year);

  const vehicleExists = buildSameRowVehicleFitmentExistsSql("p.id", {
    brand: filterBrand,
    model: filterModel,
    year: filterYear,
  });
  if (vehicleExists) {
    where += vehicleExists.sql;
    params.push(...vehicleExists.params);
  }

  if (Number.isFinite(cityId) && cityId > 0) {
    where += ` AND s.provinceId = ? `;
    params.push(cityId);
  } else if (cityName) {
    const cityFolded = normalizeText(cityName);
    const citySlug = cityFolded.replace(/\s+/g, "-");
    where += ` AND (
      a.tinh_tp_norm = ?
      OR a.tinh_tp_slug = ?
      OR a.tinh_tp_norm LIKE ?
    ) `;
    params.push(cityFolded, citySlug, `%${cityFolded}`);
  }
  if (filterCategory) {
    where += `
      AND LOWER(TRIM(REGEXP_REPLACE(p.partName, '\\s+', ' ')))
        = LOWER(TRIM(REGEXP_REPLACE(?, '\\s+', ' ')))
    `;
    params.push(filterCategory);
  }

  const pc = await getProductsColumnsResolved();
  const searchFromSql = () => `FROM products p ${joins}`;

  const ids = await discoverKeywordProductIds({
    pc,
    intent,
    baseWhere: where,
    baseParams: params,
    joinVehicleFitment: false,
    joinCategoryMap: false,
    limit: perPage,
    offset,
    sort: "newest",
    fromSqlBuilder: searchFromSql,
  });

  const { total: found } = intent.strictSku
    ? {
        total: offset + ids.length,
      }
    : resolveKeywordListingPagination({
        rows: ids.map((id) => ({ id })),
        limit: perPage,
        offset,
        page,
      });

  return {
    ids,
    found,
    source: "mysql",
  };
}

/**
 * Tham số search Typesense (ranking + typo) — tinh chỉnh bằng ENV / typesenseSearchDefaults.js.
 */
function buildTypesenseSearchPayload({ q, perPage, page, filter_by }) {
  const weights =
    process.env.TYPESENSE_QUERY_BY_WEIGHTS || TS_DEF.query_by_weights;
  const num_typos = Math.min(
    2,
    Math.max(
      0,
      Number(
        process.env.TYPESENSE_NUM_TYPOS != null
          ? process.env.TYPESENSE_NUM_TYPOS
          : TS_DEF.num_typos,
      ),
    ),
  );

  let typo_tolerance = TS_DEF.typo_tolerance_enabled
    ? TS_DEF.typo_tolerance
    : false;
  const typoJson = process.env.TYPESENSE_TYPO_TOLERANCE_JSON;
  if (typoJson) {
    try {
      typo_tolerance = JSON.parse(typoJson);
    } catch {
      typo_tolerance = TS_DEF.typo_tolerance_enabled
        ? TS_DEF.typo_tolerance
        : false;
    }
  } else if (String(process.env.TYPESENSE_TYPO_TOLERANCE).toLowerCase() === "off") {
    typo_tolerance = false;
  }

  const prioritize_exact_match =
    process.env.TYPESENSE_PRIORITIZE_EXACT !== "0" &&
    TS_DEF.prioritize_exact_match !== false;

  const payload = {
    q,
    query_by: "partNumber_norm,partNumber,partName,search_blob",
    query_by_weights: weights,
    prioritize_exact_match,
    num_typos,
    typo_tolerance,
    per_page: perPage,
    page,
    filter_by,
  };

  if (process.env.TYPESENSE_PRIORITIZE_TOKEN_POSITION === "1") {
    payload.prioritize_token_position = true;
  }

  return payload;
}

/**
 * @param {{ q: string, brand?: string, model?: string, year?: number, category?: string, perPage?: number, page?: number }} opts
 */
export async function searchProductIds(opts) {
  const q = (opts.q && String(opts.q).trim()) || "";
  const perPage = Math.min(100, Math.max(1, Number(opts.perPage) || 16));
  const page = Math.max(1, Number(opts.page) || 1);
  const hasLocationFilter = Boolean(opts.cityId || opts.city || opts.location);

  const brand = cleanHttpQueryValue(opts.brand) || undefined;
  const model = cleanHttpQueryValue(opts.model) || undefined;
  const category = cleanHttpQueryValue(opts.category) || undefined;
  const year = normalizeListFilterYear(opts.year);

  const mysqlOpts = { ...opts, perPage, page, brand, model, category, year };

  const ts = getTypesenseClient();
  if (!ts || !q || hasLocationFilter) {
    return mysqlSearchIds(mysqlOpts);
  }

  const filters = [];
  if (brand) {
    filters.push(`brands:=${escapeFilterValue(brand)}`);
  }
  if (model) {
    filters.push(`models:=${escapeFilterValue(model)}`);
  }
  if (year != null && Number.isFinite(year)) {
    filters.push(`year_min:<=${year} && year_max:>=${year}`);
  }
  if (category) {
    const cn = sqlCategoryKeyFromPartName(category);
    if (cn) filters.push(`category_norm:=${escapeFilterValue(cn)}`);
  }

  try {
    const res = await ts.collections(COLLECTION).documents().search(
      buildTypesenseSearchPayload({
        q,
        perPage,
        page,
        filter_by: filters.length ? filters.join(" && ") : undefined,
      }),
    );

    const ids = (res.hits || [])
      .map((h) => Number(h.document?.id))
      .filter((n) => Number.isFinite(n) && n > 0);

    // Defensive: post-filter Typesense results against current DB rules.
    const ok = [];
    for (const id of ids) {
      // isProductPubliclyVisible handles schema-adaptive checks.
      // Keep sequential to avoid DB overload; results size is small.
      // (Could be batched later if needed.)
      // eslint-disable-next-line no-await-in-loop
      if (await isProductPubliclyVisible(id)) ok.push(id);
    }

    return {
      ids: ok,
      found: ok.length,
      source: "typesense",
    };
  } catch (e) {
    console.warn("[productSearch] Typesense lỗi, fallback MySQL:", e.message);
    return mysqlSearchIds(mysqlOpts);
  }
}

export async function hydrateProductsByIds(ids) {
  const rows = await cardRepo.hydrateHomeCardsByIdsInOrder(ids);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    partNumber: row.partNumber,
    partName: row.partName,
    price: row.price != null ? Number(row.price) : null,
    shopName: row.shopName,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  }));
}

export async function searchProductsPublic(opts) {
  const perPage = Math.min(100, Math.max(1, Number(opts.perPage) || 16));
  const pageNum = Math.max(1, Number(opts.page) || 1);
  const { ids, found, source } = await searchProductIds({
    ...opts,
    perPage,
    page: pageNum,
  });
  if (!ids.length) {
    return {
      data: [],
      found: found || 0,
      source,
      page: pageNum,
      totalPages: 1,
      perPage,
    };
  }
  const hydrated = await cardRepo.hydrateHomeCardsByIdsInOrder(ids, {
    brand: opts.brand,
    model: opts.model,
    year: opts.year,
  });

  const vehicleFilters = {
    brand: opts.brand,
    model: opts.model,
    year: opts.year,
  };

  const data = hydrated.map((rawRow) => {
    const row = productListRepo.hydrateListingRowVehicleFields(rawRow, vehicleFilters);
    const shortDescription = stripHtml(row.shortDescription);
    const sub = buildProductCardHighlights({
      productTitle: shortDescription,
      partNumber: row.partNumber,
      partName: row.partName,
      origin: row.origin,
      provinceName: row.provinceName,
      shopName: row.shopName,
      compatibilityLine: row.compatibilityLine,
      stock: row.stock,
      updatedAt: row.updatedAt,
    });
    return {
      id: row.id,
      slug: row.slug,
      legacySlug: legacySlugForId(row.id),
      partNumber: row.partNumber,
      partName: row.partName,
      shortDescription,
      priceText: formatVND(row.price),
      summary: sub.summary,
      cardHighlights: sub.cardHighlights,
      subtitleLine1: sub.subtitleLine1,
      subtitleLine2: sub.subtitleLine2,
      image: normalizeThumbnailUrl(row.thumbRaw, {
        shopId: row.shopId,
        partNumber: row.partNumber,
      }),
      origin: row.origin,
      shopName: row.shopName,
      provinceName: row.provinceName,
      phone: row.phone,
    };
  });

  const total = Math.max(0, Number(found) || 0);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return {
    data,
    found: total,
    source,
    page: pageNum,
    totalPages,
    perPage,
  };
}
