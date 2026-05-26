"use client";
/**
 * Admin platform feature flag context.
 *
 * Provides read-only flag state to the admin subtree.
 * Initialised with server-fetched flags via AdminPlatformProvider.
 * Falls back to DEFAULT_FLAGS (all false) if initialFlags is not provided.
 *
 * DEFAULT_FLAGS camelCase keys must match FLAG_KEY_MAP values in
 * backend/modules/admin/config/adminPlatform.config.js (R4 parity constraint).
 */

import { createContext, useContext, useState } from "react";

export const DEFAULT_FLAGS = {
  platformEnabled:              false,
  rbacEnabled:                  false,
  auditLogEnabled:              false,
  moderationEnabled:            false,
  billingEnabled:               false,
  analyticsEnabled:             false,
  riskEngineEnabled:            false,
  sellerCrmEnabled:             false,
  paymentsEnabled:              false,
  subscriptionEnforcementEnabled: false,
};

const AdminPlatformContext = createContext(DEFAULT_FLAGS);

/**
 * @param {{ children: React.ReactNode, initialFlags?: Partial<typeof DEFAULT_FLAGS> }} props
 */
export function AdminPlatformProvider({ children, initialFlags }) {
  const [flags] = useState(() => ({
    ...DEFAULT_FLAGS,
    ...(initialFlags ?? {}),
  }));
  return (
    <AdminPlatformContext.Provider value={flags}>
      {children}
    </AdminPlatformContext.Provider>
  );
}

export function useAdminPlatformContext() {
  return useContext(AdminPlatformContext);
}
