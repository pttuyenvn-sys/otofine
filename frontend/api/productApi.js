import axiosClient from "@/api/axiosClient";

export const getProductsByShop = () => axiosClient.get("/products");
export const addProduct = (formData) =>
  axiosClient.post("/products", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
