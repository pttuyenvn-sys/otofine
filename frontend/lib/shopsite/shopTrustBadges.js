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

  // Branding pass — three priority chips lead so the mobile
  // horizontal-scroll cut-off always shows the most reassuring
  // signals first:
  //   1. verified  ✓
  //   2. response  ⚡
  //   3. catalog   📦
  // The tenure + per-brand chips trail because they're context, not
  // commitment.

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

  // Catalog-scale badge — only surfaces when the shop has shipped a
  // meaningful inventory. Bucketed at conservative tiers (10 / 50 /
  // 200) so the chip says something concrete without disclosing exact
  // numbers (avoids "fake-looking precision"). Sourced from the same
  // `productCount` the directory + JSON-LD already use — no extra
  // back-end work, and the number is REAL (not an estimate).
  const productCount = Number(shop.productCount) || 0;
  if (productCount >= 10) {
    let bucket;
    if (productCount >= 200) bucket = "200+";
    else if (productCount >= 50) bucket = "50+";
    else bucket = "10+";
    badges.push({
      kind: "catalog",
      label: `${bucket} sản phẩm`,
      title: `Kho hàng đang có ${productCount.toLocaleString("vi-VN")} sản phẩm`,
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
