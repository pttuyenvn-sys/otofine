import { absoluteUrl } from "@/lib/seo/siteUrl";

function strip(html = "") {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function ProductJsonLd({ data }) {
  const p = data?.product;
  if (!p) return null;

  const name = strip(p.shortDescription || p.partName || "Sản phẩm");
  const path = p.slug
    ? `/product/${encodeURIComponent(p.slug)}`
    : `/product/${p.id}`;
  const url = absoluteUrl(path);
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
      {
        "@type": "ListItem",
        position: 1,
        name: "Trang chủ",
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name,
        item: url,
      },
    ],
  };

  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    url,
    sku: p.partNumber || undefined,
    image: image ? [image] : undefined,
    brand: {
      "@type": "Brand",
      name: data?.shop?.name || "Otofine",
    },
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

  const graph = {
    "@context": "https://schema.org",
    "@graph": [breadcrumb, product],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
