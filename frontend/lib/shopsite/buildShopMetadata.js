import { absoluteUrl, getSiteUrl } from "@/lib/seo/siteUrl";
import { buildShopPrimaryCanonicalUrl } from "@/lib/shopHost";
import { normalizeRichHtml } from "./normalizeRichHtml";
import {
  isStorefrontPageIndexable,
} from "./evaluateStorefrontSeoIndexability";

/**
 * Centralised storefront metadata builder used by every storefront
 * page's `generateMetadata`. Produces a fully-formed Next.js
 * `Metadata` object with:
 *
 *   - Title (per-page suffix + shop name)
 *   - Description (rich-intro stripped to one line, falls back to bio)
 *   - Canonical (computed by the caller, threaded through unchanged)
 *   - OpenGraph (Facebook / Zalo / Messenger preview)
 *   - Twitter card (X.com preview)
 *   - Robots (HARD-NOINDEX during Phase 5.5 — see notes below)
 *
 * Index gating (Phase 6B.6 rollout safety):
 *   Indexing only flips ON when BOTH of the following are true:
 *     1. `process.env.NEXT_PUBLIC_SHOPSITE_INDEX_ENABLED === "1"`
 *        (global feature flag — single env flip to start rollout)
 *     2. `shop.seoIndexable === true`
 *        (per-shop gate: content completeness + healthScore ≥ 60 +
 *         no blocking governance flags — computed on the backend)
 *   Ineligible storefronts emit `robots: { index: false, follow: true }`
 *   so link equity can flow without indexing thin or inactive shops.
 *
 * SSR-safe — the function is a pure projection of its `shop` and
 * `page` arguments; it does NOT touch `headers()` / `cookies()` / DB.
 */
export function buildShopMetadata({ shop, page, canonical }) {
  if (!shop) {
    return {
      title: "Shop không tồn tại — Otofine",
      robots: { index: false, follow: false },
    };
  }

  const safe = projectShop(shop);
  const ctx = page || {};
  const title = composeTitle(safe, ctx);
  const description = composeDescription(safe, ctx);
  const imageUrl = pickImage(safe);
  const canonicalUrl =
    canonical ||
    buildShopPrimaryCanonicalUrl(safe.slug, "") ||
    absoluteUrl(`/shops/${safe.slug}`);

  // Robots gate — see header comment (Phase 6B.6).
  const indexEval = isStorefrontPageIndexable(safe, {
    log: process.env.NODE_ENV === "development",
    slug: safe.slug,
  });

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: indexEval.indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: "Otofine",
      title,
      description,
      url: canonicalUrl,
      locale: "vi_VN",
      images: imageUrl
        ? [{ url: imageUrl, alt: `Ảnh cửa hàng ${safe.name}` }]
        : [],
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function projectShop(shop) {
  return {
    name: (shop.name || "Otofine Shop").trim(),
    slug: shop.slug || "",
    bio: (shop.shortDescription || "").trim(),
    introHtml: shop.introHtml || shop.descriptionHtml || "",
    cover: shop.cover || null,
    avatar: shop.avatar || null,
    productCount: Number(shop.productCount) || 0,
    province: shop.province || null,
    topBrands: Array.isArray(shop.trust?.topBrands)
      ? shop.trust.topBrands.map((b) => b?.brand).filter(Boolean)
      : [],
    seoEligible: shop.seoEligible === true,
    seoIndexable: shop.seoIndexable === true,
    seoIndexReasons: Array.isArray(shop.seoIndexReasons) ? shop.seoIndexReasons : [],
    healthScore: Number(shop.healthScore) || 0,
    healthLabel: shop.healthLabel || null,
    attentionFlags: Array.isArray(shop.attentionFlags) ? shop.attentionFlags : [],
    indexBlockingFlags: Array.isArray(shop.indexBlockingFlags)
      ? shop.indexBlockingFlags
      : [],
    phone: shop.phone || "",
    publicStatus: shop.publicStatus || shop.public_status || "public",
  };
}

function composeTitle(s, page) {
  const brandSuffix = "Otofine";
  const sub = (page.subtitle || "").trim();
  const base = sub ? `${sub} — ${s.name}` : s.name;
  return `${base} | ${brandSuffix}`;
}

function composeDescription(s, page) {
  if (page.description) return clamp(page.description, 160);
  const fromIntro = stripRich(s.introHtml);
  const fromBio = s.bio;
  const base = fromIntro || fromBio || `Phụ tùng ô tô chính hãng tại ${s.name}.`;
  // Append low-noise context to fill the meta description so SERP
  // snippets don't get truncated mid-sentence.
  const tail = composeContextTail(s);
  return clamp(tail ? `${base} ${tail}` : base, 160);
}

function composeContextTail(s) {
  const parts = [];
  if (s.productCount > 0) parts.push(`${s.productCount.toLocaleString("vi-VN")} sản phẩm`);
  if (s.topBrands.length > 0) parts.push(`chuyên ${s.topBrands.slice(0, 2).join(", ")}`);
  if (s.province) parts.push(s.province);
  if (parts.length === 0) return "";
  return `· ${parts.join(" · ")}`;
}

/**
 * Pick the OG image with explicit fallback order. Always returns an
 * absolute URL or null (Facebook silently drops relative-URL og:image).
 *
 *   cover  → preferred (16:9, designed by seller)
 *   avatar → fallback (square, still better than the default site og)
 *   null   → caller renders no OG image; the `images: []` array stays
 *             empty so Facebook does NOT show a broken-image card.
 */
function pickImage(s) {
  const url = s.cover || s.avatar || null;
  return absolutizeUrl(url);
}

function absolutizeUrl(url) {
  if (!url) return null;
  const v = String(url).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  return `${getSiteUrl()}${v.startsWith("/") ? "" : "/"}${v}`;
}

function stripRich(html) {
  if (!normalizeRichHtml(html)) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(s, n) {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
