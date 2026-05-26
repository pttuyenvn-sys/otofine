/**
 * Compact "Tốc độ phản hồi" score derived purely from PUBLIC,
 * structural fields of the shop DTO. No new API calls, no fabricated
 * "98% response rate" line.
 *
 * Tiers:
 *   - "Rất nhanh"     ⚡   — verified seller + ≥2 direct chat channels
 *                            (phone AND (zalo OR facebook))
 *   - "Trong ngày"    🟢   — at least one direct channel + verified
 *                            OR phone+zalo (the minimum we tell buyers
 *                            equals "the shop checks chats daily")
 *   - "Bình thường"   ⏳   — has a phone but no other channel; we
 *                            don't say "Chậm" because that's a
 *                            negative claim we can't verify with the
 *                            data we own.
 *   - null            —     — no contact at all → omit the chip
 *
 * The component (`ShopResponseScoreChip`) renders the returned label
 * verbatim and never invents nuance — if the data isn't strong enough
 * to claim "Rất nhanh", we fall back to the next tier or omit.
 *
 * Returns `{ tier, label, tone, glyph, title }` or `null` for the
 * insufficient-data case.
 */

const TONES = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  gray: "bg-gray-50 text-gray-700 ring-gray-200",
};

export const RESPONSE_SCORE_TONES = TONES;

function nonEmpty(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function deriveShopResponseScore(shop) {
  if (!shop) return null;
  const trust = shop.trust || {};
  const phone = nonEmpty(shop.phone);
  const zalo = nonEmpty(shop.zalo) || nonEmpty(shop.zalo_phone);
  const facebook =
    nonEmpty(shop.facebook) ||
    (shop.facebook && typeof shop.facebook === "object" && nonEmpty(shop.facebook.url));
  const verified = !!(trust.verified || shop.verified);
  const directChannels = [phone, zalo, facebook].filter(Boolean).length;

  if (!phone && !zalo && !facebook) return null;

  if (verified && phone && (zalo || facebook)) {
    return {
      tier: "fast",
      label: "Rất nhanh",
      tone: "emerald",
      glyph: "⚡",
      title: "Shop được xác minh và có nhiều kênh liên hệ trực tiếp",
    };
  }
  if (directChannels >= 2 || (verified && directChannels >= 1)) {
    return {
      tier: "same_day",
      label: "Trong ngày",
      tone: "green",
      glyph: "🟢",
      title: "Shop thường phản hồi trong ngày làm việc",
    };
  }
  return {
    tier: "normal",
    label: "Liên hệ qua điện thoại",
    tone: "gray",
    glyph: "📞",
    title: "Liên hệ shop qua số điện thoại để được tư vấn",
  };
}
