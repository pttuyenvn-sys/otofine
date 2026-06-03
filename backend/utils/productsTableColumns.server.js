/**
 * `products` table schema adapter — INFORMATION_SCHEMA once per process.
 * Repositories MUST NOT hardcode `p.partName`-style literals; use this module only.
 */

import { pool } from "../config/db.js";

/** @type {unknown} */
let cache = null;

/**
 * @param {string} alias
 * @param {string} col
 */
function qual(alias, col) {
  const a = String(alias || "p").replace(/`/g, "");
  const c = String(col).replace(/`/g, "");
  return `\`${a}\`.\`${c}\``;
}

/**
 * Loads INFORMATION_SCHEMA columns for `products`.
 */
export async function getProductsColumnsResolved() {
  if (cache) return cache;

  cache = (async () => {
    const [rows] = await pool.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
      `,
    );

    /** @type {Set<string>} */
    const cols = new Set(rows.map((r) => String(r.COLUMN_NAME)));

    /**
     * @param {readonly string[]} candidates
     * @returns {string | null}
     */
    function pick(candidates) {
      return candidates.find((k) => cols.has(k)) ?? null;
    }

    /** @throws {Error} when no physical column satisfies */
    function must(candidates, label) {
      const c = pick(candidates);
      if (!c) {
        throw new Error(
          `[products schema] Missing required physical column (${label}); needed one of: ${candidates.join(", ")}`,
        );
      }
      return c;
    }

    const shopIdCol = must(["shopId", "shop_id"], "shop FK");
    const partNumberCol = must(["partNumber", "part_number"], "SKU / partNumber");
    const partNameCol = must(["partName", "part_name", "name"], "display title");
    const priceCol = must(["price", "unit_price"], "price");
    const shortDescCol = pick(["shortDescription", "short_description"]);
    const descCol = pick(["description", "full_description"]);
    const originCol = pick(["origin"]);
    must(["id"], "primary key");

    /** stock / quantity / qty / inventory — one must exist */
    const stockCol = must(["stock", "quantity", "qty", "inventory"], "stock qty");

    /** @type {string | null} */
    const slugCol = pick(["slug", "productSlug", "seoSlug"]);

    const orderColSure =
      pick(["updatedAt", "updated_at", "createdAt", "created_at", "id"]) ?? "id";

    const imageCol = pick([
      "image_path",
      "image",
      "image_url",
      "thumbnail_url",
      "thumbnail",
      "photo",
      "main_image",
    ]);
    const brandCol = pick(["oem_brand", "brand", "manufacturer"]);

    /** status-like single column OR boolean-ish */
    const rawStatusCol = pick([
      "listing_status",
      "status",
      "publish_status",
      "is_active",
      "is_published",
      "published",
    ]);

    /**
     * @param {string} [alias]
     */
    function idExpr(alias = "p") {
      return qual(alias, "id");
    }

    function shopIdExpr(alias = "p") {
      return qual(alias, shopIdCol);
    }

    function partNumberExpr(alias = "p") {
      return qual(alias, partNumberCol);
    }

    function partNameExpr(alias = "p") {
      return qual(alias, partNameCol);
    }

    function priceExpr(alias = "p") {
      return qual(alias, priceCol);
    }

    function shortDescriptionExpr(alias = "p") {
      return shortDescCol ? qual(alias, shortDescCol) : "CAST(NULL AS CHAR)";
    }

    function descriptionExpr(alias = "p") {
      return descCol ? qual(alias, descCol) : "CAST(NULL AS CHAR)";
    }

    function originExpr(alias = "p") {
      return originCol ? qual(alias, originCol) : "CAST(NULL AS CHAR)";
    }

    function stockExpr(alias = "p") {
      return qual(alias, stockCol);
    }

    /** Lowercased trimmed single-space-normalized facet key from title (keywords / categories). */
    function nameNormalizedLowerExpr(alias = "p") {
      const n = partNameExpr(alias);
      return `LOWER(TRIM(REGEXP_REPLACE(${n}, '\\\\s+', ' ')))`;
    }

    /** “Display name”; API field remains `partName`. */
    function nameSqlSelect(alias = "p") {
      return `${partNameExpr(alias)} AS partName`;
    }

    function partNumberSqlSelect(alias = "p") {
      return `${partNumberExpr(alias)} AS partNumber`;
    }

    function shortDescriptionSqlSelect(alias = "p") {
      return `${shortDescriptionExpr(alias)} AS shortDescription`;
    }

    function descriptionSqlSelect(alias = "p") {
      return `${descriptionExpr(alias)} AS description`;
    }

    function originSqlSelect(alias = "p") {
      return `${originExpr(alias)} AS origin`;
    }

    function shopIdSqlSelect(alias = "p") {
      return `${shopIdExpr(alias)} AS shopId`;
    }

    function priceSqlSelect(alias = "p") {
      return `${priceExpr(alias)} AS price`;
    }

    function stockSqlSelect(alias = "p") {
      return `${stockExpr(alias)} AS stock`;
    }

    /** Raw image path on `products` if present; else NULL. (Card UI still uses `product_images`.) */
    function imageSqlSelect(alias = "p") {
      if (!imageCol) return "NULL AS image";
      return `${qual(alias, imageCol)} AS image`;
    }

    function brandSqlSelect(alias = "p") {
      if (!brandCol) return "NULL AS brand";
      return `${qual(alias, brandCol)} AS brand`;
    }

    /** Coarse listing state: physical column if any, else stock-based. */
    function statusSqlSelect(alias = "p") {
      if (rawStatusCol) return `${qual(alias, rawStatusCol)} AS status`;
      const st = stockExpr(alias);
      return `CASE WHEN COALESCE(${st},0) > 0 THEN 'in_stock' ELSE 'out_of_stock' END AS status`;
    }

    function slugSqlExpr(alias = "p") {
      const idRef = qual(alias, "id");
      const legacy = `CONCAT('sp-', ${idRef})`;
      if (!slugCol) return legacy;
      const s = qual(alias, slugCol);
      return `COALESCE(NULLIF(TRIM(${s}), ''), ${legacy})`;
    }

    function slugSqlSelect(alias = "p") {
      return `${slugSqlExpr(alias)} AS slug`;
    }

    function slugColumnQualified(alias = "p") {
      if (!slugCol) return null;
      return qual(alias, slugCol);
    }

    function seoWhereHasReadableSlug(alias = "p") {
      if (!slugCol) return "1";
      const s = qual(alias, slugCol);
      return `${s} IS NOT NULL AND TRIM(${s}) <> ''`;
    }

    function orderExprQualified(alias = "p") {
      return qual(alias, orderColSure);
    }

    function sitemapSelectList() {
      return `${slugSqlExpr("p")} AS slug, ${orderExprQualified("p")} AS updatedAt`;
    }

    function shopJoinOn(aliasP = "p", aliasShop = "s") {
      return `\`${String(aliasShop).replace(/`/g, "")}\`.id = ${shopIdExpr(aliasP)}`;
    }

    return {
      /** @type {string | null} */
      slugColName: slugCol,
      orderColUsed: orderColSure,
      physical: {
        shopId: shopIdCol,
        partNumber: partNumberCol,
        partName: partNameCol,
        price: priceCol,
        shortDescription: shortDescCol,
        description: descCol,
        origin: originCol,
        stock: stockCol,
        image: imageCol,
        brand: brandCol,
        status: rawStatusCol,
      },
      idExpr,
      shopIdExpr,
      partNumberExpr,
      partNameExpr,
      priceExpr,
      shortDescriptionExpr,
      descriptionExpr,
      originExpr,
      stockExpr,
      nameNormalizedLowerExpr,
      nameSqlSelect,
      partNumberSqlSelect,
      shortDescriptionSqlSelect,
      descriptionSqlSelect,
      originSqlSelect,
      shopIdSqlSelect,
      priceSqlSelect,
      stockSqlSelect,
      imageSqlSelect,
      brandSqlSelect,
      statusSqlSelect,
      slugSqlExpr,
      slugSqlSelect,
      slugColumnQualified,
      seoWhereHasReadableSlug,
      orderExprQualified,
      sitemapSelectList,
      shopJoinOn,
    };
  })();

  return cache;
}

/** @internal */
export function resetProductsColumnsCacheForTests() {
  cache = null;
}
