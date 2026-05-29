// Centralized namespaced storage helpers for admin and shop auth.
// Use these helpers instead of accessing localStorage keys directly.

const SHOP_TOKEN = "shop:token";
const SHOP_REFRESH = "shop:refreshToken";
const SHOP_AUTH = "shop:auth";
const SHOP_ID = "shop:shopId";

const ADMIN_TOKEN = "admin:token";
const ADMIN_REFRESH = "admin:refreshToken";
const ADMIN_AUTH = "admin:auth";

export function getShopToken() {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(SHOP_TOKEN) : null;
  } catch {
    return null;
  }
}
export function setShopToken(v) {
  try {
    localStorage.setItem(SHOP_TOKEN, v);
  } catch {}
}
export function removeShopToken() {
  try {
    localStorage.removeItem(SHOP_TOKEN);
  } catch {}
}

export function getShopRefreshToken() {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(SHOP_REFRESH) : null;
  } catch {
    return null;
  }
}
export function setShopRefreshToken(v) {
  try {
    localStorage.setItem(SHOP_REFRESH, v);
  } catch {}
}
export function removeShopRefreshToken() {
  try {
    localStorage.removeItem(SHOP_REFRESH);
  } catch {}
}

export function getShopAuth() {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(SHOP_AUTH) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function setShopAuth(obj) {
  try {
    localStorage.setItem(SHOP_AUTH, JSON.stringify(obj));
  } catch {}
}
export function removeShopAuth() {
  try {
    localStorage.removeItem(SHOP_AUTH);
  } catch {}
}

export function getShopId() {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(SHOP_ID) : null;
  } catch {
    return null;
  }
}
export function setShopId(v) {
  try {
    localStorage.setItem(SHOP_ID, String(v));
  } catch {}
}
export function removeShopId() {
  try {
    localStorage.removeItem(SHOP_ID);
  } catch {}
}

// Admin helpers
export function getAdminToken() {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(ADMIN_TOKEN) : null;
  } catch {
    return null;
  }
}
export function setAdminToken(v) {
  try {
    localStorage.setItem(ADMIN_TOKEN, v);
  } catch {}
}
export function removeAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN);
  } catch {}
}

export function getAdminRefreshToken() {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(ADMIN_REFRESH) : null;
  } catch {
    return null;
  }
}
export function setAdminRefreshToken(v) {
  try {
    localStorage.setItem(ADMIN_REFRESH, v);
  } catch {}
}
export function removeAdminRefreshToken() {
  try {
    localStorage.removeItem(ADMIN_REFRESH);
  } catch {}
}

export function getAdminAuth() {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(ADMIN_AUTH) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function setAdminAuth(obj) {
  try {
    localStorage.setItem(ADMIN_AUTH, JSON.stringify(obj));
  } catch {}
}
export function removeAdminAuth() {
  try {
    localStorage.removeItem(ADMIN_AUTH);
  } catch {}
}

// Backwards-compat read helpers: used during migration only.
export function legacyGetToken() {
  try {
    return typeof window !== "undefined" ? localStorage.getItem("token") : null;
  } catch {
    return null;
  }
}

