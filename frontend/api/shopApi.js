import axiosClient from "@/api/axiosClient";

export const getBrands = () => axiosClient.get("/car/brands");

export const getModelsByBrand = (brand) =>
  axiosClient.get("/car/models", { params: { brand } });

export const getMyShop = () => axiosClient.get("/shop/me");

export const updateMyShop = (data) =>
  axiosClient.put("/shop/me", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const createShop = (data) =>
  axiosClient.post("/shop", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const uploadEditorImage = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return axiosClient.post("/shop/upload-editor", fd);
};

export default axiosClient;
