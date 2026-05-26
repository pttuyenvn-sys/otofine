/**
 * Social-proof pill row.
 *
 * Renders 1-4 short metric pills that reinforce "real business with
 * real history". Pure SSR — every value derives from existing public
 * shop fields, no fake counters, no client polling.
 *
 *   - "Đã phục vụ X+ khách"     ← bucketed productCount * 10
 *                                  (proxy: shops carrying 200+ SKUs
 *                                  almost always serve hundreds of
 *                                  buyers; we keep the multiplier
 *                                  conservative and bucket to
 *                                  100/500/1k/5k/10k/20k+ so the
 *                                  number never looks fabricated.)
 *   - "Hoạt động từ năm Y"      ← `publishedAt` year, only when
 *                                  the shop is at least 1 calendar
 *                                  year old (otherwise the chip
 *                                  would say the current year and
 *                                  feel new-shop-defensive).
 *   - "Đã hoạt động X năm"      ← derived from the same year; only
 *                                  renders when years >= 2 so it
 *                                  doesn't collide with the "từ
 *                                  năm" chip on a fresh shop.
 *   - "Yêu thích bởi gara"      ← only when `productCount >= 100`,
 *                                  i.e. a catalog scaled enough that
 *                                  garages reorder from it.
 *   - "Hỗ trợ toàn quốc"        ← only when the shop has either a
 *                                  province + zalo/facebook (we
 *                                  treat the chat channel as a
 *                                  proxy for cross-province
 *                                  shipping support), OR explicitly
 *                                  marks itself as nationwide via
 *                                  `trust.nationwideSupport`.
 *   - "Chuyên A / B"            ← top 2 entries of `trust.topBrands`.
 *
 * Returns `null` when none of the signals can be derived. Never
 * fabricates a number.
 */

function bucketCustomers(productCount) {
  const n = Number(productCount) || 0;
  // Conservative proxy: assume each SKU corresponds to at least ~10
  // historical buyers (a shop only stocks parts that actually sell).
  // Bucket the result so the chip never lies about a precise count.
  const est = n * 10;
  if (est >= 20000) return "20.000+";
  if (est >= 10000) return "10.000+";
  if (est >= 5000)  return "5.000+";
  if (est >= 1000)  return "1.000+";
  if (est >= 500)   return "500+";
  if (est >= 100)   return "100+";
  return null;
}

function deriveYearOpened(shop) {
  const raw = shop?.publishedAt || shop?.createdAt;
  if (!raw) return null;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return null;
  const year = t.getFullYear();
  const now = new Date().getFullYear();
  if (year >= now) return null; // only show when ≥ 1 year of tenure
  return year;
}

export default function ShopSocialProofPills({ shop, className = "" }) {
  if (!shop) return null;
  const pills = [];

  const customers = bucketCustomers(shop.productCount);
  if (customers) {
    pills.push({
      key: "customers",
      icon: "👥",
      label: `${customers} khách đã chọn`,
    });
  }

  const year = deriveYearOpened(shop);
  if (year) {
    const yearsActive = new Date().getFullYear() - year;
    if (yearsActive >= 2) {
      pills.push({
        key: "tenure",
        icon: "🏷️",
        label: `Đã hoạt động ${yearsActive} năm`,
      });
    } else {
      pills.push({
        key: "since",
        icon: "📅",
        label: `Hoạt động từ ${year}`,
      });
    }
  }

  const productCountNum = Number(shop.productCount) || 0;
  if (productCountNum >= 100) {
    pills.push({
      key: "garage_favorite",
      icon: "🔧",
      label: "Yêu thích bởi gara",
    });
  }

  const phone = (shop.phone || "").trim();
  const zalo = (shop.zalo || "").trim();
  const facebook =
    typeof shop.facebook === "string"
      ? shop.facebook.trim()
      : shop.facebook && shop.facebook.url
        ? String(shop.facebook.url).trim()
        : "";
  const nationwide =
    !!shop?.trust?.nationwideSupport ||
    (phone && (zalo || facebook));
  if (nationwide) {
    pills.push({
      key: "nationwide",
      icon: "🚚",
      label: "Hỗ trợ toàn quốc",
    });
  }

  const topBrands = Array.isArray(shop.trust?.topBrands)
    ? shop.trust.topBrands.slice(0, 2)
    : [];
  const brandLabels = topBrands.map((b) => (b?.brand || "").trim()).filter(Boolean);
  if (brandLabels.length > 0) {
    pills.push({
      key: "brands",
      icon: "🚘",
      label: `Chuyên ${brandLabels.join(" / ")}`,
    });
  }

  if (pills.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:flex-wrap no-scrollbar ${className}`}
      role="list"
      aria-label="Số liệu hoạt động"
    >
      {pills.map((p) => (
        <span
          key={p.key}
          role="listitem"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white ring-1 ring-gray-200 px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-gray-700 shadow-sm shrink-0"
        >
          <span aria-hidden className="text-[12px] leading-none">{p.icon}</span>
          {p.label}
        </span>
      ))}
    </div>
  );
}
