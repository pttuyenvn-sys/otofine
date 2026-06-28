/**
 * Storefront visual resolver — kill the "same hero everywhere" feel.
 *
 * Symptom we're fixing:
 *   homepage cover, homepage promo banner, and the `/gioi-thieu` hero
 *   were all pulling from the same `shop.cover` URL, so storefronts
 *   looked like cookie-cutter templates even when the seller had
 *   uploaded plenty of original content (intro images, product photos).
 *
 * What this module does:
 *   `buildStorefrontVisuals(shop, sources)` returns a single object
 *   exposing one URL per "slot":
 *
 *     { cover, homepagePromo, aboutHero, contactMapFallback }
 *
 *   The resolver:
 *     1. Tries the slot's preferred sources in order (seller-uploaded
 *        slot-specific image → first/second intro image → first/second
 *        product image → curated automotive fallback bucket).
 *     2. Skips any URL that has already been claimed by an earlier
 *        slot. So the cover never re-appears in the promo or hero,
 *        even if the seller hasn't filled any of the optional slots.
 *     3. Picks the curated fallback deterministically by `shop.id`,
 *        so the same shop always gets the same fallback (no hydration
 *        flicker, no random shuffle on page navigation), and the
 *        per-slot fallback buckets DON'T overlap — homepage promo and
 *        about hero pull from disjoint sets so even the fallback path
 *        produces visual diversity.
 *
 * Future-ready, no DB migration in this phase:
 *   The resolver already reads `shop.homepagePromoImage` and
 *   `shop.aboutHeroImage` even though those columns don't exist yet.
 *   When the seller-side editor + backend gain dedicated upload slots
 *   for them, the storefront automatically prefers them with zero
 *   additional code change here.
 *
 * Performance:
 *   - pure function, runs in the RSC pass (no extra fetch, no client
 *     hydration cost).
 *   - extracted intro images are computed once per request; we don't
 *     re-parse on every slot lookup.
 *   - no random state — same input → same output → no CLS / flicker.
 *
 * What it does NOT do:
 *   - download / probe images
 *   - resize / proxy URLs
 *   - touch product canonical URLs, SEO, routing, or upload pipeline
 */

import { extractIntroImages } from "./extractIntroImages.js";

/**
 * Curated automotive fallback buckets — one per slot.
 *
 * Deliberately disjoint so the homepage promo and about hero NEVER
 * coincide on the same Unsplash photo even when both fall through to
 * the curated layer. Within a bucket we pick by `shop.id % length`
 * so the choice is stable per shop.
 *
 * URL params keep us at a sane delivered size (~120 KB jpeg) so the
 * fallback doesn't blow LCP on connections that would otherwise be
 * decoding a fresh hero from R2.
 */
const FALLBACK_PARAMS = "auto=format&fit=crop&w=1400&q=72";

const FALLBACKS = {
  homepagePromo: [
    // garage / mechanic working — the "this is a real shop" vibe
    `https://images.unsplash.com/photo-1486754735734-325b5831c3ad?${FALLBACK_PARAMS}`,
    // close-up of someone working on an engine
    `https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?${FALLBACK_PARAMS}`,
    // auto-parts shop interior
    `https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?${FALLBACK_PARAMS}`,
    // packaged auto parts on workbench
    `https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?${FALLBACK_PARAMS}`,
    // workshop / garage with tools
    `https://images.unsplash.com/photo-1622185135505-2d795003994a?${FALLBACK_PARAMS}`,
  ],
  aboutHero: [
    // technician under the hood
    `https://images.unsplash.com/photo-1567789884554-0b844b597180?${FALLBACK_PARAMS}`,
    // tire / wheel close-up
    `https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?${FALLBACK_PARAMS}`,
    // car wheel detail
    `https://images.unsplash.com/photo-1532581140115-3e355d1ed1de?${FALLBACK_PARAMS}`,
    // brand-neutral car for storytelling
    `https://images.unsplash.com/photo-1486496146582-9ffcd0b2b2b7?${FALLBACK_PARAMS}`,
    // garage scene with car interior
    `https://images.unsplash.com/photo-1611821064430-0d40291d0f0b?${FALLBACK_PARAMS}`,
  ],
  contactMapFallback: [
    // reserved for the empty-state slot in ShopMapVisualBlock when no
    // map/coords/address exist — not wired yet, but the resolver
    // exposes the type so a future change can light it up without
    // touching the shop pages.
    `https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?${FALLBACK_PARAMS}`,
  ],
};

const ALL_SLOTS = ["cover", "homepagePromo", "aboutHero", "contactMapFallback"];

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function pickFromBucket(slot, shopId) {
  const bucket = FALLBACKS[slot];
  if (!Array.isArray(bucket) || bucket.length === 0) return null;
  const idx = Math.abs(Number(shopId) || 0) % bucket.length;
  return bucket[idx];
}

/**
 * @param {Object} shop                  raw public-shop DTO
 * @param {Object} [sources]             extra image arrays (callers
 *                                       fetch products / pass intro
 *                                       images already extracted)
 * @param {string[]} [sources.products]  product image URLs in display order
 * @param {string[]} [sources.intro]     intro image URLs (precomputed)
 * @param {string} [sources.introHtml]   raw HTML to extract from when
 *                                       `sources.intro` is not provided
 * @returns {{ cover: string|null,
 *             homepagePromo: string|null,
 *             aboutHero: string|null,
 *             contactMapFallback: string|null }}
 */
export function buildStorefrontVisuals(shop = {}, sources = {}) {
  const productImages = (Array.isArray(sources.products) ? sources.products : [])
    .filter(isNonEmptyString);
  const introImages = Array.isArray(sources.intro)
    ? sources.intro.filter(isNonEmptyString)
    : extractIntroImages(sources.introHtml || shop.introHtml || "");

  // Slot → ordered preference list (slot-specific override → real shop
  // content → curated fallback as the last resort). The cover slot is
  // always exactly `shop.cover` because that's the seller's deliberate
  // brand image and we don't want to override it.
  const PREFERENCE = {
    cover: [shop.cover],
    homepagePromo: [
      shop.homepagePromoImage,          // future-ready slot
      introImages[0],
      productImages[0],
      productImages[1],
      pickFromBucket("homepagePromo", shop.id),
    ],
    aboutHero: [
      shop.aboutHeroImage,              // future-ready slot
      introImages[1] || introImages[0], // 2nd intro img preferred,
                                        // 1st as last resort here
      productImages[1] || productImages[0],
      productImages[2],
      pickFromBucket("aboutHero", shop.id),
    ],
    contactMapFallback: [
      shop.contactMapImage,             // future-ready slot
      pickFromBucket("contactMapFallback", shop.id),
    ],
  };

  const claimed = new Set();
  const out = {};
  for (const slot of ALL_SLOTS) {
    const candidates = PREFERENCE[slot] || [];
    let pick = null;
    for (const c of candidates) {
      if (!isNonEmptyString(c)) continue;
      if (claimed.has(c)) continue;
      pick = c;
      break;
    }
    // If every preferred candidate collided with an already-claimed
    // URL, fall back to the curated bucket once more WITHOUT the
    // skip-if-claimed gate. We still rather show a curated image than
    // nothing, even at the cost of a single repeat on a content-poor
    // shop.
    if (pick == null) {
      const last = candidates[candidates.length - 1];
      if (isNonEmptyString(last)) pick = last;
    }
    out[slot] = pick;
    if (pick) claimed.add(pick);
  }

  // Per-slot curated fallback URLs are exposed alongside the primary
  // pick so callers can hand both to <ShopImage src={x} fallbackSrc={y} />.
  // This is the rescue path for real-world data quality issues — e.g.
  // a seller pasted an intro image URL that has since 404'd. The
  // primary pick still gets rendered first; the curated URL only
  // appears if the browser's onError fires. We deliberately do NOT
  // bake fallback into `out.homepagePromo` itself so the resolver's
  // distinct-per-slot contract stays observable in logs / tests.
  out.fallback = {
    homepagePromo: pickFromBucket("homepagePromo", shop.id),
    aboutHero: pickFromBucket("aboutHero", shop.id),
    contactMapFallback: pickFromBucket("contactMapFallback", shop.id),
  };

  return out;
}
