import { SHOP_COLLECTION_PATH } from "@/lib/shopseo/namespace.js";
import { buildShopSeoCrawlHref } from "@/lib/shopseo/buildShopSeoCrawlHref.js";
import { projectShopSeoCrawlLinks } from "@/lib/shopseo/projectShopSeoCrawlLinks.js";
import { projectShopSeoContextualCrawlLinks } from "@/lib/shopseo/projectShopSeoContextualCrawlLinks.js";
import { SHOP_CRAWL_LIMITS } from "@/lib/shopseo/projectShopSeoCrawlLinks.shared.js";

/**
 * Crawlable HTML link graph for shop SEO landings.
 *
 * SHOP-SEO-LINKGRAPH-03 variants:
 *   - full        → Home (8 cat / 12 vehicle, CTA → collection)
 *   - collection  → Collection (8 / 8, no years, no collection heading)
 *   - contextual  → Deep landings (≤16 “Liên kết liên quan”)
 *   - none        → Year landings — render null
 */
export default function ShopSeoCrawlLinks({
  variant = "full",
  shopBasePath = "",
  categories = [],
  fitments = null,
  vehicleYearRanges = null,
  entity = null,
  className = "",
}) {
  if (variant === "none") return null;

  const collectionHref = buildShopSeoCrawlHref(shopBasePath, SHOP_COLLECTION_PATH);

  if (variant === "contextual") {
    const { related } = projectShopSeoContextualCrawlLinks({
      shopBasePath,
      categories,
      fitments,
      vehicleYearRanges: vehicleYearRanges || undefined,
      entity,
      limit: SHOP_CRAWL_LIMITS.contextual,
    });
    if (related.length === 0) return null;
    return (
      <nav
        aria-label="Liên kết danh mục phụ tùng"
        className={`mt-4 border-t border-gray-100 pt-4 ${className}`}
      >
        <CrawlSection title="Liên kết liên quan">
          <CrawlList items={related} />
        </CrawlSection>
      </nav>
    );
  }

  const preset = variant === "collection" ? "collection" : "full";
  const { categories: categoryLinks, vehicles, years } = projectShopSeoCrawlLinks({
    shopBasePath,
    categories,
    fitments,
    vehicleYearRanges: vehicleYearRanges || undefined,
    preset,
  });

  const hasSections =
    categoryLinks.length > 0 || vehicles.length > 0 || years.length > 0;
  if (!hasSections && variant !== "full") return null;

  return (
    <nav
      aria-label="Liên kết danh mục phụ tùng"
      className={`mt-4 border-t border-gray-100 pt-4 ${className}`}
    >
      {categoryLinks.length > 0 && (
        <CrawlSection title="Danh mục">
          <CrawlList items={categoryLinks} />
        </CrawlSection>
      )}
      {vehicles.length > 0 && (
        <CrawlSection title="Theo dòng xe">
          <CrawlList items={vehicles} />
        </CrawlSection>
      )}
      {years.length > 0 && (
        <CrawlSection title="Đời xe">
          <CrawlList items={years} />
        </CrawlSection>
      )}
      {variant === "full" && (
        <p className="mt-2 mb-0">
          <a
            href={collectionHref}
            className="text-xs font-medium text-[#e60012] hover:underline underline-offset-2"
          >
            Xem tất cả sản phẩm →
          </a>
        </p>
      )}
    </nav>
  );
}

function CrawlSection({ title, children }) {
  return (
    <section className="mb-3 last:mb-0">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CrawlList({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 list-none m-0 p-0">
      {items.map((item) => (
        <li key={item.href}>
          <a
            href={item.href}
            className="text-xs text-gray-600 hover:text-[#e60012] underline-offset-2 hover:underline"
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
