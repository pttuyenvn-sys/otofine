import { notFound, permanentRedirect } from "next/navigation";
import { getProductDetailCached } from "@/lib/product/getProductDetailCached";
import { buildServerCanonicalProductUrl } from "@/lib/marketplace/serverCanonicalSlug";

/**
 * Short product-id fallback namespace.
 *
 *   /p/<id>  →  308 → /<slug>-<id>
 *
 * Why this exists:
 *
 *   1. The root canonical lives at `/<slug>-<id>` — the apex `[slug]`
 *      router needs the trailing-id pattern with a non-empty slug
 *      prefix to discriminate products from category / vehicle SEO
 *      landings. A bare `/2913` URL would collide with the SEO
 *      namespace (e.g. it'd fall through to vehicle-SEO parsing).
 *
 *   2. Callers that have ONLY the product id on hand (sitemap-build
 *      time, where the SEO data feed returns no descriptive fields,
 *      and the legacy `apexProductUrl(id)` API surface) need a
 *      stable, never-collidable namespace they can hand off to the
 *      canonical-enforce mechanism in a single 308 hop.
 *
 * This is the explicit short form. `buildProductSeoUrl({ id })` (no
 * slug fields) emits `/p/<id>` precisely so id-only callers hit this
 * redirect rather than guessing apex slugs.
 *
 * NOT indexed: this URL only ever 308-redirects, so search engines
 * see it as a pure canonicalization step. The destination canonical
 * carries the index-able content.
 */
export default async function ProductIdRedirect({ params, searchParams }) {
  const { id: idRaw } = await params;
  const query = await searchParams;
  const n = Number(idRaw);
  if (!Number.isFinite(n) || n <= 0) notFound();

  const data = await getProductDetailCached(n);
  if (!data?.product) notFound();

  const canonical = buildServerCanonicalProductUrl(
    data.product,
    data.cars,
    query,
  );
  if (!canonical || canonical === "/" || canonical === `/p/${n}`) {
    // The canonical builder degraded to `/p/<id>` itself (no slug
    // fields available) — avoid a redirect loop by rendering 404.
    // This is exceedingly rare; products always have at least a
    // partName in production data.
    notFound();
  }

  permanentRedirect(canonical);
}

export const dynamic = "force-dynamic";
