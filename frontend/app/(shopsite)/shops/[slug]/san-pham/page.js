import { Suspense } from "react";
import { notFound } from "next/navigation";
import ShopFilters from "@/components/shopsite/ShopFilters";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopProductCard from "@/components/shopsite/ShopProductCard";
import ShopSidebar from "@/components/shopsite/ShopSidebar";
import {
  ShopActiveFilterChips,
  ShopProductsEmpty,
} from "@/components/shopsite/ShopProductGridState";
import ShopProductsPagination from "@/components/shopsite/ShopProductsPagination";

const FILTERS_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[72px] animate-pulse" />
);
const SIDEBAR_FALLBACK = (
  <div className="bg-white rounded-2xl shadow-sm h-[320px] animate-pulse" />
);
import {
  fetchPublicShop,
  fetchPublicShopSafe,
  fetchPublicShopProducts,
  fetchPublicShopCategories,
  fetchPublicShopFitments,
  getShopBasePath,
  getShopCanonicalUrl,
} from "@/services/shopPublic.service";
import { buildShopMetadata } from "@/lib/shopsite/buildShopMetadata";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const [shop, canonical] = await Promise.all([
    fetchPublicShopSafe(slug),
    getShopCanonicalUrl(slug, "san-pham"),
  ]);
  return buildShopMetadata({ shop, page: { subtitle: "Sản phẩm" }, canonical });
}

const PER_PAGE = 20;

export default async function ShopTenantProductsPage({ params, searchParams }) {
  const { slug } = await params;
  const search = (await searchParams) || {};

  const page = Number(search.page) > 0 ? Number(search.page) : 1;
  const filterArgs = {
    page,
    perPage: PER_PAGE,
    category: search.category || undefined,
    brand: search.brand || undefined,
    model: search.model || undefined,
    year: search.year || undefined,
    q: search.q || undefined,
    sort: search.sort || "newest",
  };

  // Parallelise everything that doesn't depend on the shop row. The
  // backend's `findPublicShopBySlug` is cached so the implicit lookup
  // inside each call is essentially free after the first hit.
  const [shop, productsPage, categoriesPayload, fitments] = await Promise.all([
    fetchPublicShop(slug),
    fetchPublicShopProducts(slug, filterArgs),
    fetchPublicShopCategories(slug),
    fetchPublicShopFitments(slug),
  ]);

  if (!shop) notFound();

  const basePath = await getShopBasePath(shop.slug);
  const items = productsPage?.items || [];
  const total = productsPage?.total || 0;
  const totalPages = productsPage?.totalPages || 1;

  const categories = (categoriesPayload?.items || []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug || String(c.id),
  }));
  const categoriesBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  return (
    <div className="space-y-3">
      <Suspense fallback={FILTERS_FALLBACK}>
        <ShopFilters fitments={fitments} basePath={basePath} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <aside className="lg:col-span-3">
          <Suspense fallback={SIDEBAR_FALLBACK}>
            <ShopSidebar
              categories={categories.slice(0, 12)}
              basePath={basePath}
            />
          </Suspense>
        </aside>

        <div className="lg:col-span-9">
          <ShopSection
            title={`Tất cả sản phẩm (${total.toLocaleString("vi-VN")})`}
            bodyClassName="!p-3"
          >
            <div className="mb-3">
              <Suspense fallback={null}>
                <ShopActiveFilterChips
                  basePath={basePath}
                  categoriesBySlug={categoriesBySlug}
                />
              </Suspense>
            </div>
            {items.length === 0 ? (
              <Suspense fallback={null}>
                <ShopProductsEmpty basePath={basePath} />
              </Suspense>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {items.map((product) => (
                    <ShopProductCard key={product.id} product={product} shopSlug={shop?.slug || slug} />
                  ))}
                </div>
                <Suspense fallback={null}>
                  <ShopProductsPagination
                    page={page}
                    totalPages={totalPages}
                    basePath={basePath}
                  />
                </Suspense>
              </>
            )}
          </ShopSection>
        </div>
      </div>
    </div>
  );
}
