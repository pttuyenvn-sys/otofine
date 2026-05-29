import * as productListRepo from "../repositories/productList.repository.js";
import { stripHtml, formatVND } from "../utils/textFormat.js";
import { buildProductCardHighlights } from "../utils/productCardSubtitle.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import {
  cleanHttpQueryValue,
  listingQueryNeedsVehicleFitmentJoin,
  normalizeListingQuery,
} from "../utils/listingQueryNormalize.js";
import { getOrSetCache } from "./listCache.service.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";

const FACET_TTL = 5 * 60 * 1000;

function mapImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${process.env.R2_PUBLIC_URL}/${decodeURIComponent(url).replace(/^\/+/, "")}`;
}

export async function getProductList(query) {
  const { page = 1, sort: sortRaw } = query;
  const sort =
    sortRaw && String(sortRaw).toLowerCase() === "newest"
      ? "newest"
      : sortRaw && String(sortRaw).toLowerCase() === "price_asc"
        ? "price_asc"
        : sortRaw && String(sortRaw).toLowerCase() === "price_desc"
          ? "price_desc"
          : "popular";

  const limit = 16;
  const offset = (Number(page) - 1) * limit;

  const pc = await getProductsColumnsResolved();
  const q = normalizeListingQuery(query);

  const joinVehicleFitment =
    q.brand ||
    q.model ||
    (q.year != null && Number.isFinite(Number(q.year)));
  const { where: baseWhere, params, keywordOrder } =
    productListRepo.buildProductListFilters(pc, query);
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const where = baseWhere + vis.sql;

  if (process.env.LOG_LISTING_SQL === "1") {
    console.log("[listing SQL] /api/products facets", {
      joinVehicleFitment,
      normalized: normalizeListingQuery(query),
    });
  }

  const [rows, countRow] = await Promise.all([
    productListRepo.selectProductListRows({
      pc,
      where,
      params,
      keywordOrder,
      limit,
      offset,
      sort,
      joinVehicleFitment,
    }),
    productListRepo.countProductList({
      pc,
      where,
      params,
      joinVehicleFitment,
    }),
  ]);
  const total = Number(countRow?.total) || 0;
  const totalPages = Math.ceil(total / limit);

  const ids = rows.map((x) => x.id);
  const images = await productListRepo.selectPrimaryImagesForProducts(ids);

  const imageMap = {};
  images.forEach((img) => {
    if (!imageMap[img.productId]) {
      imageMap[img.productId] = img.url;
    }
  });

  const data = rows.map((x) => {
    const shortDescription = stripHtml(x.shortDescription);
    const sub = buildProductCardHighlights({
      productTitle: shortDescription,
      partNumber: x.partNumber,
      partName: x.partName,
      origin: x.origin,
      provinceName: x.provinceName,
      shopName: x.shopName,
      compatibilityLine: x.compatibilityLine,
      stock: x.stock,
      updatedAt: x.updatedAt,
    });
    return {
      ...x,
      shortDescription,
      priceText: formatVND(x.price),
      summary: sub.summary,
      cardHighlights: sub.cardHighlights,
      subtitleLine1: sub.subtitleLine1,
      subtitleLine2: sub.subtitleLine2,
      image: imageMap[x.id] ? mapImageUrl(imageMap[x.id]) : null,
    };
  });

  return {
    page: Number(page),
    total,
    totalPages,
    data,
  };
}

export async function getBrands() {
  return getOrSetCache("brands:all", FACET_TTL, async () => {
    const pc = await getProductsColumnsResolved();
    return productListRepo.selectBrandsWithCounts(pc);
  });
}

export async function getModels(brand) {
  const b = cleanHttpQueryValue(brand);
  if (!b) return [];
  return getOrSetCache(`models:${b.toLowerCase()}`, FACET_TTL, async () => {
    const pc = await getProductsColumnsResolved();
    return productListRepo.selectModelsWithCounts(pc, b);
  });
}

export async function getLocations(query) {
  const q = normalizeListingQuery(query);

  const parts = [
    q.category, q.brand, q.model, q.year, q.keyword, q.city, q.location,
  ].map((v) => (v == null ? "" : String(v).toLowerCase()));

  const cacheKey = `locations:${parts.join("|")}`;

  return getOrSetCache(cacheKey, FACET_TTL, async () => {
    const pc = await getProductsColumnsResolved();

    const rows = await productListRepo.selectLocationsWithCounts(pc, query);

    // ✅ FIX: map lại đúng format FE cần
    return rows.map(r => ({
      id: r.id,
      name: r.name || r.tinh_tp,
      slug: (r.name || r.tinh_tp)
        ?.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      productCount: Number(r.productCount || r.total || 0)
    }));
  });
}