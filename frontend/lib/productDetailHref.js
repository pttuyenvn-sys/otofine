/**
 * Route chi tiết SP — đồng bộ với HomeProductCard (SEO slug).
 * @param {{ slug?: string; id?: string | number }} item
 */
export function getProductDetailHref(item) {
  if (!item) return "/";
  return item.slug
    ? `/product/${encodeURIComponent(item.slug)}`
    : `/product/${item.id}`;
}
