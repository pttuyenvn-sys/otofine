import axiosClient from "../api/axiosClient";

export function getProductsByShop(filters = {}) {
  return axiosClient.get("/products/shop", {
    params: filters,
  });
}

/** Hãng / loại xe / xuất xứ có trong kho shop (lọc theo company, model nếu có) */
export function getShopProductFilterOptions(params = {}) {
  return axiosClient.get("shop-filters", { params });
}

export function deleteProducts(ids) {
  return axiosClient.delete("/products", { data: { ids } });
}

export function deleteProduct(id) {
  return axiosClient.delete(`/products/${id}`);
}

/**
 * Stock-only inline update — hits the additive PATCH endpoint added
 * for the seller-ops mobile pass. Callers should treat the response
 * as the source of truth and rollback their optimistic UI on a
 * thrown error.
 */
export function updateProductStock(id, stock) {
  return axiosClient.patch(`/products/${id}/stock`, { stock });
}

export function getShopGovernanceStats() {
  return axiosClient.get("/products/shop/governance-stats");
}

export function getSellerProductTimeline(productId) {
  return axiosClient.get(`/products/${productId}/governance-timeline`);
}

export function resubmitProductForReview(productId, body = {}) {
  return axiosClient.post(`/products/${productId}/resubmit`, body);
}
