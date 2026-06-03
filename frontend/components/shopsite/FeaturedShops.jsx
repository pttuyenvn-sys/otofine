import ShopCard from "./ShopCard";
import { fetchFeaturedStorefrontsSafe } from "@/services/shopPublic.service";

/**
 * Phase 6E.1 — reusable "Featured shops" block.
 *
 * Uses the featured discovery endpoint (readiness + quality + governance)
 * instead of generic directory ranking. Renders nothing when empty.
 */
export default async function FeaturedShops({
  limit = 12,
  title = "Shop nổi bật",
  href = "/shops",
}) {
  const data = await fetchFeaturedStorefrontsSafe({ limit });
  const items = (data?.items || []).slice(0, limit);
  if (items.length === 0) return null;

  return (
    <section aria-label={title} className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {href && (
          <a
            href={href}
            className="text-sm font-medium text-[#e60012] hover:underline shrink-0"
          >
            Xem tất cả ›
          </a>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((shop) => (
          <ShopCard
            key={shop.slug}
            shop={shop}
            listSource="featured"
            trackImpression
          />
        ))}
      </div>
    </section>
  );
}
