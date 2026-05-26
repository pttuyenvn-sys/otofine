import { deriveShopResponseScore } from "@/lib/shopsite/responseSpeedScore";

/**
 * "Đang hoạt động" — live-feeling activity strip.
 *
 * Sits directly under the hero (above the filter row) and renders 1-4
 * short status chips so the storefront immediately reads as a real,
 * operating business instead of a parked template.
 *
 * Strict deterministic-soft policy (DO NOT FAKE):
 *   - no `Math.random` numbers
 *   - no "12 khách đang xem" fabricated viewer counts
 *   - no "5 khách vừa gửi báo giá" without a real RFQ feed
 *   - every chip is derived from existing public `shop` fields and
 *     evaluated server-side so the SSR HTML is stable
 *
 * Active chips (in order):
 *   1. Open-now state  — derived from `workingHoursShort` parsed
 *      against the current wall clock (server-side, Asia/Ho_Chi_Minh
 *      offset is the safe default for VN sellers). Shows
 *      "● Đang mở cửa" or "○ Ngoài giờ — gửi báo giá 24/7" as a
 *      neutral fallback.
 *   2. Response speed — `deriveShopResponseScore` returns a tiered
 *      label (Rất nhanh / Trong ngày / Liên hệ qua điện thoại)
 *      based on verified + channel count. Omitted when no contact
 *      channel is configured.
 *   3. Catalog scale — `productCount` bucketed at 100/500/1k/2k.
 *   4. Top brand specialty — top entry of `trust.topBrands[]`.
 *
 * Visual:
 *   - Mobile: `overflow-x-auto` so the chips can horizontally scroll
 *     when the screen is too narrow.
 *   - Desktop: wraps onto a single line via `flex-wrap`.
 *   - Each chip uses a small leading dot/glyph + emerald/blue/indigo
 *     soft palette so the strip reads "status" not "promo".
 */

function hourFromHHMM(str) {
  const m = (str || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h + mm / 60;
}

function deriveOpenNow(workingHoursShort) {
  // Best-effort parser for "08:00 - 18:00 (Thứ 2 - Thứ 7)" style.
  // If we can't parse, we deliberately render the neutral chip so
  // the surface never lies.
  const text = (workingHoursShort || "").trim();
  if (!text) return { state: "unknown" };
  const range = text.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!range) return { state: "unknown" };
  const start = hourFromHHMM(range[1]);
  const end = hourFromHHMM(range[2]);
  if (start == null || end == null) return { state: "unknown" };

  const now = new Date();
  // Server may be UTC. Anchor to UTC+7 (VN). This is a soft hint
  // for the chip — a 1h offset error on a server-rendered status
  // is acceptable noise and far better than a wrong "đóng cửa" on
  // an actually-open shop.
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const vnHour = (utcHour + 7) % 24;
  const isOpen = start <= vnHour && vnHour < end;
  return { state: isOpen ? "open" : "closed", start, end };
}

function deriveActivities(shop) {
  if (!shop) return [];
  const out = [];

  const open = deriveOpenNow(shop.workingHoursShort);
  if (open.state === "open") {
    out.push({
      key: "open",
      tone: "live",
      label: "Đang mở cửa",
      dot: true,
    });
  } else if (open.state === "closed") {
    out.push({
      key: "closed",
      tone: "neutral",
      label: "Ngoài giờ · Báo giá 24/7",
      dot: false,
    });
  } else {
    out.push({
      key: "always",
      tone: "neutral",
      label: "Nhận báo giá 24/7",
      dot: false,
    });
  }

  const score = deriveShopResponseScore(shop);
  if (score) {
    const toneByTier = { fast: "ok", same_day: "ok", normal: "neutral" };
    out.push({
      key: "response",
      tone: toneByTier[score.tier] || "neutral",
      label: `Phản hồi · ${score.label}`,
      dot: false,
      icon: score.glyph,
    });
  }

  const productCount = Number(shop.productCount) || 0;
  if (productCount >= 50) {
    let bucket;
    if (productCount >= 2000) bucket = "2.000+";
    else if (productCount >= 1000) bucket = "1.000+";
    else if (productCount >= 500) bucket = "500+";
    else if (productCount >= 100) bucket = "100+";
    else bucket = "50+";
    out.push({
      key: "catalog",
      tone: "info",
      label: `${bucket} sản phẩm trên kệ`,
      dot: false,
      icon: "📦",
    });
  }

  const topBrand = shop.trust?.topBrands?.[0]?.brand?.trim();
  if (topBrand) {
    out.push({
      key: "brand",
      tone: "neutral",
      label: `Chuyên hãng ${topBrand}`,
      dot: false,
      icon: "🚗",
    });
  }

  return out;
}

const TONES = {
  live:    "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ok:      "bg-blue-50 text-blue-700 ring-blue-200",
  info:    "bg-indigo-50 text-indigo-700 ring-indigo-200",
  neutral: "bg-gray-50 text-gray-700 ring-gray-200",
};

export default function ShopLiveActivityStrip({ shop, className = "" }) {
  const chips = deriveActivities(shop);
  if (chips.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:flex-wrap no-scrollbar px-1 ${className}`}
      role="list"
      aria-label="Hoạt động shop"
    >
      {chips.map((c) => (
        <span
          key={c.key}
          role="listitem"
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold ring-1 shrink-0 ${TONES[c.tone] || TONES.neutral}`}
        >
          {c.dot ? (
            <span
              aria-hidden
              className="relative inline-flex items-center justify-center w-2 h-2"
            >
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
              <span className="relative inline-block w-2 h-2 rounded-full bg-emerald-500" />
            </span>
          ) : c.icon ? (
            <span aria-hidden className="text-[11px] leading-none">
              {c.icon}
            </span>
          ) : null}
          {c.label}
        </span>
      ))}
    </div>
  );
}
