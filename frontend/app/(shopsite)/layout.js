/**
 * Outer wrapper for the entire (shopsite) route group.
 * Only owns the page background + container so that BOTH the
 * Phase 1 hardcoded `/shop-demo` tree and the Phase 2 DB-backed
 * `/shops/[slug]` tree can render their own ShopHeader + ShopTabs.
 */
export default function ShopSiteLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto w-full max-w-screen-xl px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-3">
        {children}
      </div>
    </div>
  );
}
