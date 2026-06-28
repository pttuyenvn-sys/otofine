/**
 * Feature flag for ListingIdentity shadow mode (ARCH-MP-03B.1).
 *
 * Enabled only when `LISTING_IDENTITY_SHADOW=true`.
 * When disabled, shadow entry returns null — zero runtime effect.
 */

export const LISTING_IDENTITY_SHADOW_ENV = "LISTING_IDENTITY_SHADOW";

export function isListingIdentityShadowEnabled(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? (process.env as Record<string, string | undefined>)
    : {},
): boolean {
  return String(env[LISTING_IDENTITY_SHADOW_ENV] || "")
    .trim()
    .toLowerCase() === "true";
}
