import ShopCard from "./ShopCard";
import { fetchRelatedShopsSafe } from "@/services/shopPublic.service";

/**
 * Phase 7.1 — "Shop tương tự" block for storefront pages.
 *
 * SSR-rendered server component. Always renders SOMETHING (even on
 * fetch failure) — falls back to a single "Khám phá shop khác" link
 * to `/shops` so the page never has a dead empty section.
 *
 * NOTE: storefronts are noindex (Phase 4 SEO contract), so the inbound
 * links from this section are not a duplicate-content concern. They
 * still help buyers cross-discover suppliers without leaving the
 * storefront browsing flow.
 */
export default async function RelatedShops({ slug, limit = 6 }) {
  if (!slug) return null;
  const payload = await fetchRelatedShopsSafe(slug, limit);
  const items = payload?.items || [];

  if (items.length === 0) {
    return (
      <section
        aria-label="Khám phá thêm shop"
        className="bg-white rounded-2xl shadow-sm p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            Khám phá thêm shop
          </h2>
          <a
            href="/shops"
            className="text-sm font-medium text-[#e60012] hover:underline shrink-0"
          >
            Xem tất cả ›
          </a>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Khám phá danh bạ các shop phụ tùng ô tô trên Otofine.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Shop tương tự"
      className="bg-white rounded-2xl shadow-sm p-4"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-900">Shop tương tự</h2>
        <a
          href="/shops"
          className="text-sm font-medium text-[#e60012] hover:underline shrink-0"
        >
          Xem tất cả ›
        </a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((shop) => (
          <ShopCard
            key={shop.slug}
            shop={shop}
            listSource="related"
            trackImpression
          />
        ))}
      </div>
    </section>
  );
}
