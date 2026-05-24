/**
 * Derive the list of trust badges shown in the storefront header.
 *
 * Pure function — input is the shop DTO (from `/api/public/shops/<slug>`),
 * output is an ordered array of `{ kind, label, title? }`. Order
 * matters: the most reassuring signal goes first so it survives the
 * horizontal scroll cut-off on mobile.
 *
 * Backwards-compatible: if the backend hasn't populated `shop.trust`
 * (older API response from a stale cache), the function falls back to
 * the legacy top-level fields (`verified`, `phone`, `zalo`).
 */
export function deriveShopTrustBadges(shop) {
  if (!shop) return [];
  const trust = shop.trust || {};
  const badges = [];

  if (trust.verified || shop.verified) {
    badges.push({
      kind: "verified",
      label: "Đã xác minh",
      title: "Shop đã được Otofine xác minh",
    });
  }

  if (trust.quickResponse || (shop.phone && (shop.zalo || shop.facebook))) {
    badges.push({
      kind: "response",
      label: "Phản hồi nhanh",
      title: "Shop có nhiều kênh liên hệ trực tiếp",
    });
  }

  const years = Number(trust.establishedYears) || 0;
  if (years >= 1) {
    badges.push({
      kind: "tenure",
      label: years >= 3 ? `Hoạt động ${years}+ năm` : "Hoạt động lâu năm",
      title: `Shop đã hoạt động trên Otofine ${years} năm`,
    });
  }

  // Top brands → "Chuyên Toyota", "Chuyên Peugeot" … at most 2 so the
  // header strip never becomes a wall of brands.
  const topBrands = Array.isArray(trust.topBrands) ? trust.topBrands.slice(0, 2) : [];
  for (const b of topBrands) {
    const brandName = (b?.brand || "").trim();
    if (!brandName) continue;
    badges.push({
      kind: "brand",
      label: `Chuyên ${brandName}`,
      title: `Shop có nhiều sản phẩm cho ${brandName}`,
    });
  }

  return badges;
}
