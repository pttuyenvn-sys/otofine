import { notFound, permanentRedirect } from "next/navigation";
import ProductDetail from "@/components/pages/ProductDetail";
import { getProductDetailCached } from "@/lib/product/getProductDetailCached";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import {
  buildProductSeoSlug,
  buildProductSeoUrl,
  extractProductIdFromSeoSlug,
} from "@/lib/seo/productSeoUrl";
import ProductJsonLd from "./ProductJsonLd";

/**
 * Canonical product detail route.
 *
 *   /phu-tung/<slug>-<productId>
 *
 * Lookup contract (per Phase: SEO-friendly product URLs):
 *
 *   1. Parse `[slug]` purely as a string: pull the trailing numeric
 *      id; the slug prefix is ignored for the DB call. There is NO
 *      slug column on `products`, NO slug table, NO migration — the
 *      slug is computed from product fields at render time.
 *
 *   2. Fetch product by id ONLY. Even a wildly wrong slug like
 *      "asdf-2913" returns the same product as the canonical URL —
 *      this is the same pattern used by Shopee, Lazada, Tiki, Amazon.
 *
 *   3. After loading, compute the canonical slug from the product +
 *      car fitment data and 308-redirect any drifted request to it.
 *      Modern crawlers (Google, Bing, GPTBot, etc.) treat 308 as
 *      identical to 301 for canonicalization, and the redirect chain
 *      is a single hop. The `permanentRedirect` from `next/navigation`
 *      is what Next.js exposes; the underlying HTTP status is 308.
 *
 *   4. The legacy `/product/:id` route lives on as a thin redirect-
 *      only server component pointing here (see
 *      `app/product/[id]/page.js`). Old backlinks therefore remain
 *      reachable indefinitely without code duplication.
 */
function stripHtml(html = "") {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const id = extractProductIdFromSeoSlug(slug);
  if (id == null) return { title: "Sản phẩm | Otofine" };

  const data = await getProductDetailCached(id);
  const p = data?.product;
  if (!p) return { title: "Sản phẩm | Otofine" };

  const titleBase = stripHtml(p.shortDescription || p.partName) || "Sản phẩm";
  const title = `${titleBase} | Otofine`;
  const desc = `Mua ${titleBase} — mã ${p.partNumber || ""}. Xem giá và liên hệ cửa hàng trên Otofine.`;
  // Canonical is ALWAYS the freshly-computed canonical URL, never the
  // request URL — guards against social shares of drifted slugs being
  // indexed as duplicates of the canonical page.
  const canonical = absoluteUrl(buildProductSeoUrl({ ...p, cars: data.cars }));

  return {
    title,
    description: desc.slice(0, 320),
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: desc.slice(0, 200),
      url: canonical,
      siteName: "Otofine",
      locale: "vi_VN",
      type: "website",
      images: p.image ? [{ url: p.image }] : [{ url: "/logo.png" }],
    },
  };
}

export default async function ProductBySlugPage({ params }) {
  const { slug } = await params;

  const id = extractProductIdFromSeoSlug(slug);
  if (id == null) notFound();

  const data = await getProductDetailCached(id);
  if (!data?.product) notFound();

  // Drift check: compare the requested slug against the canonical
  // computed from current product fields. A mismatch can happen when:
  //   - the seller renamed the product / changed part number / added a
  //     car fitment after the URL was shared elsewhere,
  //   - an external system (search, RFQ card) generated a URL from a
  //     stale product snapshot,
  //   - a human typed the URL by hand and got the slug wrong,
  //   - the URL omitted the slug entirely (`/phu-tung/2913`).
  //
  // In every case the only reachable canonical URL is the one we
  // emit here; the redirect prevents duplicate indexing.
  const canonicalSlug = buildProductSeoSlug({ ...data.product, cars: data.cars });
  const canonicalPath = canonicalSlug
    ? `/phu-tung/${canonicalSlug}-${data.product.id}`
    : `/phu-tung/${data.product.id}`;
  const requestedPath = `/phu-tung/${slug}`;
  if (requestedPath !== canonicalPath) {
    permanentRedirect(canonicalPath);
  }

  return (
    <>
      <ProductJsonLd data={data} />
      <ProductDetail productId={data.product.id} />
    </>
  );
}
