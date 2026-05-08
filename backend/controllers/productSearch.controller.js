import * as productSearchService from "../services/productSearch.service.js";
import {
  cleanHttpQueryValue,
  normalizeListFilterYear,
} from "../utils/listingQueryNormalize.js";

export async function getProductSearch(req, res) {
  try {
    const {
      q = "",
      keyword = "",
      brand,
      model,
      year,
      category,
      cityId,
      city,
      location,
      limit,
      page,
    } = req.query;

    let perPage = 16;
    if (limit !== undefined && limit !== "") {
      const n = Number(limit);
      if (Number.isFinite(n)) perPage = Math.min(100, Math.max(1, n));
    }

    let pageNum = 1;
    if (page !== undefined && page !== "") {
      const n = Number(page);
      if (Number.isFinite(n)) pageNum = Math.max(1, n);
    }

    const body = await productSearchService.searchProductsPublic({
      q: q || keyword,
      brand: cleanHttpQueryValue(brand),
      model: cleanHttpQueryValue(model),
      year: normalizeListFilterYear(year),
      category: cleanHttpQueryValue(category),
      cityId,
      city: cleanHttpQueryValue(city || location),
      perPage,
      page: pageNum,
    });

    res.json(body);
  } catch (err) {
    console.error("getProductSearch:", err);
    res.status(500).json({
      data: [],
      found: 0,
      source: "error",
      page: 1,
      totalPages: 1,
      perPage: 16,
    });
  }
}
