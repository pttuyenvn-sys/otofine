/**
 * Convenience hook for consuming admin platform feature flags.
 *
 * Returns the same object as AdminPlatformContext — all 10 camelCase flags.
 * Must be used inside a component wrapped by AdminPlatformProvider.
 */

import { useAdminPlatformContext } from "../contexts/AdminPlatformContext.js";

export function useAdminPlatform() {
  return useAdminPlatformContext();
}
