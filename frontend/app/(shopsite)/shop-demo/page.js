import { Suspense } from "react";
import ShopFilters from "@/components/shopsite/ShopFilters";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopProductCard from "@/components/shopsite/ShopProductCard";
import ShopSidebar from "@/components/shopsite/ShopSidebar";
import ShopContactCard from "@/components/shopsite/ShopContactCard";
import { shopDemo } from "@/data/shop-demo";

// The new Client filter row + sidebar both call `useSearchParams()` so
// Next.js 15 requires a Suspense boundary when the parent page is
// statically prerendered (shop-demo is). We keep static rendering for
// the rest of the layout and just isolate the dynamic widgets.
const FILTERS_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[72px] animate-pulse" />
);
const SIDEBAR_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[320px] animate-pulse" />
);

export default function ShopDemoHomePage() {
  return (
    <div className="space-y-3">
      <Suspense fallback={FILTERS_FALLBACK}>
        <ShopFilters basePath="/shop-demo" />
      </Suspense>

      {/* About + Promo + Contact */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-4">
          <AboutCard />
        </div>
        <div className="lg:col-span-5">
          <PromoBanner />
        </div>
        <div className="lg:col-span-3">
          <ShopContactCard shop={shopDemo} />
        </div>
      </div>

      {/* Featured products + Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-9">
          <ShopSection
            title="Sản phẩm nổi bật"
            rightHref="/shop-demo/san-pham"
            bodyClassName="!p-3"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {shopDemo.featuredProducts.map((product) => (
                <ShopProductCard key={product.id} product={product} />
              ))}
            </div>
          </ShopSection>
        </div>
        <div className="lg:col-span-3">
          <Suspense fallback={SIDEBAR_FALLBACK}>
            <ShopSidebar categories={shopDemo.categories} />
          </Suspense>
        </div>
      </div>

      {/* Service highlights footer */}
      <ServiceFooter />
    </div>
  );
}

function AboutCard() {
  return (
    <ShopSection title="Về chúng tôi" className="h-full">
      <p className="text-sm text-gray-700 leading-relaxed">{shopDemo.intro}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {shopDemo.serviceHighlights.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2 bg-red-50/60 rounded-xl px-3 py-2 text-xs text-gray-700"
          >
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-[#e60012] shadow-sm border border-red-100"
            >
              {iconFor(item.icon)}
            </span>
            <span className="leading-tight">{item.title}</span>
          </div>
        ))}
      </div>
    </ShopSection>
  );
}

function PromoBanner() {
  const promo = shopDemo.promoBanner;
  return (
    <div className="relative h-full min-h-[200px] rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 text-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://images.unsplash.com/photo-1486496146582-9ffcd0b2b2b7?auto=format&fit=crop&w=1200&q=70"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/10" />
      <div className="relative h-full p-5 sm:p-6 flex flex-col justify-center">
        <div className="text-[#e60012] text-xs font-semibold tracking-widest">
          {promo.title}
        </div>
        <div className="mt-1 text-2xl sm:text-3xl font-extrabold leading-tight">
          {promo.headline}
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold leading-tight">
          {promo.headline2}
        </div>
        <a
          href={promo.href}
          className="mt-3 inline-flex w-fit items-center gap-1 bg-[#e60012] hover:bg-[#c1000f] text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          {promo.cta} ›
        </a>
      </div>
    </div>
  );
}

function ServiceFooter() {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {shopDemo.serviceFooter.map((item) => (
          <div key={item.key} className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 text-[#e60012] shrink-0"
            >
              {iconFor(item.icon)}
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

function iconFor(name) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  switch (name) {
    case "shield":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" {...stroke} aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "tag":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" {...stroke} aria-hidden>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case "headphones":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" {...stroke} aria-hidden>
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zm-18 0a2 2 0 0 0 2 2h1v-7H3z" />
        </svg>
      );
    case "truck":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" {...stroke} aria-hidden>
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case "rotate":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" {...stroke} aria-hidden>
          <polyline points="1 4 1 10 7 10" />
          <polyline points="23 20 23 14 17 14" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      );
    default:
      return <span>•</span>;
  }
}
