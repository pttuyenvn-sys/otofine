import { notFound } from "next/navigation";
import ShopHeader from "@/components/shopsite/ShopHeader";
import ShopTabs from "@/components/shopsite/ShopTabs";
import ShopFloatingMobileCTA from "@/components/shopsite/ShopFloatingMobileCTA";
import ShopAnalyticsBoot from "@/components/shopsite/ShopAnalyticsBoot";
import StorefrontAnalyticsForwarder from "@/components/shopsite/StorefrontAnalyticsForwarder";
import StorefrontSellerShortcut from "@/components/shopsite/StorefrontSellerShortcut";
import StorefrontOwnerStrip from "@/components/shopsite/StorefrontOwnerStrip";
import ShopJsonLd from "@/components/shopsite/ShopJsonLd";
import ShopQuickRfqLauncher from "@/components/shopsite/ShopQuickRfqLauncher";
import ShopContactMiniDrawer from "@/components/shopsite/ShopContactMiniDrawer";
import { deriveShopTrustBadges } from "@/lib/shopsite/shopTrustBadges";
import { buildShopMetadata } from "@/lib/shopsite/buildShopMetadata";
import { buildShopJsonLd } from "@/lib/shopsite/buildShopJsonLd";
import {
  canonicalShopSlug,
  ensureCanonicalShopSlug,
} from "@/lib/shopsite/ensureCanonicalShopSlug";
// Bug-fix Phase A.1: shared normalization for the Zalo contact. Even
// though the backend now COALESCEs zalo over zalo_phone, we run the
// header + CTA through the same helper so any future DTO refactor
// (or transient API skew during a deploy) can't reintroduce drift.
import { resolveShopZalo } from "@/lib/shopsite/resolveShopZalo";
import {
  fetchPublicShopSafe,
  getShopBasePath,
  getShopStorefrontCanonical,
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
    canonical: await getShopStorefrontCanonical(shop, slug, ""),
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
  const shop = await ensureCanonicalShopSlug(slug);
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
    canonicalUrl: await getShopStorefrontCanonical(shop, slug, ""),
  });

  return (
    <>
      {/* Owner-only status strip — invisible to anonymous visitors
          and to sellers of OTHER shops. Renders client-side after
          hydration so SSR stays customer-first. */}
      <StorefrontOwnerStrip shopId={shop.id} shopName={shop.name} />
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
      {/* Forwards every `shopsite:event` CustomEvent to the seller-side
          metrics ingest endpoint. Pure client island — SSR sees null,
          adblockers / CSP errors are silently absorbed. */}
      <StorefrontAnalyticsForwarder shopSlug={shop.slug} />

      {/* Seller ↔ storefront connectivity: an ownership-gated floating
          chip that lets the shop owner jump back into the seller
          workspace without leaving the public page. Renders null for
          unauthenticated visitors and for any seller who isn't the
          owner of THIS shop, so customer-facing UX stays untouched. */}
      <StorefrontSellerShortcut shopId={shop.id} />

      {/* Phase: live commerce — floating "Tìm phụ tùng nhanh" pill
          (desktop) + page-level Quick-RFQ modal. Mounted at the layout
          level so the modal is reachable from any storefront subpage
          (home, san-pham, gioi-thieu, lien-he). Product cards
          dispatch `shopsite:openQuickRfq` to spawn the same modal
          with pre-filled fields. */}
      <ShopQuickRfqLauncher shop={{ id: shop.id, slug: shop.slug, name: shop.name }} />

      {/* Phase: conversion engine — mount-once mobile contact drawer.
          Any CTA in the tree (floating bottom bar, product card, the
          return-visitor banner, etc.) opens it by dispatching
          `shopsite:openContactDrawer`. Body bundle is lazy-loaded the
          first time the drawer is opened. */}
      <ShopContactMiniDrawer
        shop={{
          slug: shop.slug,
          name: shop.name,
          phone: shop.phone || "",
          zalo: resolveShopZalo(shop, { phoneFallback: true }),
          facebook: shop.facebook || null,
          address: shop.address || "",
          addressDetail: shop.addressDetail || "",
          province: shop.province || "",
          lat: typeof shop.lat === "number" ? shop.lat : null,
          lng: typeof shop.lng === "number" ? shop.lng : null,
        }}
      />

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
    // Bug-fix Phase A.1: normalize via the helper. `phoneFallback: true`
    // preserves the legacy "soft fallback" where a shop with no Zalo
    // surfaces the phone number on the Zalo button — better than a
    // dead link.
    zalo: resolveShopZalo(shop, { phoneFallback: true }),
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
    zalo: resolveShopZalo(shop, { phoneFallback: true }),
    facebook: shop.facebook || null,
  };
}
