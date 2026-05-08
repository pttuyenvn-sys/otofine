import * as cardRepo from "../repositories/productCard.repository.js";
import * as plvRepo from "../repositories/productListView.repository.js";
import { normalizeText } from "../repositories/productList.repository.js";
import {
  cleanHttpQueryValue,
  normalizeListFilterYear,
} from "../utils/listingQueryNormalize.js";
import { getOrSetCache } from "./listCache.service.js";
import { stripHtml, formatVND } from "../utils/textFormat.js";
import { buildProductCardHighlights } from "../utils/productCardSubtitle.js";
import { legacySlugForId } from "../utils/productSlug.js";

function normalizeThumbnailUrl(raw) {
  if (!raw) return null;
  const u = String(raw).trim();
  if (!u) return null;
  if (u.startsWith("http")) return u;
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return u.startsWith("/") ? u : `/${u}`;
  const pathPart = decodeURIComponent(u).replace(/^\/+/, "");
  return `${base}/${pathPart}`;
}

function encodeCursor(updatedAt, id) {
  const u =
    updatedAt instanceof Date
      ? updatedAt.toISOString()
      : String(updatedAt);
  const payload = JSON.stringify({ u, id: Number(id) });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeCursor(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    const padded =
      pad === 0 ? normalized : normalized + "=".repeat(4 - pad);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const o = JSON.parse(json);
    if (!o || typeof o.u !== "string" || !Number.isFinite(Number(o.id))) {
      return null;
    }
    return { u: o.u, id: Number(o.id) };
  } catch {
    return null;
  }
}

function mapRowToCard(row) {
  const thumb =
    row.thumbnail != null
      ? row.thumbnail
      : normalizeThumbnailUrl(row.thumbRaw);

  const updatedAt =
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : row.updatedAt;

  const id = row.id;
  const slug = row.slug || legacySlugForId(id);

  return {
    id,
    slug,
    legacySlug: legacySlugForId(id),
    partNumber: row.partNumber,
    partName: row.partName,
    price: row.price != null ? Number(row.price) : null,
    thumbnail: thumb,
    shopName: row.shopName,
    city: row.city ?? null,
    updatedAt,
  };
}

/** Định dạng giống /products/list cho trang chủ (embed=home). */
function mapRowToHomeListItem(row) {
  const id = row.id;
  const slug = row.slug || legacySlugForId(id);
  const image = normalizeThumbnailUrl(row.thumbRaw);
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
    id,
    slug,
    legacySlug: legacySlugForId(id),
    partNumber: row.partNumber,
    partName: row.partName,
    shortDescription,
    priceText: formatVND(row.price),
    summary: sub.summary,
    cardHighlights: sub.cardHighlights,
    subtitleLine1: sub.subtitleLine1,
    subtitleLine2: sub.subtitleLine2,
    image,
    origin: row.origin,
    shopName: row.shopName,
    provinceName: row.provinceName,
    phone: row.phone,
    price: row.price != null ? Number(row.price) : null,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  };
}

async function loadCardRows({
  limit,
  cursorUpdatedAt,
  cursorId,
  hasFilters,
  brand,
  model,
  year,
  category,
  keywordWords,
  cityId,
  embedHome,
}) {
  const limitPlusOne = limit + 1;

  const useView =
    !embedHome &&
    process.env.PRODUCT_LIST_CARD_USE_VIEW === "1" &&
    !hasFilters &&
    (await plvRepo.productListViewTableExists());

  let rows;
  if (embedHome) {
    if (hasFilters) {
      rows = await cardRepo.fetchHomeCardsLiveFiltered({
        limitPlusOne,
        cursorUpdatedAt,
        cursorId,
        brand,
        model,
        year,
        category,
        keywordWords,
        cityId,
      });
    } else {
      rows = await cardRepo.fetchHomeCardsLiveUnfiltered({
        limitPlusOne,
        cursorUpdatedAt,
        cursorId,
      });
    }
  } else if (useView) {
    rows = await cardRepo.fetchCardsFromListView({
      limitPlusOne,
      cursorUpdatedAt,
      cursorId,
    });
  } else if (hasFilters) {
    rows = await cardRepo.fetchCardsLiveFiltered({
      limitPlusOne,
      cursorUpdatedAt,
      cursorId,
      brand,
      model,
      year,
      category,
      keywordWords,
      cityId,
    });
  } else {
    rows = await cardRepo.fetchCardsLiveUnfiltered({
      limitPlusOne,
      cursorUpdatedAt,
      cursorId,
    });
  }

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const mapper = embedHome ? mapRowToHomeListItem : mapRowToCard;
  const data = slice.map(mapper);

  let nextCursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    nextCursor = encodeCursor(last.updatedAt, last.id);
  }

  return { data, nextCursor, hasMore };
}

export async function getProductCardList(query) {
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 16));
  const cursor = decodeCursor(query.cursor);
  const cursorUpdatedAt = cursor ? new Date(cursor.u) : null;
  const cursorId = cursor ? cursor.id : null;

  const brand = cleanHttpQueryValue(query.brand) || "";
  const model = cleanHttpQueryValue(query.model) || "";
  const year = normalizeListFilterYear(query.year);
  const category = cleanHttpQueryValue(query.category) || "";
  const keyword = cleanHttpQueryValue(query.keyword) || "";
  const cityIdRaw = query.cityId;
  let cityId = 0;
  if (cityIdRaw != null && cityIdRaw !== "") {
    const n = Number(cityIdRaw);
    if (Number.isFinite(n) && n > 0) cityId = n;
  }
  const city = cleanHttpQueryValue(query.city || query.location) || "";
  const embedHome = String(query.embed || "") === "home";

  const hasFilters = Boolean(
    (brand && String(brand).trim()) ||
      (model && String(model).trim()) ||
      (year != null && Number.isFinite(year) && year > 0) ||
      (category && String(category).trim()) ||
      keyword.trim() ||
      (Number.isFinite(cityId) && cityId > 0) ||
      (city && String(city).trim()),
  );

  const kw = keyword.trim() ? normalizeText(keyword) : "";
  const keywordWords = kw.split(/\s+/).filter(Boolean);

  const run = () =>
    loadCardRows({
      limit,
      cursorUpdatedAt,
      cursorId,
      hasFilters,
      brand: brand || undefined,
      model: model || undefined,
      year: year != null ? year : null,
      category: category || undefined,
      keywordWords,
      cityId: cityId || undefined,
      city: city || undefined,
      embedHome,
    });

  const ttlCard =
    Number(process.env.CACHE_TTL_CARD_FIRST_MS) ||
    Number(process.env.LIST_CACHE_TTL_MS) ||
    15_000;

  if (!cursor && !hasFilters) {
    const cacheKey = `card:first:${embedHome ? "home" : "card"}:${limit}`;
    return getOrSetCache(cacheKey, ttlCard, run);
  }

  return run();
}
