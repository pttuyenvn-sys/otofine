import { pool } from "../config/db.js";
import { parseVehicleSeoSlug } from "../utils/vehicleSeoSlugParser.js";
import { buildVehicleSeoArticle }
    from "../utils/buildVehicleSeoArticle.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import {
    attachCanonicalFieldsFromMap,
    loadPrimaryFitmentCarsByProductIds,
} from "../modules/products/services/canonicalPath.server.js";

export async function getVehicleSeoPage(slug) {
    const parsed = await parseVehicleSeoSlug(slug);

    if (!parsed?.carModelId) {
        return null;
    }

    const [[carModel]] = await pool.query(
        `
    SELECT
      cm.id,
      cm.hang_xe,
      cm.ten_xe,

      cmm.slug,
      cmm.segment,
      cmm.body_type,
      cmm.year_from,
      cmm.year_to,
      cmm.aliases

    FROM car_models cm

    LEFT JOIN car_model_meta cmm
      ON cmm.car_model_id = cm.id

    WHERE cm.id = ?
    LIMIT 1
  `,
        [parsed.carModelId]
    );

    const seoSlug = slug.startsWith("phu-tung-")
        ? slug
        : `phu-tung-${slug}`;

    const [[seoContent]] = await pool.query(
        `
        SELECT *
        FROM vehicle_seo_content
        WHERE slug = ?
        LIMIT 1
        `,
        [seoSlug]
    );

    const [[carContent]] = await pool.query(` SELECT * FROM car_model_content WHERE car_model_id = ? LIMIT 1 `, [parsed.carModelId]);

    const [faults] = await pool.query(
        `
    SELECT *
    FROM car_model_common_faults
    WHERE car_model_id = ?
    ORDER BY priority ASC
    LIMIT 20
  `,
        [parsed.carModelId]
    );

    const [maintenance] = await pool.query(
        `
    SELECT *
    FROM car_model_maintenance
    WHERE car_model_id = ?
    ORDER BY priority DESC
    LIMIT 20
  `,
        [parsed.carModelId]
    );

    const [[specs]] = await pool.query(
        `
    SELECT *
    FROM car_model_specs
    WHERE car_model_id = ?
    LIMIT 1
  `,
        [parsed.carModelId]
    );

    const visObj = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
    const visSql = visObj.sql;

    const [relatedCars] = await pool.query(
        `
        SELECT
            cm.id,
            cm.hang_xe,
            cm.ten_xe,
            cmm.slug,

            COUNT(DISTINCT p.id)
            AS product_count,

            COUNT(DISTINCT shared.productId)
            AS shared_product_count

        FROM car_model_relations rel

        INNER JOIN car_models cm
            ON cm.id = rel.related_car_model_id

        LEFT JOIN car_model_meta cmm
            ON cmm.car_model_id = cm.id

        LEFT JOIN product_car_applications pca
            ON pca.carModelId = cm.id

        LEFT JOIN products p
            ON p.id = pca.productId

        LEFT JOIN shops s ON s.id = p.shopId

        LEFT JOIN product_car_applications shared
            ON shared.productId = p.id
            AND shared.carModelId = ?

        WHERE rel.car_model_id = ?
          AND (p.id IS NULL OR (1=1 ${visSql}))

        GROUP BY
            cm.id,
            cm.hang_xe,
            cm.ten_xe,
            cmm.slug

        ORDER BY shared_product_count DESC

        LIMIT 12
        `,
        [
            parsed.carModelId,
            parsed.carModelId,
        ]
    );

    const [[productStats]] = await pool.query(
        `
        SELECT
            COUNT(DISTINCT p.id) AS total_products
        FROM products p
        INNER JOIN shops s ON s.id = p.shopId
        WHERE EXISTS (
            SELECT 1
            FROM product_car_applications pa
            WHERE pa.productId = p.id
            AND pa.carModelId = ?
        )
        ${visSql}
        `,
        [parsed.carModelId]
    );

    const [products] = await pool.query(
        `
    SELECT
        p.id,
        p.partNumber,
        p.partName,
        p.price,
        p.shopId,
        p.shortDescription,

        COUNT(pa2.carModelId)
        AS popularity_score

    FROM products p

    INNER JOIN shops s ON s.id = p.shopId

    INNER JOIN product_car_applications pa
        ON pa.productId = p.id

    LEFT JOIN product_car_applications pa2
        ON pa2.productId = p.id

    WHERE pa.carModelId = ?
    ${visSql}

    GROUP BY
        p.id,
        p.partNumber,
        p.partName,
        p.price,
        p.shopId,
        p.shortDescription

    ORDER BY popularity_score DESC

    LIMIT 24
    `,
        [parsed.carModelId]
    );

    const fitmentMap = await loadPrimaryFitmentCarsByProductIds(
        pool,
        products.map((row) => row.id),
    );
    const productsWithCanonical = products.map((row) =>
        attachCanonicalFieldsFromMap(row, fitmentMap),
    );

    const articleHtml =
        buildVehicleSeoArticle({
            parsed,
            seoContent,
            carContent,
            products: productsWithCanonical,
            productStats,
            faults,
            maintenance,
            relatedCars,
        });

    return {
        parsed,

        carModel,

        seoContent: {
            ...(seoContent || {}),

            articleHtml,
        },

        faults,

        maintenance,

        specs,

        relatedCars,

        products: productsWithCanonical,
    };
}