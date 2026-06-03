import { absoluteUrl } from "@/lib/seo/siteUrl";
import { buildShopPrimaryCanonicalUrl } from "@/lib/shopHost";

/**
 * Build the JSON-LD payload for a storefront page.
 *
 * Emits a `@graph` with three schemas — Google + Bing happily merge
 * them and surface the strongest one for the SERP rich-card:
 *
 *   1. AutoPartsStore  (most specific — automotive vertical)
 *   2. LocalBusiness   (geo card with hours + address)
 *   3. Organization    (logo + sameAs for knowledge-panel candidate)
 *
 * Returns an object (NOT a string). The caller stringifies and emits
 * via `<script type="application/ld+json" dangerouslySetInnerHTML />`
 * — see `ShopJsonLd.jsx`.
 *
 * SSR-safe — pure function. No `headers()` / no DB.
 *
 * Indexing safety note (Phase 5.5):
 * The schema is correct even while `robots: noindex` — search engines
 * just won't crawl the page. When indexing flips on, the JSON-LD
 * already validates against the live structured-data testing tools,
 * so there's no second-stage rollout.
 */
export function buildShopJsonLd({ shop, canonicalUrl }) {
  if (!shop) return null;

  const url =
    canonicalUrl ||
    buildShopPrimaryCanonicalUrl(shop.slug || "", "") ||
    absoluteUrl(`/shops/${shop.slug || ""}`);
  const logo = absolutize(shop.avatar);
  const image = absolutize(shop.cover || shop.avatar);
  const address = composeAddress(shop);
  const opening = composeOpeningHoursSpec(shop.workingHoursShort);
  const sameAs = composeSameAs(shop);
  const description = composeShortDescription(shop);
  const productCount = Number(shop.productCount) || 0;

  // Shared identity block — every schema in the graph shares these
  // fields, so cross-references between them line up.
  const core = {
    "@id": `${url}#shop`,
    name: shop.name || "Otofine Shop",
    url,
    ...(logo ? { logo, image: [image || logo] } : {}),
    ...(description ? { description } : {}),
    ...(shop.phone ? { telephone: shop.phone } : {}),
    ...(shop.email ? { email: shop.email } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  const autoPartsStore = {
    "@type": "AutoPartsStore",
    ...core,
    ...(address ? { address } : {}),
    ...(opening ? { openingHoursSpecification: opening } : {}),
    ...(productCount > 0
      ? {
          // Aggregate-inventory hint — surfaces "X sản phẩm" in some
          // rich cards. Not a hard contract; we don't emit fake
          // ratings or stock numbers.
          makesOffer: {
            "@type": "OfferCatalog",
            name: `${shop.name} — phụ tùng ô tô`,
            numberOfItems: productCount,
          },
        }
      : {}),
  };

  const localBusiness = {
    "@type": "LocalBusiness",
    "@id": `${url}#local`,
    name: core.name,
    url,
    ...(logo ? { image: [image || logo] } : {}),
    ...(shop.phone ? { telephone: shop.phone } : {}),
    ...(address ? { address } : {}),
    ...(opening ? { openingHoursSpecification: opening } : {}),
  };

  const organization = {
    "@type": "Organization",
    "@id": `${url}#org`,
    name: core.name,
    url,
    ...(logo ? { logo } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [autoPartsStore, localBusiness, organization],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function absolutize(url) {
  if (!url) return null;
  const v = String(url).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  return absoluteUrl(v.startsWith("/") ? v : `/${v}`);
}

function composeAddress(shop) {
  // shop.address is the rendered string (addressDetail). Without
  // explicit province/ward fields we fall back to a single
  // streetAddress entry — Google still parses it.
  const street = (shop.address || "").trim();
  if (!street) return null;
  return {
    "@type": "PostalAddress",
    streetAddress: street,
    ...(shop.province ? { addressRegion: shop.province } : {}),
    addressCountry: "VN",
  };
}

/**
 * Parse a free-form working-hours string into Schema.org's
 * OpeningHoursSpecification array.
 *
 * Tolerates patterns like:
 *   "08:00 - 18:00 (T2 - T7)"
 *   "8:00 - 17:00"
 *   "8h - 18h | T2 - CN"
 *
 * Returns `null` for anything we can't confidently parse — we'd
 * rather emit no opening hours than wrong ones.
 */
function composeOpeningHoursSpec(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  const hours = lower.match(/(\d{1,2})\s*[h:]\s*(\d{0,2})\s*[-–—]\s*(\d{1,2})\s*[h:]\s*(\d{0,2})/);
  if (!hours) return null;
  const opens = pad(hours[1], hours[2]);
  const closes = pad(hours[3], hours[4]);
  return [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: parseDays(lower),
      opens,
      closes,
    },
  ];
}

function pad(h, m) {
  const hh = String(Math.max(0, Math.min(23, parseInt(h, 10) || 0))).padStart(2, "0");
  const mm = String(Math.max(0, Math.min(59, parseInt(m, 10) || 0))).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseDays(s) {
  // T2..CN handling. Fallback = Mon–Sat (common Vietnamese auto shop
  // pattern).
  if (/cn|chu\s*nh[aâ]t|all\s*days|24\/7/.test(s)) {
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  }
  if (/t[2hai].*t[7bay]/.test(s)) {
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  }
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
}

function composeSameAs(shop) {
  const out = [];
  if (shop.facebook?.url) out.push(shop.facebook.url);
  if (shop.website) out.push(shop.website);
  return out.filter((u) => /^https?:\/\//i.test(u));
}

function composeShortDescription(shop) {
  const bio = (shop.shortDescription || shop.bio || "").trim();
  if (bio) return bio.length > 280 ? `${bio.slice(0, 279)}…` : bio;
  return "";
}
