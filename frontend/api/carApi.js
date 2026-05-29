import axiosClient from "@/api/axiosClient";

export const getBrands = () => axiosClient.get("/car/brands");

export const getModelsByBrand = (brand) =>
  axiosClient.get("/car/models", { params: { brand } });
