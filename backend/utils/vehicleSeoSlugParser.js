import { pool } from "../config/db.js";

const YEAR_TOKEN_RE = /^(19|20)\d{2}$/;
const YEAR_RANGE_TAIL_RE = /^(19|20)\d{2}-(19|20)\d{2}$/;
const YEAR_SINGLE_TAIL_RE = /^(19|20)\d{2}$/;

/**
 * Parse trailing year or year-range segment after model slug.
 * @param {string} tail
 * @returns {number | string | null}
 */
function parseYearTail(tail = "") {
    const raw = String(tail || "").trim();
    if (!raw) return null;

    if (YEAR_RANGE_TAIL_RE.test(raw)) {
        const [fromText, toText] = raw.split("-");
        const yearFrom = Number(fromText);
        const yearTo = Number(toText);
        if (!YEAR_TOKEN_RE.test(fromText) || !YEAR_TOKEN_RE.test(toText)) {
            return null;
        }
        if (yearFrom === yearTo) return yearFrom;
        return `${Math.min(yearFrom, yearTo)}-${Math.max(yearFrom, yearTo)}`;
    }

    if (YEAR_SINGLE_TAIL_RE.test(raw)) {
        return Number(raw);
    }

    return null;
}

/**
 * Remove location suffix (`-tai-{slug}`) before year parsing.
 * @param {string} slug
 * @param {Array<{ id?: number, tinh_tp?: string, tinh_tp_slug?: string }>} locations
 */
function stripLocationSuffix(slug, locations = []) {
    let working = String(slug || "").trim().toLowerCase();
    let matchedLocation = null;

    for (const row of locations) {
        const locSlug = String(row?.tinh_tp_slug || "").trim();
        if (!locSlug) continue;

        const patterns = [`-tai-${locSlug}`, `-${locSlug}`];
        for (const pattern of patterns) {
            if (!working.endsWith(pattern)) continue;
            matchedLocation = row;
            working = working.slice(0, -pattern.length);
            return { workingSlug: working, matchedLocation };
        }
    }

    return { workingSlug: working, matchedLocation: null };
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

    const [locations] = await pool.query(`
    SELECT
    id,
    tinh_tp,
    tinh_tp_slug
    FROM address
  `);

    const { workingSlug, matchedLocation } = stripLocationSuffix(
        cleanSlug,
        locations,
    );

    const modelSlug = String(matchedCar.slug || "").trim();
    let yearTail = "";
    if (workingSlug === modelSlug) {
        yearTail = "";
    } else if (workingSlug.startsWith(`${modelSlug}-`)) {
        yearTail = workingSlug.slice(modelSlug.length + 1);
    } else {
        yearTail = "";
    }

    const year = parseYearTail(yearTail);

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
