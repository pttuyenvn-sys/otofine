import { ShopProductGridSkeleton } from "@/components/shopsite/ShopProductGridState";

/**
 * Next.js route-level loading boundary. Renders while the App Router
 * is fetching the new server payload after a category/filter
 * navigation, so the user sees a stable skeleton instead of a flash.
 *
 * Lives at the route level — only takes effect when navigation
 * happens via `router.push/replace`. Direct address-bar reloads use
 * the SSR HTML and skip this entirely.
 */
export default function ShopTenantProductsLoading() {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-sm h-[72px] sm:h-[80px] animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <aside className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm h-[380px] animate-pulse" />
        </aside>
        <div className="lg:col-span-9">
          <div className="bg-white rounded-2xl shadow-sm p-3">
            <div className="h-6 w-1/3 bg-gray-100 animate-pulse rounded mb-4" />
            <ShopProductGridSkeleton count={20} />
          </div>
        </div>
      </div>
    </div>
  );
}
