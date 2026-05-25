import { absoluteUrl } from "@/lib/seo/siteUrl";
import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

function strip(html = "") {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Product JSON-LD — shared by the apex `[slug]/page.js` product branch
 * and the legacy `/phu-tung/[slug]` (now redirect-only, but exported
 * here so any future route can reuse the same schema shape).
 *
 * Always emits the CANONICAL root-level URL via `buildProductSeoUrl`
 * so the schema.org Product / BreadcrumbList entities, the `og:url`,
 * and the Next.js `<link rel="canonical">` all line up to one URL.
 * Search engines receive zero conflicting signals about which URL
 * to index.
 *
 * Schema shape kept stable across the migration — only the URL field
 * changed, which is exactly what Google needs to update its index.
 */
export default function ProductJsonLd({ data }) {
  const p = data?.product;
  if (!p) return null;

  const name = strip(p.shortDescription || p.partName || "Sản phẩm");
  const url = absoluteUrl(buildProductSeoUrl({ ...p, cars: data.cars }));
  const image =
    p.image ||
    (Array.isArray(data.images) && data.images[0]
      ? data.images[0].image || data.images[0].url
      : null);

  const priceNum =
    p.price != null && p.price !== "" ? Number(p.price) : null;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Trang chủ", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name, item: url },
    ],
  };

  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    url,
    sku: p.partNumber || undefined,
    image: image ? [image] : undefined,
    brand: { "@type": "Brand", name: data?.shop?.name || "Otofine" },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "VND",
      price: Number.isFinite(priceNum) ? String(Math.round(priceNum)) : undefined,
      availability:
        p.stock != null && Number(p.stock) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/PreOrder",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": [breadcrumb, product] }) }}
    />
  );
}
