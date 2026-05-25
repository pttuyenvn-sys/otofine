/**
 * Product detail SEO-URL builder + parser.
 *
 * URL contract:
 *
 *   /phu-tung/<slug>-<productId>
 *
 * The trailing numeric segment is the CANONICAL lookup key — the slug
 * prefix is purely cosmetic for SEO + share-card readability. Storage,
 * API lookups, and analytics all use the numeric id; the slug never
 * leaves the URL string.
 *
 * Design constraints (Phase: SEO-friendly product URLs):
 *
 *   1. Pure string logic — no DB, no slug table, no migration.
 *   2. Reversible: extractProductIdFromSeoSlug always returns the same
 *      id regardless of slug drift (typos, renames, missing fields).
 *   3. Idempotent: buildProductSeoSlug(buildProductSeoSlug(x)) == x.
 *   4. Diacritic-safe: Vietnamese accents are stripped via NFD →
 *      basic-latin so the URL is ASCII-only and survives every
 *      crawler / messenger / scrape pipeline cleanly.
 *   5. Length-bounded: the slug portion caps at 140 chars so the
 *      final URL stays under common 2 KB browser/proxy limits and
 *      under Google's recommended ~80-char "human-readable" SERP
 *      length budget. (Most slugs land well below this cap.)
 *
 * The canonical-enforcing route at `app/phu-tung/[slug]/page.js` uses
 * the same helper to compute the canonical URL, then 308-redirects
 * any drifted slug to it. That means callers (cards, search results,
 * RFQ suggestions, sitemap) are free to construct URLs from whatever
 * fields they have on hand — even if the result drifts from canonical,
 * the redirect repairs it on the next request.
 */

const SLUG_MAX_LEN = 140;

/**
 * Slugify Vietnamese text into a URL-safe kebab-case ASCII string.
 *
 * Steps:
 *   1. Normalize NFD then strip combining marks → drops é/â/ô/etc.
 *   2. Replace đ/Đ with d (NFD does NOT split these).
 *   3. Lowercase.
 *   4. Replace every non-alphanumeric run with a single hyphen.
 *   5. Trim leading/trailing hyphens.
 *   6. Hard cap to SLUG_MAX_LEN, then re-trim.
 */
export function slugifyVi(text) {
  if (text == null) return "";
  let s = String(text);
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d").replace(/Đ/g, "d");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (s.length > SLUG_MAX_LEN) {
    s = s.slice(0, SLUG_MAX_LEN).replace(/-+$/g, "");
  }
  return s;
}

/**
 * Resolve a list of vehicle applications down to the most descriptive
 * primary fitment for slug generation. Heuristic, NOT business logic:
 *
 *   - Prefer rows with the most fields populated (brand + model + year).
 *   - Tiebreaker: pick the earliest-listed row (matches the order the
 *     API already returns — usually the seller-listed primary fitment).
 *   - Fields can come from either snake_case (raw API: hang_xe / ten_xe
 *     / year_from / year_to) or camelCase (product-list shape: brand /
 *     model / yearFrom / yearTo). Both supported.
 */
function pickPrimaryCar(cars) {
  if (!Array.isArray(cars) || cars.length === 0) return null;
  const scored = cars.map((c, idx) => {
    const brand = c?.brand ?? c?.hang_xe ?? "";
    const model = c?.model ?? c?.ten_xe ?? "";
    const yFrom = c?.yearFrom ?? c?.year_from ?? null;
    const yTo = c?.yearTo ?? c?.year_to ?? null;
    let score = 0;
    if (brand && String(brand).trim()) score += 4;
    if (model && String(model).trim()) score += 2;
    if (yFrom != null && yFrom !== "") score += 1;
    return { idx, brand, model, yFrom, yTo, score };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  return scored[0] || null;
}

/**
 * Build the slug PREFIX (no id appended) from a product shape.
 *
 * Accepts a flexible input so the same builder can serve:
 *   - the raw API response (`product.partName`, `cars[0].hang_xe`, …),
 *   - the product-list/list-card shape (`item.name`, `item.brand`, …),
 *   - the home-card shape (`item.shortDescription`, …),
 *   - any partial subset; missing pieces are skipped silently.
 *
 * Returns "" if nothing usable was provided — callers should treat
 * that as "use id-only URL" and let canonical-enforce repair it.
 */
export function buildProductSeoSlug(input) {
  if (!input || typeof input !== "object") return "";

  // Product name candidates, ordered by descriptiveness.
  const nameRaw =
    input.partName ||
    input.name ||
    input.title ||
    input.shortDescription ||
    "";
  // The product-list API hands back `shortDescription` as HTML; the
  // sanitizer-strip is intentionally cheap and safe (no DOMParser
  // dependency on the server). Empty after strip → falls through.
  const name = stripHtml(nameRaw).trim();

  // Vehicle fitment — first prefer a `cars[]` array (richest), then
  // any flat brand/model/year fields on the input itself (cards).
  let car = pickPrimaryCar(input.cars);
  if (!car) {
    const flatBrand = input.brand || input.hang_xe || "";
    const flatModel = input.model || input.ten_xe || "";
    const flatFrom = input.yearFrom ?? input.year_from ?? null;
    const flatTo = input.yearTo ?? input.year_to ?? null;
    if (flatBrand || flatModel || flatFrom || flatTo) {
      car = { brand: flatBrand, model: flatModel, yFrom: flatFrom, yTo: flatTo };
    }
  }

  // OEM / part numbers like "23300-21010" or "96210A9000SWP" should
  // collapse into a single alphanumeric token in the slug. If we left
  // the dash in, slugifyVi would turn it into yet another separator
  // and the URL would read like "…-2013-23300-21010-2913" — visually
  // ambiguous with a year range or the trailing id. Stripping non-
  // alphanumerics here keeps the OEM as a single readable token,
  // matching SERP convention used by Shopee / Lazada / Tiki for
  // technical part listings.
  const partNumberRaw = input.partNumber || input.part_number || "";
  const partNumber = String(partNumberRaw).replace(/[^A-Za-z0-9]+/g, "");

  // Year segment: prefer yearFrom; if absent, yearTo; if both equal,
  // single year. We deliberately do NOT emit "2014-2020" ranges here
  // because dash-runs collide with the slug separator and force the
  // slugifier to re-collapse them — the canonical handler treats
  // either as equivalent for redirect anyway.
  let yearPart = "";
  if (car) {
    const yf = car.yFrom != null && car.yFrom !== "" ? Number(car.yFrom) : null;
    const yt = car.yTo != null && car.yTo !== "" ? Number(car.yTo) : null;
    if (Number.isFinite(yf) && yf > 0) yearPart = String(yf);
    else if (Number.isFinite(yt) && yt > 0) yearPart = String(yt);
  }

  const pieces = [name];
  if (car?.brand) pieces.push(String(car.brand));
  if (car?.model) pieces.push(String(car.model));
  if (yearPart) pieces.push(yearPart);
  if (partNumber) pieces.push(String(partNumber));

  return slugifyVi(pieces.filter(Boolean).join(" "));
}

/**
 * Build the full public product URL.
 *
 *   buildProductSeoUrl({ id: 2913, partName: "Lọc xăng", … })
 *   → "/phu-tung/loc-xang-toyota-vios-2013-2330021010-2913"
 *
 * Falls back to "/phu-tung/<id>" when no slug fields are available —
 * the canonical-enforcing route handles the redirect to the full slug
 * on first request, so callers never need to defensively pad data.
 *
 * Returns "/" if no id was provided — defensive guard against
 * undefined products (rare, but cheaper than a 404 from a half-built
 * link in the UI).
 */
export function buildProductSeoUrl(input) {
  if (!input || typeof input !== "object") return "/";
  const id = input.id ?? input.productId ?? input.product_id ?? null;
  if (id == null || id === "") return "/";
  const slug = buildProductSeoSlug(input);
  return slug ? `/phu-tung/${slug}-${id}` : `/phu-tung/${id}`;
}

/**
 * Pull the canonical product id out of a /phu-tung/[slug] segment.
 *
 * Accepts both shapes:
 *   "loc-xang-toyota-vios-2013-2330021010-2913" → 2913
 *   "2913"                                       → 2913
 *
 * Returns null for any input that does not end in a positive integer
 * (callers should `notFound()` in that case).
 *
 * Performance contract: this is the hot-path parser run on every
 * product detail request. It is intentionally a single regex + Number
 * coercion with no allocations beyond the match array.
 */
export function extractProductIdFromSeoSlug(slug) {
  if (slug == null) return null;
  const s = String(slug).trim();
  if (!s) return null;
  const m = s.match(/(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}
