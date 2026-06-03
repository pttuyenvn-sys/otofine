import { Suspense } from "react";
import { notFound } from "next/navigation";
import ShopImage from "@/components/shopsite/ShopImage";
import ShopFilters from "@/components/shopsite/ShopFilters";
import ShopMobileFilters from "@/components/shopsite/ShopMobileFilters";
import ShopMobileCategories from "@/components/shopsite/ShopMobileCategories";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopProductCard from "@/components/shopsite/ShopProductCard";
import ShopSidebar from "@/components/shopsite/ShopSidebar";
import ShopContactCard from "@/components/shopsite/ShopContactCard";
// Bug-fix Phase A.1: Zalo contact resolution. Mirrors the backend
// helper to guarantee the storefront contact card never renders a
// stale public-page value while /shop/settings shows the new one.
import { resolveShopZalo } from "@/lib/shopsite/resolveShopZalo";
import RelatedShops from "@/components/shopsite/RelatedShops";
import {
  fetchPublicShop,
  fetchPublicShopSafe,
  fetchPublicShopProductsSafe,
  fetchPublicShopCategoriesSafe,
  fetchPublicShopFitmentsSafe,
  getShopBasePath,
  getShopStorefrontCanonical,
} from "@/services/shopPublic.service";
import { buildShopMetadata } from "@/lib/shopsite/buildShopMetadata";
import { buildStorefrontVisuals } from "@/lib/shopsite/storefrontVisuals";
import { isWildcardStorefrontHost } from "@/lib/shopsite/isWildcardStorefrontHost";
import ShopWhyChooseUs from "@/components/shopsite/ShopWhyChooseUs";
import ShopLiveActivityStrip from "@/components/shopsite/ShopLiveActivityStrip";
import ShopTrustedSellerBlock from "@/components/shopsite/ShopTrustedSellerBlock";
import ShopSocialProofPills from "@/components/shopsite/ShopSocialProofPills";
import ShopGallery from "@/components/shopsite/ShopGallery";
import ShopReturnVisitorBanner from "@/components/shopsite/ShopReturnVisitorBanner";
import ShopRecentlyViewed from "@/components/shopsite/ShopRecentlyViewed";

const FILTERS_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[72px] animate-pulse" />
);
const SIDEBAR_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[320px] animate-pulse" />
);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const shop = await fetchPublicShopSafe(slug);
  const canonical = await getShopStorefrontCanonical(shop, slug, "");
  return buildShopMetadata({ shop, page: { subtitle: "Phụ tùng ô tô" }, canonical });
}

export default async function ShopTenantHomePage({ params }) {
  const { slug } = await params;

  // Phase 5.7 — Only the shop fetch is mandatory; the other three
  // degrade gracefully so a transient categories/fitments outage
  // doesn't break the page.
  const [shop, productsPage, categoriesPayload, fitments] = await Promise.all([
    fetchPublicShop(slug),
    fetchPublicShopProductsSafe(slug, { perPage: 5, sort: "newest" }),
    fetchPublicShopCategoriesSafe(slug),
    fetchPublicShopFitmentsSafe(slug),
  ]);

  if (!shop) notFound();

  const basePath = await getShopBasePath(shop.slug);
  // Branded-storefront mode: when the visitor is on
  // `<slug>.otofine.com` we hide cross-shop discovery widgets so the
  // page feels like the seller's own website, not a marketplace
  // funnel back to competitors. Apex `/shops/<slug>` keeps them.
  const isBrandedSubdomain = await isWildcardStorefrontHost();
  const featured = (productsPage?.items || []).slice(0, 5);
  const categories = (categoriesPayload?.items || []).slice(0, 7).map((c, i) => ({
    id: c.id ?? i,
    name: c.name,
    slug: c.slug || String(c.id),
  }));

  // Storefront visual diversity pass — resolve all hero/promo slots
  // together so the same image never appears in two places. Cover is
  // claimed first (it's the seller's deliberate brand image); the
  // promo banner then pulls from intro images / product images /
  // curated automotive fallback, automatically skipping anything the
  // cover already claimed.
  const visuals = buildStorefrontVisuals(shop, {
    products: featured.map((p) => p.image).filter(Boolean),
    introHtml: shop.introHtml,
  });

  return (
    <div className="space-y-3">
      {/* Live activity strip — sits between hero and filters so the
          status signals (đang mở cửa / phản hồi ~15 phút / X+ SP /
          chuyên hãng X) are the first thing the buyer reads after
          the cover. Pure SSR — every chip derives from existing
          shop fields (workingHoursShort, trust.quickResponse,
          productCount, trust.topBrands). */}
      <ShopLiveActivityStrip shop={shop} />

      {/* Social proof pills under the live strip — historical /
          tenure signals to complement the "right now" strip above. */}
      <ShopSocialProofPills shop={shop} className="px-1 -mt-1" />

      {/* Conversion engine — return-visitor banner. Pure client
          island: renders nothing on first visit and nothing on
          server. When a buyer comes back >30 min after their last
          session it surfaces the "Chào mừng quay lại" greeting
          with shortcuts to the recently-viewed strip + Quick RFQ. */}
      <ShopReturnVisitorBanner
        shopId={shop.id}
        shopName={shop.name}
        shopSlug={shop.slug}
      />

      {/* Mobile filter row (search + Lọc drawer) lives ABOVE the
          desktop filter row in the DOM, but only one is visible at
          a time thanks to `lg:hidden` / `hidden lg:block`. */}
      <Suspense fallback={FILTERS_FALLBACK}>
        <ShopMobileFilters fitments={fitments} basePath={basePath} />
      </Suspense>
      <Suspense fallback={FILTERS_FALLBACK}>
        <ShopFilters fitments={fitments} basePath={basePath} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Mobile compression: hide the bulky "Về chúng tôi" 4-chip
            block and the duplicated promo banner on phones (they
            push the product grid + categories far below the fold,
            and the chips/banner add no decision value the user
            doesn't already get from the hero + floating CTAs).
            Desktop keeps both as-is. */}
        <div className="hidden lg:block lg:col-span-4">
          <AboutCard shop={shop} />
        </div>
        <div className="hidden lg:block lg:col-span-5">
          <PromoBanner
            basePath={basePath}
            promoImage={visuals.homepagePromo}
            promoFallback={visuals.fallback?.homepagePromo}
          />
        </div>
        <div className="hidden lg:block lg:col-span-3">
          {/* Phase 5.1 — sticky on desktop so the buyer can always
              reach the phone/zalo/facebook actions while browsing the
              product grid below. Mobile stays unaffected because the
              floating bottom CTA covers the same intent. */}
          <div className="lg:sticky lg:top-[72px]">
            <ShopContactCard shop={toContactShape(shop)} />
          </div>
        </div>
      </div>

      {/* Mobile categories trigger (drawer) — surfaced ABOVE the
          product grid so phone users can scope their browsing
          without first scrolling through the entire catalogue. */}
      <ShopMobileCategories categories={categories} basePath={basePath} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3">
        <div className="lg:col-span-9">
          <ShopSection
            title="Sản phẩm nổi bật"
            rightHref={`${basePath}/san-pham`}
            bodyClassName="!p-2 sm:!p-3"
          >
            {featured.length === 0 ? (
              <EmptyState message="Shop chưa có sản phẩm nào." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                {featured.map((product, idx) => (
                  <ShopProductCard
                    key={product.id}
                    product={product}
                    shopSlug={shop.slug}
                    shopPhone={shop.phone || null}
                    /* First row only — give LCP-adjacent products a
                       fetchpriority hint so they paint with the hero
                       instead of waiting in the lazy queue. */
                    priority={idx < 3}
                  />
                ))}
              </div>
            )}
          </ShopSection>
        </div>
        <div className="lg:col-span-3">
          <Suspense fallback={SIDEBAR_FALLBACK}>
            <ShopSidebar categories={categories} basePath={basePath} />
          </Suspense>
        </div>
      </div>

      {/*
        Conversion engine — "Bạn vừa xem" recently-viewed strip.
        Pure client island that reads from the same localStorage
        slot ProductDetail.jsx writes to (`recentlyViewed` helper).
        SSR HTML is empty; the strip only paints after mount AND
        only when the buyer has at least one viewed product (no
        empty "ghost" slot for first-time visitors). Anchor id
        matches the return-visitor banner's "Xem lại sản phẩm" link.
      */}
      <div id="recently-viewed">
        <ShopRecentlyViewed />
      </div>

      {/*
        Phase: branded ownership — auto-generated "Vì sao khách chọn
        chúng tôi" trust section. SSR-pure, derives every chip from
        existing shop fields (verified / response signals / product
        count / years active). Renders on apex AND subdomain.
      */}
      <ShopWhyChooseUs shop={shop} />

      {/*
        Phase: live commerce — image gallery aggregated from existing
        seller content (cover + intro images + product images), with
        de-dup against the visuals already claimed by the hero / about
        slots. Skips render when fewer than 4 unique images exist.
      */}
      <ShopGallery
        shop={shop}
        products={(productsPage?.items || []).slice(0, 18)}
        visuals={visuals}
      />

      <ServiceFooter />

      {/*
        Phase 7.1 — related shops, marketplace-only.
        Hidden on wildcard storefront subdomains so the seller's
        branded URL doesn't funnel traffic to competitors. The
        section still ships SSR on apex `/shops/<slug>` where the
        marketplace discovery loop is the whole point.
      */}
      {!isBrandedSubdomain && (
        <Suspense
          fallback={
            <div className="bg-white rounded-2xl shadow-sm h-[240px] animate-pulse" />
          }
        >
          <RelatedShops slug={shop.slug} limit={6} />
        </Suspense>
      )}
    </div>
  );
}

function AboutCard({ shop }) {
  // Branding pass: drop the legacy seller-asserted 4-chip block
  // ("Sản phẩm chính hãng / Giá cả cạnh tranh / Tư vấn / Giao toàn
  // quốc") in favour of `ShopTrustedSellerBlock`, which derives
  // every line from a REAL shop field (verified / address / phone /
  // public shop / has products). Same vertical footprint, but the
  // claims now mean something.
  return (
    <ShopSection title="Về chúng tôi" className="h-full">
      <p className="text-sm text-gray-700 leading-relaxed">
        {shop.shortDescription || `Shop ${shop.name} trên Otofine.`}
      </p>
      <ShopTrustedSellerBlock shop={shop} />
    </ShopSection>
  );
}

function PromoBanner({ basePath, promoImage, promoFallback }) {
  // The promo image is resolved upstream via `buildStorefrontVisuals`
  // so we're guaranteed not to be reusing `shop.cover` here. If the
  // shop has neither uploaded promo nor intro/product imagery, the
  // resolver lands on a curated automotive fallback bucket that is
  // disjoint from the about-hero bucket — same shop, different image
  // per slot. `promoFallback` is the curated rescue URL the resolver
  // exposes so a broken seller-supplied primary doesn't leave the
  // banner as a bare gradient.
  return (
    <div className="relative h-full min-h-[200px] rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 text-white shadow-sm">
      <ShopImage
        src={promoImage}
        fallbackSrc={promoFallback}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-60"
        fallbackClassName="absolute inset-0 w-full h-full"
        fallback={null}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/10" />
      <div className="relative h-full p-5 sm:p-6 flex flex-col justify-center">
        <div className="text-[#e60012] text-xs font-semibold tracking-widest">
          PHỤ TÙNG CHÍNH HÃNG
        </div>
        <div className="mt-1 text-2xl sm:text-3xl font-extrabold leading-tight">
          UY TÍN - CHẤT LƯỢNG
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold leading-tight">
          TẠO NIỀM TIN
        </div>
        <a
          href={`${basePath}/san-pham`}
          className="mt-3 inline-flex w-fit items-center gap-1 bg-[#e60012] hover:bg-[#c1000f] text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          Xem ngay ›
        </a>
      </div>
    </div>
  );
}

function ServiceFooter() {
  const items = [
    { key: "authentic", title: "CAM KẾT CHÍNH HÃNG", desc: "100% sản phẩm chính hãng" },
    { key: "return", title: "ĐỔI TRẢ DỄ DÀNG", desc: "Đổi trả trong 7 ngày" },
    { key: "ship", title: "GIAO HÀNG TOÀN QUỐC", desc: "Giao nhanh - đúng hẹn" },
    { key: "advice", title: "TƯ VẤN MIỄN PHÍ", desc: "Hỗ trợ 24/7" },
  ];
  // Mobile compression: this 4-tile commitments strip is hidden on
  // phones — the same "chính hãng / đổi trả / giao toàn quốc" signals
  // already surface in the trust-badge strip directly under the
  // hero. Keeping it on desktop where there's slack vertical space.
  return (
    <section className="hidden lg:block bg-white rounded-2xl shadow-sm p-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 text-[#e60012] shrink-0"
            >
              ●
            </span>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight">
                {item.title}
              </div>
              <div className="text-[11px] sm:text-xs text-gray-500 leading-tight">
                {item.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ message }) {
  return (
    <div className="py-10 text-center text-sm text-gray-500">{message}</div>
  );
}

function toContactShape(shop) {
  // Bug-fix Phase A.1: normalize zalo via the helper so the contact
  // card and the floating CTA share a single source of truth. The
  // "Liên hệ" placeholder only renders when the helper returns "" AND
  // there's no phone fallback (preserved by passing phoneFallback).
  const resolvedZalo = resolveShopZalo(shop, { phoneFallback: true });
  return {
    name: shop.name || "",
    phone: shop.phone || "Liên hệ",
    zalo: resolvedZalo || "Liên hệ",
    facebook: shop.facebook || { label: "Facebook", url: "#" },
    email: shop.email || "",
    address: shop.address || "Đang cập nhật",
    province: shop.province || "",
    lat: typeof shop.lat === "number" ? shop.lat : null,
    lng: typeof shop.lng === "number" ? shop.lng : null,
    mapEmbedUrl: shop.mapEmbedUrl || null,
    workingHoursLines:
      Array.isArray(shop.workingHoursLines) && shop.workingHoursLines.length > 0
        ? shop.workingHoursLines
        : ["Liên hệ shop để biết giờ làm việc"],
  };
}
