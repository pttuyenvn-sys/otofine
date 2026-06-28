/**
 * Edge-safe public shop slug verification for middleware.
 *
 * Delegates to resolveShopLifecycle — public shops only.
 */
export { verifyPublicShopSlug } from "@/lib/shopsite/resolveShopLifecycle";
