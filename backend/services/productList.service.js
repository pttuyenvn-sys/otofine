import * as productListRepo from "../repositories/productList.repository.js";
import { stripHtml, formatVND } from "../utils/textFormat.js";
import { buildProductCardHighlights } from "../utils/productCardSubtitle.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";

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
  const { where, params, keywordOrder } =
    productListRepo.buildProductListFilters(pc, query);

  const rows = await productListRepo.selectProductListRows({
    pc,
    where,
    params,
    keywordOrder,
    limit,
    offset,
    sort,
  });

  const countRow = await productListRepo.countProductList({ pc, where, params });
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
  const pc = await getProductsColumnsResolved();
  return productListRepo.selectBrandsWithCounts(pc);
}

export async function getModels(brand) {
  const pc = await getProductsColumnsResolved();
  return productListRepo.selectModelsWithCounts(pc, brand);
}
