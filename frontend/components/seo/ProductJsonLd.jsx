import { resolveProductJsonLdUrl } from "@/lib/seo/resolveProductJsonLdUrl";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import {
  buildProductIdentity,
  pickPrimaryFitment,
} from "@/lib/identity/buildProductIdentity";

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
 * Product/Offer/Breadcrumb URLs prefer backend `canonicalUrl` /
 * `canonicalPath` from the detail API (ARCH-01H), with a local
 * `buildProductSeoUrl` fallback for legacy payloads.
 */
export default function ProductJsonLd({ data }) {
  const p = data?.product;
  if (!p) return null;

  const identity =
    data?.productIdentity ||
    buildProductIdentity(p, pickPrimaryFitment(data?.cars || []));
  const name = strip(identity.h1 || "Sản phẩm");
  const url = resolveProductJsonLdUrl(data);
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
