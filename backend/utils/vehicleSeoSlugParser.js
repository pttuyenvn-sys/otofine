import { pool } from "../config/db.js";

function slugify(text = "") {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export async function parseVehicleSeoSlug(slug) {
    const cleanSlug = String(slug || "")
        .trim()
        .toLowerCase();

    if (!cleanSlug) {
        return null;
    }

    const [rows] = await pool.query(`
    SELECT
        cm.id,
        cm.hang_xe,
        cm.ten_xe,
        cmm.slug

    FROM car_models cm

    LEFT JOIN car_model_meta cmm
        ON cmm.car_model_id = cm.id

    WHERE cmm.slug IS NOT NULL

    ORDER BY CHAR_LENGTH(cmm.slug) DESC
    `);

    let matchedCar = null;

    for (const row of rows) {
        const modelSlug = row.slug;

        if (
            cleanSlug === modelSlug ||
            cleanSlug.startsWith(`${modelSlug}-`)
        ) {
            matchedCar = row;
            break;
        }
    }

    if (!matchedCar) {
        return null;
    }

    const yearMatch = cleanSlug.match(/(?:19|20)\d{2}/);

    const year = yearMatch
        ? Number(yearMatch[0])
        : null;

    const [locations] = await pool.query(`
    SELECT
    id,
    tinh_tp,
    tinh_tp_slug
    FROM address
  `);

    let matchedLocation = null;

    for (const row of locations) {
        const locSlug = row.tinh_tp_slug;

        const patterns = [
            `-tai-${locSlug}`,
            `-${locSlug}`,
        ];

        const matched = patterns.some((p) =>
            cleanSlug.endsWith(p)
        );

        if (matched) {
            matchedLocation = row;
            break;
        }
    }

    return {
        carModelId: matchedCar.id,
        brand: matchedCar.hang_xe,
        model: matchedCar.ten_xe,
        modelSlug: matchedCar.slug,
        year,
        locationId: matchedLocation?.id || null,
        locationName: matchedLocation?.tinh_tp || null,
    };
}