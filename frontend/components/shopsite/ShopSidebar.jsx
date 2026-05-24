import ShopSection from "./ShopSection";

const CATEGORY_ICONS = {
  "Nhớt động cơ": "🛢️",
  "Phụ tùng động cơ": "⚙️",
  "Hệ thống phanh": "🔧",
  "Đèn chiếu sáng": "💡",
  "Phụ kiện nội thất": "🪑",
  "Đồ chơi ô tô": "🎮",
  "Đồ điện - Công nghệ": "🔌",
};

/**
 * Right sidebar: category list with subtle icon column and a
 * "See all categories" footer link.
 *
 * `basePath` lets the same component drive both the Phase 1 hardcoded
 * /shop-demo tree and the Phase 2 dynamic /shops/[slug] tree.
 */
export default function ShopSidebar({
  categories = [],
  activeSlug,
  basePath = "/shop-demo",
}) {
  return (
    <ShopSection
      title="Danh mục sản phẩm"
      className="h-full"
      bodyClassName="!p-0"
    >
      <ul className="divide-y divide-gray-100">
        {categories.map((cat) => {
          const active = cat.slug === activeSlug;
          return (
            <li key={cat.id}>
              <a
                href={`${basePath}/san-pham?category=${encodeURIComponent(cat.slug)}`}
                className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${
                  active ? "bg-red-50" : ""
                }`}
              >
                <span className="flex items-center gap-3 text-sm text-gray-800">
                  <span aria-hidden className="w-5 text-center">
                    {CATEGORY_ICONS[cat.name] || "•"}
                  </span>
                  {cat.name}
                </span>
                <span aria-hidden className="text-gray-300">
                  ›
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-3 border-t border-gray-100">
        <a
          href={`${basePath}/san-pham`}
          className="text-sm text-[#e60012] font-medium inline-flex items-center gap-1 hover:underline"
        >
          Xem tất cả danh mục ›
        </a>
      </div>
    </ShopSection>
  );
}
