import { findShopLifecycleBySlug } from "../repositories/shopLifecycle.repository.js";

/**
 * Map DB public_status → sunset lifecycle DTO.
 *
 * @param {{ public_status?: string } | null | undefined} row
 * @returns {{ exists: boolean, publicStatus: string | null, redirectEligible: boolean }}
 */
export function resolveShopLifecycleFromRow(row) {
  if (!row) {
    return {
      exists: false,
      publicStatus: null,
      redirectEligible: false,
    };
  }

  const publicStatus = normalizePublicStatus(row.public_status);
  const redirectEligible =
    publicStatus === "private" || publicStatus === "suspended";

  return {
    exists: true,
    publicStatus,
    redirectEligible,
  };
}

/**
 * @param {string | null | undefined} raw
 * @returns {string}
 */
function normalizePublicStatus(raw) {
  const status = String(raw ?? "").trim().toLowerCase();
  if (!status) return "pending";
  // Seller "draft" is stored as pending in DB (migration 040 ENUM).
  if (status === "draft") return "pending";
  return status;
}

/**
 * @param {string} slug
 * @returns {Promise<{ exists: boolean, publicStatus: string | null, redirectEligible: boolean }>}
 */
export async function getPublicShopLifecycle(slug) {
  const row = await findShopLifecycleBySlug(slug);
  return resolveShopLifecycleFromRow(row);
}
