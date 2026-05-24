import { Suspense } from "react";
import { notFound } from "next/navigation";
import ShopFilters from "@/components/shopsite/ShopFilters";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopProductCard from "@/components/shopsite/ShopProductCard";
import ShopSidebar from "@/components/shopsite/ShopSidebar";
import ShopContactCard from "@/components/shopsite/ShopContactCard";
import {
  fetchPublicShop,
  fetchPublicShopProducts,
  fetchPublicShopCategories,
  fetchPublicShopFitments,
  getShopBasePath,
  getShopCanonicalUrl,
} from "@/services/shopPublic.service";

const FILTERS_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[72px] animate-pulse" />
);
const SIDEBAR_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[320px] animate-pulse" />
);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { alternates: { canonical: await getShopCanonicalUrl(slug, "") } };
}

export default async function ShopTenantHomePage({ params }) {
  const { slug } = await params;

  const [shop, productsPage, categoriesPayload, fitments] = await Promise.all([
    fetchPublicShop(slug),
    fetchPublicShopProducts(slug, { perPage: 5, sort: "newest" }),
    fetchPublicShopCategories(slug),
    fetchPublicShopFitments(slug),
  ]);

  if (!shop) notFound();

  const basePath = await getShopBasePath(shop.slug);
  const featured = (productsPage?.items || []).slice(0, 5);
  const categories = (categoriesPayload?.items || []).slice(0, 7).map((c, i) => ({
    id: c.id ?? i,
    name: c.name,
    slug: c.slug || String(c.id),
  }));

  return (
    <div className="space-y-3">
      <Suspense fallback={FILTERS_FALLBACK}>
        <ShopFilters fitments={fitments} basePath={basePath} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-4">
          <AboutCard shop={shop} />
        </div>
        <div className="lg:col-span-5">
          <PromoBanner basePath={basePath} cover={shop.cover} />
        </div>
        <div className="lg:col-span-3">
          <ShopContactCard shop={toContactShape(shop)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-9">
          <ShopSection
            title="Sản phẩm nổi bật"
            rightHref={`${basePath}/san-pham`}
            bodyClassName="!p-3"
          >
            {featured.length === 0 ? (
              <EmptyState message="Shop chưa có sản phẩm nào." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {featured.map((product) => (
                  <ShopProductCard key={product.id} product={product} />
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

      <ServiceFooter />
    </div>
  );
}

function AboutCard({ shop }) {
  return (
    <ShopSection title="Về chúng tôi" className="h-full">
      <p className="text-sm text-gray-700 leading-relaxed">
        {shop.shortDescription || `Shop ${shop.name} trên Otofine.`}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {[
          { key: "authentic", title: "Sản phẩm chính hãng" },
          { key: "price", title: "Giá cả cạnh tranh" },
          { key: "advice", title: "Tư vấn chuyên nghiệp" },
          { key: "ship", title: "Giao hàng toàn quốc" },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2 bg-red-50/60 rounded-xl px-3 py-2 text-xs text-gray-700"
          >
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-[#e60012] shadow-sm border border-red-100"
            >
              ●
            </span>
            <span className="leading-tight">{item.title}</span>
          </div>
        ))}
      </div>
    </ShopSection>
  );
}

function PromoBanner({ basePath, cover }) {
  return (
    <div className="relative h-full min-h-[200px] rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 text-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover || "https://images.unsplash.com/photo-1486496146582-9ffcd0b2b2b7?auto=format&fit=crop&w=1200&q=70"}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-60"
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
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4">
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
  return {
    phone: shop.phone || "Liên hệ",
    zalo: shop.zalo || shop.phone || "Liên hệ",
    facebook: shop.facebook || { label: "Facebook", url: "#" },
    email: shop.email || "",
    address: shop.address || "Đang cập nhật",
    workingHoursLines:
      Array.isArray(shop.workingHoursLines) && shop.workingHoursLines.length > 0
        ? shop.workingHoursLines
        : ["Liên hệ shop để biết giờ làm việc"],
  };
}
