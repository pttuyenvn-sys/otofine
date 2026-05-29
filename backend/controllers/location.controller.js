import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import {
  buildProductListFilters,
  buildLocationFilteredFromSql,
} from "../repositories/productList.repository.js";
import {
  listingQueryHasAnyFacetFilter,
  listingQueryNeedsVehicleFitmentJoin,
  normalizeListingQuery,
} from "../utils/listingQueryNormalize.js";

const slugify = (str) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * GET /api/locations/available
 *
 * Returns cities that have at least one shop with products,
 * sorted by product_count DESC, shop_count DESC.
 */
export async function getAvailableLocations(req, res) {
  try {
    const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
    const [rows] = await pool.query(`
      SELECT
        a.id,
        a.tinh_tp        AS name,
        COUNT(DISTINCT s.id) AS shopCount,
        COUNT(DISTINCT p.id) AS productCount
      FROM address a
      INNER JOIN shops s ON s.provinceId = a.id AND s.public_status = 'public'
      INNER JOIN products p ON p.shopId = s.id
      WHERE 1=1 ${vis.sql}
      GROUP BY a.id, a.tinh_tp
      HAVING productCount > 0
      ORDER BY productCount DESC, shopCount DESC
    `);

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: slugify(r.name.replace(/^TP\s+/i, "")),
      shopCount: Number(r.shopCount),
      productCount: Number(r.productCount),
    }));

    res.json(data);
  } catch (err) {
    console.error("getAvailableLocations error:", err);
    res.status(500).json([]);
  }
}

/**
 * GET /api/locations/filtered
 *
 * Returns cities with product counts filtered by brand/model/year/category/keyword.
 * Reuses buildProductListFilters for consistent WHERE conditions.
 * Falls back to static counts if no filters provided.
 */
import * as productListService from "../services/productList.service.js";

export async function getFilteredLocations(req, res) {
  try {
    const rows = await productListService.getLocations(req.query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}
