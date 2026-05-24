import ShopFilters from "@/components/shopsite/ShopFilters";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopProductCard from "@/components/shopsite/ShopProductCard";
import ShopSidebar from "@/components/shopsite/ShopSidebar";
import { shopDemo } from "@/data/shop-demo";

export const metadata = {
  title: `Sản phẩm — ${shopDemo.name} | Otofine`,
};

export default function ShopDemoProductsPage() {
  return (
    <div className="space-y-3">
      <ShopFilters brands={shopDemo.carBrands} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <aside className="lg:col-span-3">
          <ShopSidebar categories={shopDemo.categories} />
        </aside>

        <div className="lg:col-span-9">
          <ShopSection
            title={`Tất cả sản phẩm (${shopDemo.allProducts.length})`}
            bodyClassName="!p-3"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {shopDemo.allProducts.map((product) => (
                <ShopProductCard key={product.id} product={product} />
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#e60012] hover:text-[#e60012] text-sm text-gray-700 font-medium px-5 py-2 rounded-xl"
              >
                Xem thêm sản phẩm ›
              </button>
            </div>
          </ShopSection>
        </div>
      </div>
    </div>
  );
}
