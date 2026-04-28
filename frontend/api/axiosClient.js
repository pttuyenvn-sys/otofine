import axios from "axios";
import { API_BASE } from "../lib/config";

const axiosClient = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

axiosClient.interceptors.request.use(
  (config) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

export default axiosClient;
