import { notFound } from "next/navigation";
import ShopHeader from "@/components/shopsite/ShopHeader";
import ShopTabs from "@/components/shopsite/ShopTabs";
import ShopFloatingMobileCTA from "@/components/shopsite/ShopFloatingMobileCTA";
import ShopAnalyticsBoot from "@/components/shopsite/ShopAnalyticsBoot";
import ShopJsonLd from "@/components/shopsite/ShopJsonLd";
import { deriveShopTrustBadges } from "@/lib/shopsite/shopTrustBadges";
import { buildShopMetadata } from "@/lib/shopsite/buildShopMetadata";
import { buildShopJsonLd } from "@/lib/shopsite/buildShopJsonLd";
import {
  fetchPublicShop,
  fetchPublicShopSafe,
  getShopBasePath,
  getShopCanonicalUrl,
} from "@/services/shopPublic.service";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const shop = await fetchPublicShopSafe(slug);
  if (!shop) {
    return {
      title: "Shop không tồn tại — Otofine",
      robots: { index: false, follow: false },
    };
  }
  // Layout metadata is the *fallback* for pages that don't override it.
  // Each concrete page (homepage / san-pham / gioi-thieu / lien-he)
  // sets its own canonical + page-scoped title via generateMetadata
  // to avoid duplicate canonical surface. We build a complete
  // OG / Twitter / robots payload here so social previews work even
  // for pages that haven't overridden it.
  return buildShopMetadata({
    shop,
    page: { subtitle: "Phụ tùng ô tô" },
    canonical: await getShopCanonicalUrl(slug, ""),
  });
}

/**
 * Dynamic shop tenant layout. Reads slug from URL params, calls the
 * public API once for the chrome (cover, avatar, name, contact CTAs).
 *
 * Fallback (shop missing OR public_status != 'public') → next/notFound().
 * The render passes `basePath="/shops/<slug>"` to ShopTabs so the four
 * tabs route correctly under the dynamic prefix.
 */
export default async function ShopTenantLayout({ children, params }) {
  const { slug } = await params;
  const shop = await fetchPublicShop(slug);
  if (!shop) {
    // Single source of "unknown shop" observability. The backend
    // logs its own cache hit/miss separately; this line tells us
    // the user-facing page actually 404'd, which is the more
    // actionable signal for spotting bad inbound traffic.
    console.warn(`[shopsite] event=ssr.unknown-shop slug=${slug}`);
    notFound();
  }

  // When the request arrived via cuahangoto355.otofine.com (subdomain
  // rewrite from middleware) we generate root-relative tab links so
  // the pretty URL stays sticky after a click. When the request hit
  // apex (`https://otofine.com/shops/<slug>`), we keep the full
  // /shops/<slug> prefix so the URL remains routable.
  const basePath = await getShopBasePath(shop.slug);
  const badges = deriveShopTrustBadges(shop);
  // Phase 5.5 — emit the AutoPartsStore / LocalBusiness / Organization
  // JSON-LD once at the layout level so all 4 tabs share the same
  // structured-data block. Safe even under noindex: search engines
  // simply won't read it until indexing flips on.
  const jsonLd = buildShopJsonLd({
    shop,
    canonicalUrl: await getShopCanonicalUrl(shop.slug, ""),
  });

  return (
    <>
      <ShopHeader shop={mapToHeaderShape(shop)} badges={badges} />
      <ShopTabs basePath={basePath} />
      {/*
        Phase 5.1 — bottom padding reserves room for the fixed mobile
        CTA bar so it never covers the last row of products / footer.
        Desktop ignores the padding (sm:pb-0).
      */}
      <main className="space-y-3 pb-24 sm:pb-0">{children}</main>
      <footer className="py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} {shop.name} · Powered by{" "}
        <a
          href="https://otofine.com"
          className="text-[#e60012] hover:underline font-medium"
        >
          Otofine
        </a>
      </footer>

      {/* Phase 5.1 — conversion layer islands. Both are SSR-safe
          (`use client` only on interactive bits) and bail when there's
          no contact data. */}
      <ShopFloatingMobileCTA shop={mapToCtaShape(shop)} />
      <ShopAnalyticsBoot shopSlug={shop.slug} shopName={shop.name} />

      {/* Phase 5.5 — structured data for search engines. */}
      <ShopJsonLd payload={jsonLd} />
    </>
  );
}

/**
 * Bridge API DTO (snake-ish / camelCase mix) to the shape ShopHeader.jsx
 * expects (originally fed by the Phase 1 hardcoded shopDemo object).
 * Defaults preserve a sane UI when fields are NULL in the DB.
 */
function mapToHeaderShape(shop) {
  return {
    slug: shop.slug,
    name: shop.name,
    shortDescription: shop.shortDescription || "",
    verified: !!shop.verified,
    avatar: shop.avatar,
    cover: shop.cover,
    phone: shop.phone || "",
    zalo: shop.zalo || shop.phone || "",
    province: shop.province || "Việt Nam",
    rating: 4.9,
    ratingCount: 0,
    customerCount: shop.productCount
      ? `${Math.max(1, Math.floor(shop.productCount / 100))}k+`
      : "—",
    workingHoursShort: shop.workingHoursShort || "Liên hệ shop",
  };
}

/**
 * Minimal shape needed by the floating mobile CTA. Kept separate from
 * `mapToHeaderShape` so the CTA component never accidentally depends
 * on cosmetic fields (rating, customerCount, …).
 */
function mapToCtaShape(shop) {
  return {
    slug: shop.slug,
    phone: shop.phone || "",
    zalo: shop.zalo || shop.phone || "",
    facebook: shop.facebook || null,
  };
}
