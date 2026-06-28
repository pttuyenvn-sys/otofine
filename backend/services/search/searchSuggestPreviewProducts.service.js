/**
 * SEARCH-SQL-SCALABILITY-OPTIMIZATION-01 — batch preview products (one SQL).
 */

import { formatVND } from "../../utils/textFormat.js";
import { buildProductCardHighlights } from "../../utils/productCardSubtitle.js";
import { sortSuggestPreviewProducts } from "../../utils/suggestPreviewProductSort.js";
import { formatSearchPreviewGroupTitle } from "../../utils/searchPreviewGroupLabel.js";
import {
  buildProductIdentity,
  pickPrimaryFitment,
} from "../../../frontend/lib/identity/buildProductIdentity.js";
import { fetchBatchPreviewProductRows, fetchPreviewGroupProductKeys } from "./searchInventoryQuery.js";
import { isSearchPopupIndexEnabled } from "../../config/searchPopupIndexConfig.js";
import { SearchIndexDocumentReader } from "./runtime/SearchIndexDocumentReader.js";

const DEFAULT_PRODUCTS_PER_GROUP = 2;

function cleanValue(value) {
  const s = String(value ?? "").trim();
  return s || "";
}

function mapImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${process.env.R2_PUBLIC_URL}/${decodeURIComponent(url).replace(/^\/+/, "")}`;
}

function buildCompatibilityLine(row) {
  const brand = String(row.fitment_brand || "").trim();
  const model = String(row.fitment_model || "").trim();
  if (!brand && !model) return "";
  let yearPart = "";
  const yf = row.fitment_year_from;
  const yt = row.fitment_year_to;
  if (yf != null && yt != null) {
    yearPart = yf === yt ? String(yf) : `${yf}–${yt}`;
  }
  return [brand, model, yearPart].filter(Boolean).join(" ");
}

function previewGroupKey(canonicalName, brand, model) {
  return `${cleanValue(canonicalName).toLowerCase()}|${cleanValue(brand).toLowerCase()}|${cleanValue(model).toLowerCase()}`;
}

/**
 * @param {object} row
 */
export function mapPreviewProductRow(row) {
  const fitmentRows = row.fitment_brand
    ? [
        {
          hang_xe: row.fitment_brand,
          ten_xe: row.fitment_model,
          year_from: row.fitment_year_from,
          year_to: row.fitment_year_to,
          is_primary: row.fitment_is_primary,
        },
      ]
    : [];
  const primaryFitment = pickPrimaryFitment(fitmentRows);
  const identity = buildProductIdentity(
    {
      id: row.id,
      partName: row.partName,
      partNumber: row.partNumber,
    },
    primaryFitment,
  );
  const displayTitle = identity.h1;
  const sub = buildProductCardHighlights({
    productTitle: displayTitle,
    partNumber: row.partNumber,
    partName: row.partName,
    origin: row.origin,
    provinceName: row.provinceName,
    shopName: row.shopName,
    compatibilityLine: buildCompatibilityLine(row),
    stock: row.stock,
    updatedAt: row.updatedAt,
  });

  const product = {
    id: row.id,
    partName: row.partName,
    partNumber: row.partNumber,
    price: row.price,
    stock: row.stock,
    updatedAt: row.updatedAt,
    displayTitle,
    priceText: formatVND(row.price),
    cardHighlights: sub.cardHighlights,
    subtitleLine1: sub.subtitleLine1,
    subtitleLine2: sub.subtitleLine2,
    image: row.imageUrl ? mapImageUrl(row.imageUrl) : null,
    productIdentity: identity,
  };

  if (fitmentRows.length) {
    product.cars = fitmentRows;
    product.canonicalPath = identity.canonicalPath;
    product.canonicalUrl = identity.canonicalUrl;
  }

  return product;
}

/**
 * @param {import('./searchInventoryQuery.js').SearchInventoryContext} ctx
 * @param {Array<{ canonical_name: string, canonical_slug?: string, brand?: string, model?: string, total_count?: number }>} rankedVehicleGroups
 * @param {ReturnType<typeof import('../../utils/listingQueryNormalize.js').normalizeListingQuery>} listing
 * @param {object} [options]
 */
export async function buildPreviewBlocksFromInventory(
  ctx,
  rankedVehicleGroups,
  listing,
  options = {},
) {
  const productsPerGroup = Math.min(
    Math.max(Number(options.productsPerGroup) || DEFAULT_PRODUCTS_PER_GROUP, 1),
    4,
  );

  const previewGroups = rankedVehicleGroups || [];
  if (previewGroups.length === 0) return [];

  const groupPayloads = previewGroups.map((row) => {
    const brand = cleanValue(row.brand) || cleanValue(listing.brand);
    const model = cleanValue(row.model) || cleanValue(listing.model);
    const year = listing.year != null ? String(listing.year) : "";
    return {
      row,
      group: {
        title: formatSearchPreviewGroupTitle(row.canonical_name, { brand, model, year }),
        canonical_name: row.canonical_name,
        canonical_slug: row.canonical_slug,
        brand,
        model,
        year,
        total_count: Number(row.total_count) || 0,
      },
      key: previewGroupKey(row.canonical_name, brand, model),
    };
  });

  let productRows;
  if (isSearchPopupIndexEnabled()) {
    const keys = await fetchPreviewGroupProductKeys(
      ctx,
      groupPayloads.map((g) => ({
        canonical_name: g.group.canonical_name,
        brand: g.group.brand,
        model: g.group.model,
      })),
    );
    productRows = await SearchIndexDocumentReader.readForPreview(
      keys.map((k) => ({
        product_id: k.id,
        canonical_name: k.canonical_name,
        brand: k.brand,
        model: k.model,
        fitment_year_from: k.fitment_year_from,
        fitment_year_to: k.fitment_year_to,
      })),
    );
  } else {
    productRows = await fetchBatchPreviewProductRows(
      ctx,
      groupPayloads.map((g) => ({
        canonical_name: g.group.canonical_name,
        brand: g.group.brand,
        model: g.group.model,
      })),
    );
  }

  const byGroup = new Map();
  for (const g of groupPayloads) {
    byGroup.set(g.key, []);
  }

  for (const row of productRows) {
    const key = previewGroupKey(row.canonical_name, row.brand, row.model);
    if (!byGroup.has(key)) continue;
    byGroup.get(key).push(mapPreviewProductRow(row));
  }

  const seenProductIds = new Set();
  const blocks = [];

  for (const { group, key } of groupPayloads) {
    const sorted = sortSuggestPreviewProducts(byGroup.get(key) || []);
    const deduped = [];
    for (const product of sorted) {
      const id = Number(product?.id);
      if (!Number.isFinite(id) || seenProductIds.has(id)) continue;
      seenProductIds.add(id);
      deduped.push(product);
      if (deduped.length >= productsPerGroup) break;
    }
    blocks.push({ group, products: deduped });
  }

  return blocks;
}
