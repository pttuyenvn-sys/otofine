import { notFound } from "next/navigation";
import ShopFilters from "@/components/shopsite/ShopFilters";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopProductCard from "@/components/shopsite/ShopProductCard";
import ShopSidebar from "@/components/shopsite/ShopSidebar";
import {
  fetchPublicShop,
  fetchPublicShopProducts,
  fetchPublicShopCategories,
  getShopBasePath,
} from "@/services/shopPublic.service";

export default async function ShopTenantProductsPage({ params, searchParams }) {
  const { slug } = await params;
  const search = (await searchParams) || {};

  const page = Number(search.page) > 0 ? Number(search.page) : 1;
  const filterArgs = {
    page,
    perPage: 16,
    category: search.category || undefined,
    brand: search.brand || undefined,
    model: search.model || undefined,
    q: search.q || undefined,
    sort: search.sort || "newest",
  };

  const [shop, productsPage, categoriesPayload] = await Promise.all([
    fetchPublicShop(slug),
    fetchPublicShopProducts(slug, filterArgs),
    fetchPublicShopCategories(slug),
  ]);

  if (!shop) notFound();

  const basePath = await getShopBasePath(shop.slug);
  const items = productsPage?.items || [];
  const total = productsPage?.total || 0;
  const totalPages = productsPage?.totalPages || 1;
  const categories = (categoriesPayload?.items || []).slice(0, 12).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug || String(c.id),
  }));

  const hasNext = page < totalPages;
  const nextHref = `${basePath}/san-pham?page=${page + 1}`;

  return (
    <div className="space-y-3">
      <ShopFilters />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <aside className="lg:col-span-3">
          <ShopSidebar
            categories={categories}
            activeSlug={search.category}
            basePath={basePath}
          />
        </aside>

        <div className="lg:col-span-9">
          <ShopSection
            title={`Tất cả sản phẩm (${total.toLocaleString("vi-VN")})`}
            bodyClassName="!p-3"
          >
            {items.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                Không có sản phẩm phù hợp với bộ lọc.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {items.map((product) => (
                    <ShopProductCard key={product.id} product={product} />
                  ))}
                </div>
                {hasNext && (
                  <div className="mt-4 flex justify-center">
                    <a
                      href={nextHref}
                      className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#e60012] hover:text-[#e60012] text-sm text-gray-700 font-medium px-5 py-2 rounded-xl"
                    >
                      Xem thêm sản phẩm ›
                    </a>
                  </div>
                )}
              </>
            )}
          </ShopSection>
        </div>
      </div>
    </div>
  );
}
