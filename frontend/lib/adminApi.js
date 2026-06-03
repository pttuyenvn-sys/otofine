import axios from "axios";
import { API_BASE } from "@/lib/config";
import {
  getAdminToken,
  getAdminRefreshToken,
  setAdminToken,
  setAdminRefreshToken,
  removeAdminToken,
  removeAdminRefreshToken,
  removeAdminAuth,
} from "./auth/storage";

// Use namespaced admin token helper
function _getAdminToken() {
  return getAdminToken();
}

export const adminApi = axios.create({
  baseURL: API_BASE,
});

// Cross-tab coordination: update tokens across tabs when one tab refreshes.
let authChannel = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    authChannel = new BroadcastChannel("otofine-auth");
    authChannel.addEventListener("message", (ev) => {
      try {
        const data = ev?.data;
        if (!data || data?.type !== "refresh") return;
        if (data.token) setAdminToken(data.token);
        if (data.refreshToken) setAdminRefreshToken(data.refreshToken);
      } catch (e) {
        // ignore
      }
    });
  } catch {
    authChannel = null;
  }
}

adminApi.interceptors.request.use((config) => {
  const token = _getAdminToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Response interceptor: attempt refresh on 401 using stored refreshToken, retry once.
adminApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalConfig = error?.config;
    const status = error?.response?.status;

    if (status === 401 && originalConfig && !originalConfig._retry) {
      originalConfig._retry = true;

      // Single-flight refresh guard
      if (!adminApi._refreshPromise) {
        adminApi._refreshPromise = (async () => {
          try {
            const refreshToken = getAdminRefreshToken();
            if (!refreshToken) throw new Error("no refresh token");
            const raw = axios.create({ baseURL: API_BASE });
            const r = await raw.post("/auth/admin-refresh", { refreshToken });
            const newToken = r?.data?.token;
            const newRefresh = r?.data?.refreshToken;
            if (!newToken) throw new Error("no token returned");
            try {
              setAdminToken(newToken);
              if (newRefresh) setAdminRefreshToken(newRefresh);
              // Broadcast to other tabs
              if (authChannel) {
                try {
                  authChannel.postMessage({ type: "refresh", token: newToken, refreshToken: newRefresh || null });
                } catch {}
              }
            } catch {}
            return newToken;
          } catch (e) {
            // propagate failure
            throw e;
          } finally {
            // clear promise only when settled
            adminApi._refreshPromise = null;
          }
        })();
      }

      try {
        // Wait for the single refresh attempt to complete (either success or throw)
        const token = await adminApi._refreshPromise;
        // update header and retry original request
        originalConfig.headers = originalConfig.headers || {};
        originalConfig.headers.Authorization = `Bearer ${token}`;
        return adminApi(originalConfig);
      } catch (e) {
        // Refresh failed -> clear admin namespaced storage and redirect
        try {
          removeAdminToken();
          removeAdminRefreshToken();
          removeAdminAuth();
        } catch {}
        if (typeof window !== "undefined") {
          window.location.href = "/admin/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

export async function getEnforcementCases(params = {}) {
  return adminApi.get("/admin/enforcement/cases", {
    params,
  });
}

// ── Slice 7: Shop Suspension Operations UI ───────────────────────────────────

/**
 * Create a new enforcement case.
 * body: { target_type, target_id, case_type, severity, summary }
 */
export async function createEnforcementCase(body) {
  return adminApi.post("/admin/enforcement/cases", body);
}

/**
 * Execute a governance suspension against an open case.
 * body: { shopId, reason, suspension_type, suspend_login, duration_days? }
 * Backend computes expires_at from duration_days — do NOT pass expires_at from UI.
 */
export async function suspendShopOnCase(caseId, body) {
  return adminApi.post(`/admin/enforcement/cases/${caseId}/suspend`, body);
}

/**
 * Reinstate a governance-suspended shop via an existing case.
 * body: { shopId, lift_reason }
 */
export async function reinstateShopOnCase(caseId, body) {
  return adminApi.post(`/admin/enforcement/cases/${caseId}/reinstate`, body);
}

// ── Phase 2C: Audit UI ───────────────────────────────────────────────────────

/**
 * Get latest audit log entries.
 * Response: { rows: AuditRow[] }
 */
export async function getAuditLog(params = {}) {
  return adminApi.get("/admin/platform/audit-log", { params });
}

// ── Phase 2D: Sessions Governance UI ─────────────────────────────────────────

/**
 * List active admin sessions.
 * Response: { rows: SessionRow[] }
 */
export async function getAdminSessions(params = {}) {
  return adminApi.get("/admin/platform/sessions", { params });
}

/**
 * Revoke a specific admin session id (sid).
 * Response: { ok: true, alreadyRevoked?: true }
 */
export async function revokeAdminSession(sessionId, body = {}) {
  return adminApi.post(`/admin/platform/sessions/${sessionId}/revoke`, body);
}

// ── Phase 3A: Product Moderation Queue ───────────────────────────────────────

/**
 * List moderation queue / product governance products.
 * Query params:
 *  - page, limit (default 20, max 100)
 *  - pendingOnly=1, status, missingImage=1, missingPrice=1
 *  - shopId, search
 *
 * Response: { rows: ModerationProductRow[], pagination: { page, limit, total, totalPages } }
 */
export async function getProductModerationQueue(params = {}, options = {}) {
  return adminApi.get("/admin/platform/products/moderation", {
    params,
    signal: options.signal,
  });
}

/**
 * Lightweight shop list for moderation filters.
 * Query: search, limit
 * Response: { rows: [{ id, name }] }
 */
export async function getModerationShops(params = {}) {
  return adminApi.get("/admin/platform/products/moderation/shops", { params });
}

/**
 * Bulk moderate products.
 * Body: { ids: number[], action: 'approve'|'reject', reason?: string }
 */
export async function bulkModerateProducts(body) {
  return adminApi.post("/admin/platform/products/moderation/bulk", body);
}

/**
 * Reset moderation status for products (e.g., move back to pending_review).
 * Body: { productIds: number[], status: 'pending_review'|'approved'|'rejected'|'draft' }
 */
export async function resetModerationStatus(body) {
  return adminApi.post("/admin/platform/products/moderation/reset-status", body);
}

/**
 * Get moderation stats (counts per status and risk buckets).
 * Response: { pending, approved, rejected, draft, critical, high, medium, low }
 */
export async function getModerationStats() {
  return adminApi.get("/admin/platform/products/moderation/stats");
}

/**
 * Governance dashboard overview.
 * Response: { moderation, risk, marketplace, queue, sessions, recentActivity }
 */
export async function getGovernanceDashboard() {
  return adminApi.get("/admin/platform/governance/dashboard");
}

export async function getGovernanceHealth() {
  return adminApi.get("/admin/platform/governance/health");
}

export async function getShopGovernance(shopId) {
  return adminApi.get(`/admin/platform/shops/${shopId}/governance`);
}

export async function postShopGovernanceAction(shopId, body) {
  return adminApi.post(`/admin/platform/shops/${shopId}/governance/actions`, body);
}

/** GET storefront governance view — shops.id only */
export async function getShopStorefront(shopId) {
  return adminApi.get(`/admin/platform/shops/${shopId}/storefront`);
}

/** POST storefront action — slug + moderation lifecycle actions */
export async function postShopStorefrontAction(shopId, body) {
  return adminApi.post(`/admin/platform/shops/${shopId}/storefront`, body);
}

/**
 * Get moderation event history for a product.
 * Response: { rows: [...] }
 */
export async function getProductModerationDetail(productId, options = {}) {
  return adminApi.get(`/admin/platform/products/${productId}/moderation-detail`, {
    signal: options.signal,
  });
}

export async function getProductModerationEvents(productId) {
  return adminApi.get(`/admin/platform/products/${productId}/moderation-events`);
}

export async function getShopRisk(params = {}) {
  return adminApi.get("/admin/platform/shop-risk", { params });
}

export async function getEnforcementRiskFlags(params = {}) {
  return adminApi.get("/admin/enforcement/risk-flags", { params });
}