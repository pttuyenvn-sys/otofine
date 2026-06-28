import { buildVehicleOwnerPath } from "./buildVehicleOwnerPath.js";

/**
 * @typedef {"vehicle" | "vehicleYear" | "vehicleYearRange"} FitmentLinkType
 */

/**
 * @typedef {{ href: string, label: string, type: FitmentLinkType }} FitmentListingLink
 */

function normalizeYear(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Read brand/model/years from a product detail fitment row (`data.cars[]`).
 *
 * @param {Record<string, unknown> | null | undefined} row
 */
export function readFitmentFields(row) {
  if (!row || typeof row !== "object") {
    return { brand: "", model: "", yearFrom: null, yearTo: null };
  }
  const brand = String(row.hang_xe ?? row.brand ?? "").trim();
  const model = String(row.ten_xe ?? row.model ?? "").trim();
  return {
    brand,
    model,
    yearFrom: normalizeYear(row.year_from ?? row.yearFrom),
    yearTo: normalizeYear(row.year_to ?? row.yearTo),
  };
}

/**
 * Build crawlable vehicle listing links from existing product fitment rows.
 * Uses canonical listing URL builders only — no new URL patterns.
 *
 * @param {unknown[] | null | undefined} cars
 * @returns {FitmentListingLink[]}
 */
export function buildFitmentListingLinks(cars) {
  if (!Array.isArray(cars) || cars.length === 0) return [];

  /** @type {Map<string, FitmentListingLink>} */
  const byHref = new Map();

  const add = (href, label, type) => {
    const path = String(href || "").trim();
    const text = String(label || "").trim();
    if (!path || path === "/" || !text) return;
    if (!byHref.has(path)) {
      byHref.set(path, { href: path, label: text, type });
    }
  };

  for (const row of cars) {
    const { brand, model, yearFrom, yearTo } = readFitmentFields(row);
    if (!brand && !model) continue;

    const vehicleLabel = [brand, model].filter(Boolean).join(" ").trim();
    if (vehicleLabel) {
      add(
        buildVehicleOwnerPath({ brand, model }),
        vehicleLabel,
        "vehicle",
      );
    }

    if (yearFrom != null && yearTo != null) {
      if (yearFrom === yearTo) {
        add(
          buildVehicleOwnerPath({ brand, model, year: String(yearFrom) }),
          `${vehicleLabel} ${yearFrom}`.trim(),
          "vehicleYear",
        );
      } else {
        const range = `${yearFrom}-${yearTo}`;
        add(
          buildVehicleOwnerPath({ brand, model, year: range }),
          `${vehicleLabel} ${range}`.trim(),
          "vehicleYearRange",
        );
      }
    }
  }

  const typeOrder = { vehicleYearRange: 0, vehicleYear: 1, vehicle: 2 };
  return [...byHref.values()].sort((a, b) => {
    const ta = typeOrder[a.type] ?? 9;
    const tb = typeOrder[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.label.localeCompare(b.label, "vi");
  });
}

/**
 * @param {FitmentListingLink[]} links
 */
export function summarizeFitmentListingLinks(links) {
  const list = Array.isArray(links) ? links : [];
  return {
    vehicle: list.filter((x) => x.type === "vehicle").length,
    vehicleYear: list.filter((x) => x.type === "vehicleYear").length,
    vehicleYearRange: list.filter((x) => x.type === "vehicleYearRange").length,
    uniqueUrls: list.length,
  };
}
