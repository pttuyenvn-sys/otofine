/**
 * Storefront product availability presentation — separate from visibility.
 * Approved products stay listed regardless of stock/price; these helpers
 * only derive the labels shown on product cards.
 */

export const STOCK_LABEL_IN_STOCK = "Còn hàng";
export const STOCK_LABEL_OUT_OF_STOCK = "Hết hàng / Nhận đặt";
export const PRICE_LABEL_CONTACT = "Liên hệ báo giá";

export function deriveStockAvailabilityLabel(stock) {
  const n = Number(stock);
  if (Number.isFinite(n) && n > 0) return STOCK_LABEL_IN_STOCK;
  return STOCK_LABEL_OUT_OF_STOCK;
}

/**
 * @returns {{ type: 'price' | 'contact', label: string }}
 */
export function formatStorefrontPrice(price) {
  const n = Number(price);
  if (price != null && Number.isFinite(n) && n > 0) {
    return {
      type: "price",
      label: `${n.toLocaleString("vi-VN")}đ`,
    };
  }
  return { type: "contact", label: PRICE_LABEL_CONTACT };
}

export const STOCK_AVAILABILITY_TONES = {
  in_stock: "text-emerald-700",
  out_of_stock: "text-amber-700",
};

export function deriveStockAvailabilityTone(stock) {
  const n = Number(stock);
  if (Number.isFinite(n) && n > 0) return STOCK_AVAILABILITY_TONES.in_stock;
  return STOCK_AVAILABILITY_TONES.out_of_stock;
}
