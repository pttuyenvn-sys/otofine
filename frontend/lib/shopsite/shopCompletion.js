import { normalizeRichHtml } from "./normalizeRichHtml";

/**
 * Compute the storefront-quality completion score used in
 * `/shop/settings` (and optionally surfaced to the seller as a friendly
 * progress nudge).
 *
 * The function is pure: it takes two snapshots of the unified shop
 * form — `basic` (legacy `/api/shop/me` fields) and `pub` (Phase 4
 * `/api/shop/public-page` fields) — and returns the score + the list
 * of missing items so the UI can render a checklist.
 *
 * Weights are intentionally non-uniform so signals that affect buyer
 * trust the most (cover, intro, public status) outweigh hygiene-only
 * fields. The sum of weights is exactly 100 — `score` is therefore a
 * direct percentage.
 *
 * Scoring model (sum = 100):
 *
 *   Identity ............................. 10
 *     - name              5
 *     - phone             5
 *   Branding ............................. 30
 *     - avatar           10
 *     - cover image      10
 *     - bio (1-line)      5
 *     - slug              5
 *   Storefront content ................... 25
 *     - intro html       15  (rich, non-empty)
 *     - public status    10  (== "public")
 *   Contact & social ..................... 20
 *     - storefront zalo   5
 *     - facebook url      5
 *     - working hours     5
 *     - address detail    5
 *   Policies & extras .................... 15
 *     - sale policy       5  (rich, non-empty)
 *     - warranty policy   5  (rich, non-empty)
 *     - map embed         5
 *
 * `items` is returned in display order so the settings UI can render
 * it as-is. Each entry: `{ key, label, ok, weight, group }`.
 */

const ITEMS = [
  // Identity ------------------------------------------------------------
  { key: "name",            label: "Tên shop",              weight: 5,  group: "Thông tin cơ bản",
    test: (b) => nonEmpty(b?.name) },
  { key: "phone",           label: "Số điện thoại",         weight: 5,  group: "Thông tin cơ bản",
    test: (b) => nonEmpty(b?.phone) },

  // Branding ------------------------------------------------------------
  { key: "avatar",          label: "Ảnh đại diện (logo)",   weight: 10, group: "Branding",
    test: (b, p) => nonEmpty(p?.avatar) },
  { key: "cover",           label: "Ảnh bìa (cover)",       weight: 10, group: "Branding",
    test: (b, p) => nonEmpty(p?.coverImage) },
  { key: "bio",             label: "Giới thiệu ngắn (bio)", weight: 5,  group: "Branding",
    test: (b, p) => nonEmpty(p?.bio) },
  { key: "slug",            label: "Đường dẫn storefront (slug)", weight: 5, group: "Branding",
    test: (b, p) => nonEmpty(p?.slug) },

  // Storefront content --------------------------------------------------
  { key: "intro",           label: "Giới thiệu chi tiết (rich)", weight: 15, group: "Storefront",
    test: (b, p) => isRichNonEmpty(p?.introHtml) },
  { key: "publicStatus",    label: "Bật trạng thái Public",  weight: 10, group: "Storefront",
    test: (b, p) => (p?.publicStatus || "").toLowerCase() === "public" },

  // Contact & social ----------------------------------------------------
  { key: "zaloPhone",       label: "Zalo storefront",        weight: 5,  group: "Liên hệ",
    test: (b, p) => nonEmpty(p?.zaloPhone) },
  { key: "facebookUrl",     label: "Facebook URL",           weight: 5,  group: "Liên hệ",
    test: (b, p) => nonEmpty(p?.facebookUrl) },
  { key: "workingHours",    label: "Giờ làm việc",           weight: 5,  group: "Liên hệ",
    test: (b, p) => nonEmpty(p?.workingHours) },
  { key: "addressDetail",   label: "Địa chỉ chi tiết",       weight: 5,  group: "Liên hệ",
    test: (b, p) => nonEmpty(p?.addressDetail) },

  // Policies & extras ---------------------------------------------------
  { key: "salePolicy",      label: "Chính sách bán hàng",    weight: 5,  group: "Chính sách",
    test: (b) => isRichNonEmpty(b?.salePolicy) },
  { key: "warrantyPolicy",  label: "Chính sách bảo hành",    weight: 5,  group: "Chính sách",
    test: (b) => isRichNonEmpty(b?.warrantyPolicy) },
  { key: "mapEmbed",        label: "Google Maps embed",      weight: 5,  group: "Chính sách",
    test: (b, p) => nonEmpty(p?.mapEmbedUrl) },
];

function nonEmpty(v) {
  return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
}

function isRichNonEmpty(html) {
  return Boolean(normalizeRichHtml(html));
}

/**
 * Compute the score breakdown.
 *
 * @param {{ basic: object, pub: object }} input  unified form state
 * @returns {{ score: number, total: number, items: Array, missing: Array }}
 */
export function computeShopCompletion({ basic = {}, pub = {} } = {}) {
  let earned = 0;
  let total = 0;
  const items = ITEMS.map((def) => {
    total += def.weight;
    const ok = !!def.test(basic, pub);
    if (ok) earned += def.weight;
    return { key: def.key, label: def.label, ok, weight: def.weight, group: def.group };
  });

  // Round to nearest int — score is a UX number, not an SLO metric.
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const missing = items.filter((i) => !i.ok);
  return { score, total, items, missing };
}
