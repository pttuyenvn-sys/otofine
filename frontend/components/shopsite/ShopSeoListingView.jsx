import { Suspense } from "react";
import ShopFilters from "@/components/shopsite/ShopFilters";
import ShopMobileFilters from "@/components/shopsite/ShopMobileFilters";
import ShopMobileCategories from "@/components/shopsite/ShopMobileCategories";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopProductCard from "@/components/shopsite/ShopProductCard";
import ShopSidebar from "@/components/shopsite/ShopSidebar";
import {
  ShopActiveFilterChips,
  ShopProductsEmpty,
} from "@/components/shopsite/ShopProductGridState";
import ShopProductsPagination from "@/components/shopsite/ShopProductsPagination";
import ShopSeoCrawlLinks from "@/components/shopsite/ShopSeoCrawlLinks";
import ShopTenantJsonLd from "@/components/shopsite/ShopTenantJsonLd";
import { SHOP_COLLECTION_PATH } from "@/lib/shopseo/namespace.js";
import { resolveShopSeoCrawlLinksVariant } from "@/lib/shopseo/resolveShopSeoCrawlLinksVariant.js";

const FILTERS_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[72px] animate-pulse" />
);
const SIDEBAR_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[320px] animate-pulse" />
);

/**
 * Shared product grid for shop SEO landing pages (collection + filters).
 */
export default function ShopSeoListingView({
  shop,
  slug,
  subPath,
  h1,
  basePath,
  entity,
  categories,
  categoriesBySlug,
  fitments,
  items,
  page,
  totalPages,
}) {
  const listingBasePath = basePath ? `${basePath}${subPath}` : subPath;
  const collectionHref = basePath
    ? `${basePath}${SHOP_COLLECTION_PATH}`
    : SHOP_COLLECTION_PATH;
  const crawlVariant = resolveShopSeoCrawlLinksVariant(entity?.namespace);

  return (
    <>
      <ShopTenantJsonLd slug={slug} subPath={subPath} shop={shop} />
      <div className="space-y-2 sm:space-y-3">
      <Suspense fallback={FILTERS_FALLBACK}>
        <ShopMobileFilters
          fitments={fitments}
          categories={categories}
          entity={entity}
          basePath={collectionHref}
          shopBasePath={basePath}
          shopSlug={shop?.slug || slug}
        />
      </Suspense>
      <Suspense fallback={FILTERS_FALLBACK}>
        <ShopFilters
          fitments={fitments}
          categories={categories}
          entity={entity}
          basePath={collectionHref}
          shopBasePath={basePath}
          shopSlug={shop?.slug || slug}
        />
      </Suspense>

      <ShopMobileCategories
        categories={categories.slice(0, 24)}
        basePath={collectionHref}
        shopBasePath={basePath}
        shopSlug={shop?.slug || slug}
        fitments={fitments}
        entity={entity}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <aside className="lg:col-span-3">
          <Suspense fallback={SIDEBAR_FALLBACK}>
            <ShopSidebar
              categories={categories.slice(0, 12)}
              basePath={collectionHref}
              shopBasePath={basePath}
              shopSlug={shop?.slug || slug}
              fitments={fitments}
              entity={entity}
            />
          </Suspense>
        </aside>

        <div className="lg:col-span-9">
          <ShopSection title={h1} titleTag="h1" bodyClassName="!p-2 sm:!p-3">
            <div className="mb-2 sm:mb-3">
              <Suspense fallback={null}>
                <ShopActiveFilterChips
                  basePath={listingBasePath}
                  shopBasePath={basePath}
                  categories={categories}
                  fitments={fitments}
                  shopSlug={shop?.slug || slug}
                  entity={entity}
                  categoriesBySlug={categoriesBySlug}
                />
              </Suspense>
            </div>
            {items.length === 0 ? (
              <>
                <Suspense fallback={null}>
                  <ShopProductsEmpty basePath={listingBasePath} />
                </Suspense>
                <ShopSeoCrawlLinks
                  variant={crawlVariant}
                  shopBasePath={basePath}
                  categories={categories}
                  fitments={fitments}
                  vehicleYearRanges={fitments?.vehicleYearRanges}
                  entity={entity}
                />
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                  {items.map((product) => (
                    <ShopProductCard
                      key={product.id}
                      product={product}
                      shopSlug={shop?.slug || slug}
                      shopPhone={shop?.phone || null}
                    />
                  ))}
                </div>
                <Suspense fallback={null}>
                  <ShopProductsPagination
                    page={page}
                    totalPages={totalPages}
                    basePath={listingBasePath}
                  />
                </Suspense>
                <ShopSeoCrawlLinks
                  variant={crawlVariant}
                  shopBasePath={basePath}
                  categories={categories}
                  fitments={fitments}
                  vehicleYearRanges={fitments?.vehicleYearRanges}
                  entity={entity}
                />
              </>
            )}
          </ShopSection>
        </div>
      </div>
    </div>
    </>
  );
}
