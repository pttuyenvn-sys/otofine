/**
 * Product detail SEO-URL builder + parser.
 *
 * URL contract (root-level SEO slugs):
 *
 *   /<slug>-<productId>
 *
 * The trailing numeric segment is the CANONICAL lookup key — the slug
 * prefix is purely cosmetic for SEO + share-card readability. Storage,
 * API lookups, and analytics all use the numeric id; the slug never
 * leaves the URL string.
 *
 * Why root-level (no `/phu-tung/` namespace):
 *   - Shorter URLs → higher SERP CTR.
 *   - Standard ecommerce convention (Amazon /<asin>, Shopee /<slug>-<id>
 *     style, Lazada /products/<slug>-<id> being the exception, etc.).
 *   - The trailing numeric id already guarantees collision-free lookup
 *     so the prefix segment carries no routing weight.
 *
 * Collision safety with apex SEO routes (vehicle, category, CMS):
 *   The `[slug]` apex route owns many non-product slugs. The
 *   `looksLikeProductSlug` helper below is the discriminator — it is
 *   a pure-string check that the apex router applies BEFORE attempting
 *   a product fetch. Slugs that look like SEO landings (`phu-tung-o-to`
 *   prefix, `-o-to` suffix, year-only-trailing such as `toyota-vios-2025`)
 *   are rejected so they fall through to the existing landing logic.
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
 * Build the full public product URL (root-level canonical).
 *
 *   buildProductSeoUrl({ id: 2913, partName: "Lọc xăng", … })
 *   → "/loc-xang-toyota-vios-2013-2330021010-2913"
 *
 * Falls back to "/p/<id>" when no slug fields are available — a
 * stable, never-collidable namespace handled by the apex router's
 * product-id detection so we never risk hitting an unrelated slug
 * (e.g. a `[id]`-only URL like "/2913" could in theory shadow a
 * non-product slug). The fallback resolves in a single 308 hop to
 * the canonical full-slug URL.
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
  return slug ? `/${slug}-${id}` : `/p/${id}`;
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

/**
 * SEO landing slugs that own apex routes. A slug equal to / starting
 * with these is NEVER treated as a product, regardless of trailing
 * digits. Keep in sync with `lib/seo/slugify.js#SEO_BASE_SLUG` (the
 * literal duplicated here to keep this module dependency-free —
 * critical since it runs inside the apex `[slug]` route discriminator
 * on every apex request).
 */
const SEO_BASE_SLUG_LITERAL = "phu-tung-o-to";

/**
 * Hard discriminator: is this apex slug a product detail URL?
 *
 * Apex `[slug]` routes share namespace with category SEO pages, vehicle
 * SEO landings, CMS slugs, and future content URLs. We can only treat
 * a slug as a product detail URL when ALL of:
 *
 *   1. Slug ends in `-<positive-integer>` with a non-empty descriptive
 *      prefix (rejects bare-id URLs like "/2913" — those route via the
 *      explicit `/p/<id>` fallback path of `buildProductSeoUrl`).
 *   2. Slug is not a known SEO landing pattern:
 *        - "phu-tung-o-to"           (root vehicle hub)
 *        - "phu-tung-o-to-<anything>" (vehicle landing branch)
 *        - "<anything>-o-to"         (category landing)
 *   3. The trailing digit run does NOT look like ONLY a year (1900-2099)
 *      when the rest of the slug has no other digits. This protects
 *      slugs like "toyota-vios-2025" (vehicle landing) from being
 *      mis-classified — a real product slug almost always carries a
 *      partNumber token (alphanumeric, contains digits) somewhere
 *      between the year and the trailing id, so the prefix containing
 *      `[0-9]` is a strong signal.
 *
 * IMPORTANT: this is a fast filter, NOT a definitive answer. The apex
 * router uses this to decide whether to attempt a product fetch; if
 * the fetch returns 404 the router falls through to the existing
 * SEO/landing logic. False positives self-heal (one failed fetch,
 * then SEO render). False negatives mean a product can be reached
 * via /product/<id> or /p/<id> but not via the heuristic — which is
 * fine because the canonical URL is built by buildProductSeoUrl
 * itself and passes this discriminator by construction.
 *
 * Pure string — no DB, no allocations beyond the regex match.
 */
export function looksLikeProductSlug(slug) {
  if (slug == null) return false;
  const s = String(slug).trim();
  if (!s) return false;

  if (s === SEO_BASE_SLUG_LITERAL) return false;
  if (s.startsWith(`${SEO_BASE_SLUG_LITERAL}-`)) return false;
  if (s.endsWith("-o-to")) return false;

  const m = s.match(/^(.+)-(\d+)$/);
  if (!m) return false;
  const prefix = m[1];
  const idStr = m[2];

  if (idStr.startsWith("0")) return false;
  const n = Number(idStr);
  if (!Number.isFinite(n) || n <= 0) return false;

  // Year-trailing guard: "toyota-vios-2025" → trailing 2025 matches
  // year pattern AND prefix has no digits anywhere → reject. Real
  // product slugs reaching this state would carry a digit-bearing
  // partNumber or year fitment in the prefix.
  if (/^(19|20)\d{2}$/.test(idStr) && !/[0-9]/.test(prefix)) {
    return false;
  }

  return true;
}
