import ShopCard from "./ShopCard";
import { fetchPublicShopDirectorySafe } from "@/services/shopPublic.service";

/**
 * Phase 7.1 — reusable "Featured shops" block.
 *
 * Designed to be dropped into the apex homepage in a later phase
 * (the user explicitly asked us NOT to redesign the homepage yet).
 * Kept as a server component so the host page can render it with
 * zero extra JS — analytics tracking happens client-side inside
 * `ShopCard`.
 *
 * Defaults to the top `limit` shops by ranking score. Pass `params`
 * to surface a curated slice (e.g. `{ verified: true, brand: "Toyota" }`).
 *
 * Renders nothing when there are no shops — important so an empty
 * homepage placement doesn't leave an awkward heading + blank grid.
 */
export default async function FeaturedShops({
  limit = 6,
  params = {},
  title = "Shop nổi bật",
  href = "/shops",
}) {
  const data = await fetchPublicShopDirectorySafe({
    ...params,
    perPage: limit,
    sort: params.sort || "rank",
  });
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
