/**
 * "Người bán đáng tin cậy" — compact security checklist.
 *
 * Renders 3-5 short rows so a first-time buyer can audit at a glance
 * that the shop meets baseline trust criteria. This is intentionally
 * narrower than `ShopWhyChooseUs` (which is the marketing pitch):
 *
 *   - "✓ Đã xác minh"
 *   - "✓ Có địa chỉ rõ ràng"
 *   - "✓ Có số điện thoại"
 *   - "✓ Có cửa hàng công khai trên Otofine"
 *   - "✓ Có sản phẩm thật"
 *
 * Designed to replace the legacy "Sản phẩm chính hãng / Giá cả /
 * Tư vấn / Giao toàn quốc" 4-chip block inside the About column on
 * the homepage — those four claims are seller-asserted with no
 * supporting data, while these are derived from REAL fields.
 *
 * SSR-pure server component.
 */

function deriveTrustChecklist(shop) {
  if (!shop) return [];
  const items = [];

  if (shop.verified) {
    items.push({ key: "verified", label: "Đã xác minh bởi Otofine" });
  }
  if ((shop.address || "").trim()) {
    items.push({ key: "address", label: "Có địa chỉ cửa hàng rõ ràng" });
  }
  if ((shop.phone || "").trim()) {
    items.push({ key: "phone", label: "Có số điện thoại liên hệ" });
  }
  if ((shop.slug || "").trim()) {
    items.push({ key: "public", label: "Cửa hàng công khai trên Otofine" });
  }
  const productCount = Number(shop.productCount) || 0;
  if (productCount > 0) {
    items.push({ key: "products", label: "Có sản phẩm thật trên kệ" });
  }
  return items;
}

export default function ShopTrustedSellerBlock({ shop, className = "" }) {
  const items = deriveTrustChecklist(shop);
  if (items.length === 0) return null;

  return (
    <div className={`mt-3 ${className}`}>
      <div className="text-[11px] font-bold tracking-wide text-emerald-700 uppercase">
        Người bán đáng tin cậy
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-2 text-[12px] text-gray-700">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 shrink-0 mt-[1px]"
            >
              <svg
                viewBox="0 0 24 24"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="leading-snug">{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
