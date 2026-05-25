import { notFound, permanentRedirect } from "next/navigation";
import { getProductDetailCached } from "@/lib/product/getProductDetailCached";
import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

/**
 * Legacy product detail URL.
 *
 *   /product/<id>     →  308 → /phu-tung/<slug>-<id>
 *   /product/sp-<id>  →  308 → /phu-tung/<slug>-<id>
 *
 * After the Phase migration to SEO-friendly URLs, every product
 * detail lives canonically at `/phu-tung/<slug>-<id>`. This route is
 * kept ALIVE for two reasons:
 *
 *   1. **Backlinks**: every external link / share / Google cache / RFQ
 *      receipt etc. still points at `/product/<id>`. Returning 410 or
 *      404 here would burn that SEO authority. Issuing a permanent
 *      redirect to the canonical URL preserves the link equity and
 *      tells crawlers to update their index in a single hop.
 *
 *   2. **No duplicate canonical surface**: by redirecting instead of
 *      rendering, there is exactly ONE URL where the product is ever
 *      served — no duplicate-content penalty, no split signal between
 *      legacy and new URLs.
 *
 * Note on status code: Next.js exposes `permanentRedirect()` which
 * issues HTTP 308 (Permanent Redirect, method-preserving). Google,
 * Bing, Yandex, GPTBot and other modern crawlers treat 308 identically
 * to 301 for canonicalization and link-equity transfer (see Google's
 * own Webmaster docs since 2020). The single-hop chain keeps the SEO
 * authority fully intact while letting us stay on the standard
 * Next.js helper rather than dropping to a custom middleware redirect.
 *
 * The page also intentionally keeps the cached fetch — that gives us
 * a clean `notFound()` path for `/product/9999999999` style probes so
 * crawlers don't end up redirected to a 404 (worse for crawl budget
 * than the 404 directly).
 */
export default async function LegacyProductRedirect({ params }) {
  const { id } = await params;
  if (!id) notFound();

  const data = await getProductDetailCached(id);
  if (!data?.product) notFound();

  const canonical = buildProductSeoUrl({ ...data.product, cars: data.cars });
  if (!canonical || canonical === "/") notFound();

  permanentRedirect(canonical);
}

export const dynamic = "force-dynamic";
