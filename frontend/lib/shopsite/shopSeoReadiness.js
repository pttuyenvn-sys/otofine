import { normalizeRichHtml } from "./normalizeRichHtml";

/**
 * SEO readiness scoring — a sibling of `shopCompletion.js` but with
 * weights tuned for search-engine indexing rather than buyer trust.
 *
 * Designed to MIRROR the backend `evaluateSeoEligibility()` gate so
 * the seller can see *why* the storefront is (or isn't) ready for
 * indexing.
 *
 * Score range: 0..100 (sum of weights). 100 = every SEO signal is
 * present; 0 = brand-new shop with no metadata. The 6 backend-gate
 * fields together contribute 70 points; the remaining 30 points are
 * "polish" signals that improve ranking but don't gate indexing
 * (intro length, social links, headings/images in the intro).
 *
 * Signals (sum = 100):
 *
 *   Indexing gates (mirror evaluateSeoEligibility) ........ 70
 *     - publicStatus == "public"     10
 *     - slug present + >=4 chars     10
 *     - avatar OR cover (OG image)   10
 *     - intro html OR bio            15
 *     - phone present                 5
 *     - productCount >= 1            20
 *
 *   SEO polish ........................................... 30
 *     - intro length >= 300 chars (rich enough for snippet)   5
 *     - intro uses at least one H2/H3 heading                 5
 *     - intro contains at least one image                     5
 *     - facebook url (sameAs schema)                          5
 *     - working hours present (LocalBusiness hours)           5
 *     - address detail (PostalAddress)                        5
 */
const SEO_ITEMS = [
  // Indexing gates --------------------------------------------------
  { key: "publicStatus", weight: 10, gate: true, label: "Bật trạng thái Public",
    test: (b, p) => (p?.publicStatus || "").toLowerCase() === "public",
    fix: "Đặt trạng thái shop ở mục Storefront công khai." },
  { key: "slug", weight: 10, gate: true, label: "Đường dẫn (slug) đủ dài",
    test: (b, p) => typeof p?.slug === "string" && p.slug.trim().length >= 4,
    fix: "Đặt slug ít nhất 4 ký tự, tránh ký tự đặc biệt." },
  { key: "ogImage", weight: 10, gate: true, label: "Có ảnh đại diện hoặc ảnh bìa",
    test: (b, p, x) => Boolean(x?.avatar || x?.cover),
    fix: "Tải lên avatar hoặc cover để các mạng xã hội có hình preview." },
  { key: "description", weight: 15, gate: true, label: "Có mô tả storefront",
    test: (b, p) => Boolean(normalizeRichHtml(p?.introHtml)) || (typeof p?.bio === "string" && p.bio.trim().length > 0),
    fix: "Viết phần giới thiệu chi tiết hoặc bio shop." },
  { key: "phone", weight: 5, gate: true, label: "Số điện thoại",
    test: (b) => typeof b?.phone === "string" && b.phone.trim().length > 0,
    fix: "Bổ sung số điện thoại liên hệ." },
  { key: "productCount", weight: 20, gate: true, label: "Có ít nhất 1 sản phẩm live",
    // When the caller hasn't supplied productCount yet (e.g. the panel
    // is mounting and the public-shop fetch is still in flight) we
    // treat the check as "passing" so we don't flash a scary "no
    // products" warning to a shop that obviously has products.
    test: (b, p, x) => x?.productCount === undefined || Number(x.productCount) > 0,
    fix: "Đăng ít nhất 1 sản phẩm để Google có nội dung để index." },

  // SEO polish ------------------------------------------------------
  { key: "introLength", weight: 5, gate: false, label: "Mô tả ≥ 300 ký tự",
    test: (b, p) => textLengthOf(p?.introHtml) >= 300,
    fix: "Viết phần giới thiệu dài hơn để có snippet tốt trên SERP." },
  { key: "introHeadings", weight: 5, gate: false, label: "Mô tả dùng tiêu đề H2/H3",
    test: (b, p) => /<h[23]\b/i.test(String(p?.introHtml || "")),
    fix: "Dùng heading H2 / H3 trong phần giới thiệu để cấu trúc nội dung." },
  { key: "introImages", weight: 5, gate: false, label: "Mô tả có ít nhất 1 ảnh",
    test: (b, p) => /<img\b/i.test(String(p?.introHtml || "")),
    fix: "Chèn ảnh sản phẩm/cửa hàng vào phần giới thiệu." },
  { key: "facebookUrl", weight: 5, gate: false, label: "Liên kết Facebook",
    test: (b, p) => isHttpUrl(p?.facebookUrl),
    fix: "Bổ sung URL Facebook page của shop." },
  { key: "workingHours", weight: 5, gate: false, label: "Giờ làm việc",
    test: (b, p) => typeof p?.workingHours === "string" && p.workingHours.trim().length > 0,
    fix: "Khai báo giờ làm việc — hiển thị trong card LocalBusiness." },
  { key: "addressDetail", weight: 5, gate: false, label: "Địa chỉ chi tiết",
    test: (b, p) => typeof p?.addressDetail === "string" && p.addressDetail.trim().length > 0,
    fix: "Bổ sung địa chỉ chi tiết để Google bản đồ index đúng vị trí." },
];

function textLengthOf(html) {
  if (!html) return 0;
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function isHttpUrl(v) {
  if (!v) return false;
  return /^https?:\/\//i.test(String(v).trim());
}

/**
 * Compute SEO readiness.
 *
 * @param {{ basic: object, pub: object, extras?: object }} input
 *   `extras` lets the caller surface fields that don't live in `basic`/`pub`
 *   (e.g. the avatar/cover preview URL + productCount).
 * @returns {{ score: number, gateOk: boolean, items: Array, suggestions: Array }}
 */
export function computeShopSeoReadiness({ basic = {}, pub = {}, extras = {} } = {}) {
  let earned = 0;
  let total = 0;
  let gatesPassed = 0;
  let gatesRequired = 0;

  const items = SEO_ITEMS.map((def) => {
    total += def.weight;
    if (def.gate) gatesRequired += 1;
    const ok = !!def.test(basic, pub, extras);
    if (ok) {
      earned += def.weight;
      if (def.gate) gatesPassed += 1;
    }
    return { key: def.key, label: def.label, ok, weight: def.weight, gate: def.gate, fix: def.fix };
  });

  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const gateOk = gatesRequired > 0 && gatesPassed === gatesRequired;
  const suggestions = items.filter((i) => !i.ok);
  return { score, gateOk, items, suggestions };
}
