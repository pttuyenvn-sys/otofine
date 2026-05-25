/**
 * Phase 7.1 — deterministic, transparent shop ranking.
 *
 * Inputs: an enriched shop row (the kind produced by
 * `shopDirectory.repository.listPublicShopsForDirectory`).
 *
 * Output: `{ score, breakdown }` where:
 *   - `score`     is an integer 0..100
 *   - `breakdown` is an ordered list of `{ key, label, points, max }`
 *     so callers can show the seller exactly why their score is what
 *     it is. This is intentionally JSON-friendly so a future "Why is
 *     my shop ranked #N?" UI can render it without extra plumbing.
 *
 * Design properties:
 *   - PURE       : no IO, no Date.now() except for freshness, which
 *                  is passed as `now` so tests stay deterministic.
 *   - TRANSPARENT: every signal has a label. No hidden multipliers.
 *   - STABLE     : ties are broken by `id ASC` at the caller (NOT by
 *                  random / time-based jitter) so the same query at
 *                  the same minute always returns the same order.
 *   - ADDITIVE   : adding a signal requires bumping `MAX_SCORE`. We
 *                  fail loudly if the sum drifts.
 *
 * Weights (sum exactly 100):
 *
 *   Trust (35)
 *     verified                    : 20   verified_at IS NOT NULL
 *     established years           :  5   floor(years_since(published||created))
 *     responsive (phone + IM)     :  5   phone + (zalo|facebook)
 *     branding completeness       :  5   avatar + cover + bio present
 *
 *   Inventory (30)
 *     product count tier          : 15   log-scaled 0..15
 *     vehicle brand coverage      : 10   1 pt per top brand, max 5 → x2
 *     freshness (updated <30d)    :  5   binary
 *
 *   Storefront polish (20)
 *     intro html present          : 10
 *     facebook url present        :  5
 *     working hours present       :  5
 *
 *   Discovery (15)
 *     slug looks human-friendly   :  5   ≥4 chars, contains a letter
 *     province set                :  5
 *     map embed                   :  5
 *
 * Total: 100.
 */

const FRESH_DAYS = 30;
const MAX_SCORE = 100;

function nonEmpty(v) {
  if (v == null) return false;
  return String(v).trim().length > 0;
}

function yearsSince(dateLike, now) {
  if (!dateLike) return 0;
  const t = new Date(dateLike).getTime();
  if (!Number.isFinite(t)) return 0;
  const ms = (now ?? Date.now()) - t;
  if (ms <= 0) return 0;
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
}

function daysSince(dateLike, now) {
  if (!dateLike) return Infinity;
  const t = new Date(dateLike).getTime();
  if (!Number.isFinite(t)) return Infinity;
  const ms = (now ?? Date.now()) - t;
  return ms / (24 * 60 * 60 * 1000);
}

/**
 * Log-scaled product count score: 0 / 5 / 8 / 10 / 12 / 15.
 * Hard-floor 0 for shops with no published product so the directory
 * never promotes an empty storefront over a thin-but-stocked one.
 */
function productCountScore(n) {
  const c = Math.max(0, Number(n) || 0);
  if (c === 0) return 0;
  if (c < 5)   return 5;
  if (c < 20)  return 8;
  if (c < 50)  return 10;
  if (c < 200) return 12;
  return 15;
}

/**
 * Score and explain. `now` is injectable for tests + cache stability.
 *
 * @param {object} row     enriched shop row (see shopDirectory.repository)
 * @param {number} [now]   epoch ms; defaults to Date.now()
 * @returns {{ score: number, breakdown: Array, max: number }}
 */
export function rankShop(row, now = Date.now()) {
  if (!row) {
    return { score: 0, breakdown: [], max: MAX_SCORE };
  }

  const breakdown = [];
  const add = (key, label, points, max) =>
    breakdown.push({ key, label, points: Math.max(0, Math.min(points, max)), max });

  // ---------- Trust (35) -------------------------------------------
  add("verified", "Đã xác minh", row.verified_at ? 20 : 0, 20);

  const yrs = yearsSince(row.published_at || row.createdAt, now);
  add("establishedYears", `Hoạt động ${yrs} năm`, Math.min(yrs, 5), 5);

  const responsive = !!(
    nonEmpty(row.phone) && (nonEmpty(row.zalo) || nonEmpty(row.facebook_url))
  );
  add("responsive", "Phản hồi nhanh", responsive ? 5 : 0, 5);

  const branding = [row.avatar, row.cover, row.bio].filter(nonEmpty).length;
  add(
    "branding",
    `Branding (${branding}/3)`,
    Math.round((branding / 3) * 5),
    5,
  );

  // ---------- Inventory (30) ---------------------------------------
  const pc = productCountScore(row.productCount);
  add("productCount", `Sản phẩm (${row.productCount || 0})`, pc, 15);

  const brandPts = Math.min((row.topBrands?.length || 0) * 2, 10);
  add(
    "brandCoverage",
    `Phủ ${row.topBrands?.length || 0} hãng xe`,
    brandPts,
    10,
  );

  const fresh = daysSince(row.updatedAt, now) <= FRESH_DAYS;
  add("freshness", `Cập nhật trong ${FRESH_DAYS} ngày`, fresh ? 5 : 0, 5);

  // ---------- Storefront polish (20) -------------------------------
  const introOk = nonEmpty(row.intro_html) || nonEmpty(row.descriptionHtml);
  add("intro", "Giới thiệu chi tiết", introOk ? 10 : 0, 10);
  add("facebook", "Facebook URL", nonEmpty(row.facebook_url) ? 5 : 0, 5);
  add("workingHours", "Giờ làm việc", nonEmpty(row.working_hours) ? 5 : 0, 5);

  // ---------- Discovery (15) ---------------------------------------
  const slug = String(row.slug || "");
  const goodSlug = slug.length >= 4 && /[a-z]/.test(slug);
  add("slug", "Slug thân thiện", goodSlug ? 5 : 0, 5);
  add("province", "Tỉnh/thành đã đặt", row.provinceId ? 5 : 0, 5);
  add("mapEmbed", "Google Maps", nonEmpty(row.map_embed_url) ? 5 : 0, 5);

  // Defence-in-depth: if we ever forget to update MAX_SCORE after
  // adding a signal, refuse to silently scale.
  const totalMax = breakdown.reduce((n, b) => n + b.max, 0);
  if (totalMax !== MAX_SCORE) {
    // Don't throw — the directory must keep rendering. Surface as a
    // server log so the dev who broke the invariant sees it next push.
    // eslint-disable-next-line no-console
    console.warn(
      `[shopsite] event=ranking.max-drift expected=${MAX_SCORE} actual=${totalMax}`,
    );
  }

  const score = breakdown.reduce((n, b) => n + b.points, 0);
  return { score, breakdown, max: MAX_SCORE };
}

export const RANK_MAX_SCORE = MAX_SCORE;
