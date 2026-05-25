import { notFound, permanentRedirect } from "next/navigation";
import { getProductDetailCached } from "@/lib/product/getProductDetailCached";
import {
  buildProductSeoUrl,
  extractProductIdFromSeoSlug,
} from "@/lib/seo/productSeoUrl";

/**
 * Legacy /phu-tung/<slug>-<id> URL.
 *
 *   /phu-tung/<anything>-<id>  →  308 → /<canonical-slug>-<id>
 *
 * After the root-level canonical migration, every product detail
 * lives at `/<slug>-<id>` (apex namespace, no `/phu-tung/` prefix).
 * This route is kept ALIVE — redirect-only — so any external link,
 * cached share preview, Google index entry, or RFQ receipt that
 * still points at the old `/phu-tung/...` form is repaired in a
 * single 308 hop directly to the new canonical. No redirect chain.
 *
 * The page intentionally resolves the canonical via the same fresh
 * `buildProductSeoUrl` helper the new canonical page uses — so a
 * `/phu-tung/<drifted-slug>-<id>` request never hops through the
 * apex slug router (which would mean two redirects). We jump
 * straight to the final root canonical.
 *
 * Note on status code: `permanentRedirect()` issues 308. Google /
 * Bing / Yandex / GPTBot treat 308 identically to 301 for
 * canonicalization and link-equity transfer (Google's own docs
 * since 2020).
 */
export default async function LegacyPhuTungRedirect({ params }) {
  const { slug } = await params;
  const id = extractProductIdFromSeoSlug(slug);
  if (id == null) notFound();

  const data = await getProductDetailCached(id);
  if (!data?.product) notFound();

  const canonical = buildProductSeoUrl({ ...data.product, cars: data.cars });
  if (!canonical || canonical === "/") notFound();

  permanentRedirect(canonical);
}

export const dynamic = "force-dynamic";
