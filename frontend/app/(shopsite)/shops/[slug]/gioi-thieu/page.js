import { notFound } from "next/navigation";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopContactCard from "@/components/shopsite/ShopContactCard";
import ShopRichContentRenderer from "@/components/shopsite/ShopRichContentRenderer";
import ShopIntroClamp from "@/components/shopsite/ShopIntroClamp";
import ShopTenantJsonLd from "@/components/shopsite/ShopTenantJsonLd";
import ShopImage from "@/components/shopsite/ShopImage";
import {
  fetchPublicShop,
  fetchPublicShopSafe,
  fetchPublicShopProductsSafe,
  getShopSeoContext,
} from "@/services/shopPublic.service";
import { buildShopMetadata } from "@/lib/shopsite/buildShopMetadata";
import { buildStorefrontVisuals } from "@/lib/shopsite/storefrontVisuals";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const [shop, seo] = await Promise.all([
    fetchPublicShopSafe(slug),
    getShopSeoContext(slug, "gioi-thieu"),
  ]);
  return buildShopMetadata({
    shop,
    page: { subtitle: "Giới thiệu" },
    canonical: seo.canonical,
    apexDiscoveryMirror: seo.apexDiscoveryMirror,
  });
}

export default async function ShopTenantAboutPage({ params }) {
  const { slug } = await params;
  // Phase: storefront visual diversity. We fetch a small product page
  // alongside the shop so the visual resolver can prefer real product
  // photos before falling back to the curated automotive bucket. The
  // call is `Safe`-suffixed so a transient products outage degrades
  // gracefully (the resolver still has cover + intro + curated set).
  const [shop, productsPage] = await Promise.all([
    fetchPublicShop(slug),
    fetchPublicShopProductsSafe(slug, { perPage: 4, sort: "newest" }),
  ]);
  if (!shop) notFound();

  const intro = shop.introHtml || "";
  const productImages = (productsPage?.items || [])
    .map((p) => p.image)
    .filter(Boolean);

  // Resolves cover + homepagePromo + aboutHero in one pass so the
  // about hero can't accidentally collide with the cover URL the
  // header is already painting at the top of the page. The
  // homepagePromo slot is computed but not rendered here — it still
  // counts as "claimed", which is the point.
  const visuals = buildStorefrontVisuals(shop, {
    products: productImages,
    introHtml: intro,
  });
  const aboutHero = visuals.aboutHero;

  return (
    <>
      <ShopTenantJsonLd slug={slug} subPath="gioi-thieu" shop={shop} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <h1 className="sr-only">{`Giới thiệu ${shop.name}`}</h1>
      <div className="lg:col-span-8 space-y-3">
        <ShopSection title="Giới thiệu" bodyClassName="!p-0">
          {aboutHero && (
            // Mobile compression: gioi-thieu's hero used to repeat the
            // storefront cover. Now resolved through the visual
            // resolver (second intro image → second product image →
            // curated automotive fallback). Aspect ratio drops to
            // 16:9 on phones (vs 16:6 desktop) so the hero stays under
            // ~27% of viewport height and the intro text is reachable
            // without a long scroll.
            <div className="relative aspect-[16/9] sm:aspect-[16/6] overflow-hidden bg-gray-100">
              <ShopImage
                src={aboutHero}
                fallbackSrc={visuals.fallback?.aboutHero}
                alt={`Cửa hàng ${shop.name}`}
                className="absolute inset-0 w-full h-full object-cover"
                fallbackClassName="absolute inset-0 w-full h-full"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent"
              />
            </div>
          )}

          {/* Mobile-clamped intro with "Xem thêm" toggle — desktop
              renders full-height untouched. */}
          <div className="px-3 sm:px-6 py-4 sm:py-5">
            <ShopIntroClamp html={intro} />
          </div>
        </ShopSection>

        <ShopSection title="Thống kê shop">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatBox
              value={
                shop.productCount != null
                  ? Number(shop.productCount).toLocaleString("vi-VN")
                  : "—"
              }
              label="Sản phẩm"
            />
            <StatBox value={`${joinYears(shop)}`} label="Kinh nghiệm" />
            <StatBox value={shop.verified ? "Đã xác minh" : "Đang hoạt động"} label="Trạng thái" />
            <StatBox value={shop.province || "—"} label="Khu vực" />
          </div>
        </ShopSection>
      </div>

      <aside className="lg:col-span-4">
        <ShopContactCard shop={toContactShape(shop)} />
      </aside>
    </div>
    </>
  );
}

function StatBox({ value, label }) {
  // Mobile compression: tighter padding + value font on phones so
  // the 4-box grid stops eating ~280px of vertical scroll.
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-2.5 sm:px-3 py-2.5 sm:py-4 text-center">
      <div className="text-lg sm:text-2xl font-extrabold text-[#e60012] leading-tight">
        {value}
      </div>
      <div className="text-[11px] sm:text-xs text-gray-600 mt-0.5 sm:mt-1">
        {label}
      </div>
    </div>
  );
}

function joinYears(shop) {
  // Prefer the seller-declared `foundedYear` so an established business
  // that just signed up to Otofine doesn't render the misleading "1+
  // năm" derived from createdAt. Falls back to publishedAt → createdAt
  // → "—". The trust.establishedYears value, when present, already
  // implements the same precedence on the backend.
  const currentYear = new Date().getFullYear();
  if (Number.isFinite(Number(shop.foundedYear))) {
    const fy = Math.floor(Number(shop.foundedYear));
    if (fy >= 1900 && fy <= currentYear) {
      const years = Math.max(1, currentYear - fy);
      return `${years}+ năm`;
    }
  }
  const tenureFromBackend = Number(shop?.trust?.establishedYears);
  if (Number.isFinite(tenureFromBackend) && tenureFromBackend >= 1) {
    return `${tenureFromBackend}+ năm`;
  }
  const source = shop.publishedAt || shop.createdAt;
  if (!source) return "—";
  const created = new Date(source);
  if (Number.isNaN(created.getTime())) return "—";
  const years = Math.max(1, currentYear - created.getFullYear());
  return `${years}+ năm`;
}

function toContactShape(shop) {
  return {
    name: shop.name || "",
    phone: shop.phone || "Liên hệ",
    zalo: shop.zalo || shop.phone || "Liên hệ",
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
