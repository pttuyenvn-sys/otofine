/**
 * "Vì sao khách chọn chúng tôi" — auto-generated trust section.
 *
 * Server component. Every chip is derived from EXISTING shop fields:
 *   - verified              → "Đã xác minh bởi Otofine"
 *   - phone + zalo/facebook → "Phản hồi nhanh nhiều kênh"
 *   - productCount tiers    → "200+ sản phẩm sẵn kho" / "50+" / "10+"
 *   - tenure (createdAt)    → "Hoạt động X+ năm"
 *   - any address/province  → "Có cửa hàng tại <province>"
 *   - phone present         → "Giao hàng toàn quốc qua điện thoại"
 *     (lightweight commitment — every active phone-equipped seller
 *     can ship via the standard nationwide RFQ + COD flow)
 *
 * Why no seller free-text:
 *   - keeps the section trust-grade (no "uy tín chất lượng giá rẻ
 *     trên 10 năm kinh nghiệm" copy-paste templates)
 *   - guarantees consistent visual rhythm across all storefronts
 *   - cheaper to audit + safer for SEO
 *
 * Rendering:
 *   - never throws — degrades gracefully with 0 chips by returning
 *     null (we don't want an empty bordered card)
 *   - SSR-pure; matches the visual language of the rest of the
 *     storefront cards (rounded-2xl + shadow-sm)
 */

const SOFT_TONES = {
  blue:    "bg-blue-50 text-blue-700 ring-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber:   "bg-amber-50 text-amber-700 ring-amber-200",
  indigo:  "bg-indigo-50 text-indigo-700 ring-indigo-200",
  rose:    "bg-rose-50 text-rose-700 ring-rose-200",
  slate:   "bg-slate-50 text-slate-700 ring-slate-200",
};

function yearsActive(shop) {
  // Prefer publishedAt (when the seller went public) over createdAt
  // so we don't count drafts. Round down to the floor — "X+" wording
  // tolerates an under-count better than a brag.
  const raw = shop?.publishedAt || shop?.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return 0;
  const years = (Date.now() - t) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.floor(years));
}

function deriveReasons(shop) {
  if (!shop) return [];
  const out = [];

  if (shop.verified) {
    out.push({
      id: "verified",
      tone: "blue",
      icon: "✓",
      title: "Đã xác minh bởi Otofine",
      body: "Shop đã được kiểm tra danh tính và liên hệ.",
    });
  }

  const channels = [shop.phone, shop.zalo, shop.facebook].filter(Boolean).length;
  if (channels >= 2) {
    out.push({
      id: "response",
      tone: "emerald",
      icon: "⚡",
      title: "Phản hồi nhanh nhiều kênh",
      body: "Sẵn sàng tư vấn qua điện thoại, Zalo hoặc Facebook.",
    });
  }

  // Why-Choose-Us "catalogue" card — wording only. The numeric
  // "X+ sản phẩm" claim lives on the hero strip; this card adds a
  // qualitative cue ("catalogue đầy đủ", "kho trong hệ thống" copy)
  // without re-stating a number that would conflict with the hero.
  const productCount = Number(shop.productCount) || 0;
  if (productCount >= 10) {
    out.push({
      id: "catalog",
      tone: "indigo",
      icon: "📦",
      title:
        productCount >= 200
          ? "Catalogue đa dạng"
          : "Catalogue đang phát triển",
      body:
        productCount >= 200
          ? "Hàng nghìn phụ tùng trong hệ thống kho, sẵn sàng xuất khi cần."
          : "Catalogue đang được mở rộng nhanh, hỗ trợ đặt thêm khi cần.",
    });
  }

  const years = yearsActive(shop);
  if (years >= 1) {
    out.push({
      id: "tenure",
      tone: "amber",
      icon: "🏪",
      title: `Hoạt động ${years}+ năm trên Otofine`,
      body: "Đối tác lâu năm trên hệ thống.",
    });
  }

  const province = (shop.province || "").trim();
  const address = (shop.address || "").trim();
  if (province || address) {
    out.push({
      id: "physical",
      tone: "slate",
      icon: "📍",
      title: province
        ? `Có cửa hàng tại ${province}`
        : "Cửa hàng vật lý có địa chỉ rõ ràng",
      body: address || "Khách có thể đến trực tiếp xem hàng.",
    });
  }

  if (shop.phone) {
    out.push({
      id: "shipping",
      tone: "rose",
      icon: "🚚",
      title: "Giao hàng toàn quốc",
      body: "Hỗ trợ ship qua nhà xe / chuyển phát theo yêu cầu.",
    });
  }

  return out;
}

export default function ShopWhyChooseUs({ shop }) {
  const reasons = deriveReasons(shop);
  if (reasons.length === 0) return null;

  return (
    <section
      aria-label="Vì sao khách chọn chúng tôi"
      className="bg-white rounded-2xl shadow-sm p-3 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-2 sm:mb-3">
        <div>
          <h2 className="text-[15px] sm:text-base font-bold text-gray-900 leading-tight">
            Vì sao khách chọn chúng tôi
          </h2>
          <p className="hidden sm:block text-xs text-gray-500 mt-0.5">
            Các tín hiệu uy tín được tổng hợp tự động từ hồ sơ shop.
          </p>
        </div>
        <span className="hidden sm:inline-block text-[10px] font-semibold tracking-wide text-gray-400">
          OTOFINE TRUST
        </span>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {reasons.map((r) => (
          <li
            key={r.id}
            className={`flex items-start gap-3 rounded-xl border border-gray-100 px-3 py-2.5 sm:px-3 sm:py-3 bg-white`}
          >
            <span
              aria-hidden
              className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full ring-1 text-[15px] ${SOFT_TONES[r.tone] || SOFT_TONES.slate}`}
            >
              {r.icon}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] sm:text-sm font-semibold text-gray-900 leading-snug">
                {r.title}
              </div>
              <div className="text-[11px] sm:text-[12px] text-gray-500 leading-snug mt-0.5">
                {r.body}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
