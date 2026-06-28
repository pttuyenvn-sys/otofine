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

  // Catalog-scale badge — the single source of truth for the
  // "X+ sản phẩm" claim across the storefront. Bucketed at finer
  // tiers (10/50/100/200/500/1000/2000/3000/5000) so a shop with
  // 2800 SKUs shows "2.000+ sản phẩm" instead of a generic "200+".
  // Other lower-section components do NOT show a competing number —
  // they speak in wording only — so the hero number always wins as
  // the canonical productCount surface.
  const productCount = Number(shop.productCount) || 0;
  if (productCount >= 10) {
    const bucket = bucketProductCount(productCount);
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

/**
 * Bucket the real productCount into the displayed "X+ sản phẩm"
 * label. Steps are chosen so a typical 100-3000 SKU shop sees a
 * label that meaningfully tracks reality (a 2800-SKU shop shows
 * "2.000+", not "200+"). Used by the hero trust strip and is the
 * canonical wording — no other storefront component renders a
 * competing numeric productCount claim.
 */
function bucketProductCount(n) {
  const v = Number(n) || 0;
  if (v >= 5000) return "5.000+";
  if (v >= 3000) return "3.000+";
  if (v >= 2000) return "2.000+";
  if (v >= 1000) return "1.000+";
  if (v >= 500) return "500+";
  if (v >= 200) return "200+";
  if (v >= 100) return "100+";
  if (v >= 50) return "50+";
  return "10+";
}
