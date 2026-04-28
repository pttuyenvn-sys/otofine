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
