import axios from "axios";
import { API_BASE } from "../lib/config";
import {
  getShopToken,
  getShopRefreshToken,
  setShopToken,
  setShopRefreshToken,
  removeShopToken,
  removeShopRefreshToken,
  removeShopAuth,
  removeShopId,
} from "../lib/auth/storage";
import { clearOwnerCookie } from "../lib/auth/sellerOwnerCookie";
import { isPublicStorefrontSurface } from "../lib/auth/isPublicStorefrontSurface";

const axiosClient = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

axiosClient.interceptors.request.use(
  (config) => {
    const token = getShopToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// Shop refresh single-flight + cross-tab propagation
let shopAuthChannel = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    shopAuthChannel = new BroadcastChannel("otofine-shop-auth");
    shopAuthChannel.addEventListener("message", (ev) => {
      try {
        const data = ev?.data;
        if (!data || data?.type !== "shop-refresh") return;
    if (data.token) setShopToken(data.token);
    if (data.refreshToken) setShopRefreshToken(data.refreshToken);
      } catch {}
    });
  } catch {
    shopAuthChannel = null;
  }
}

// Response interceptor to handle shop refresh on 401
axiosClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalConfig = error?.config;
    const status = error?.response?.status;
    if (status === 401 && originalConfig && !originalConfig._retry) {
      originalConfig._retry = true;
      if (!axiosClient._shopRefreshPromise) {
        console.log(`[AUTH-RUNTIME] frontend pid=${typeof window !== "undefined" ? window?.navigator?.userAgent : "ssr"} shop-refresh-start`);
        axiosClient._shopRefreshPromise = (async () => {
          try {
            const refreshToken = getShopRefreshToken();
            if (!refreshToken) throw new Error("no refresh token");
            const raw = axios.create({ baseURL: API_BASE });
            const r = await raw.post("/auth/shop-refresh", { refreshToken });
            const newToken = r?.data?.token;
            const newRefresh = r?.data?.refreshToken;
            if (!newToken) throw new Error("no token returned");
            try {
              setShopToken(newToken);
              if (newRefresh) setShopRefreshToken(newRefresh);
              if (shopAuthChannel) {
                try {
                  shopAuthChannel.postMessage({ type: "shop-refresh", token: newToken, refreshToken: newRefresh || null });
                } catch {}
              }
              console.log("[AUTH-RUNTIME] frontend shop-refresh-success");
            } catch {}
            return newToken;
          } catch (e) {
            console.log("[AUTH-RUNTIME] frontend shop-refresh-failed", e?.message || e);
            throw e;
          } finally {
            axiosClient._shopRefreshPromise = null;
          }
        })();
      }
      try {
        const token = await axiosClient._shopRefreshPromise;
        originalConfig.headers = originalConfig.headers || {};
        originalConfig.headers.Authorization = `Bearer ${token}`;
        return axiosClient(originalConfig);
      } catch (e) {
        const onPublicStorefront =
          typeof window !== "undefined" && isPublicStorefrontSurface();
        try {
          console.log(
            onPublicStorefront
              ? "[AUTH-RUNTIME] frontend clearing shop auth on public storefront (no redirect)"
              : "[AUTH-RUNTIME] frontend clearing localStorage and redirecting to /shop/login",
            e?.message || e,
          );
          removeShopToken();
          removeShopRefreshToken();
          removeShopAuth();
          removeShopId();
          if (onPublicStorefront) {
            clearOwnerCookie();
            window.dispatchEvent(new Event("auth-changed"));
          }
        } catch {}
        if (typeof window !== "undefined" && !onPublicStorefront) {
          window.location.href = "/shop/login";
        }
      }
    }
    return Promise.reject(error);
  },
);

export default axiosClient;
