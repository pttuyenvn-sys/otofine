import { notFound } from "next/navigation";
import ProductDetail from "@/components/pages/ProductDetail";
import { getProductDetailCached } from "@/lib/product/getProductDetailCached";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import ProductJsonLd from "./ProductJsonLd";

function strip(html = "") {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await getProductDetailCached(id);
  const p = data?.product;
  if (!p) {
    return { title: "Sản phẩm | Otofine" };
  }

  const titleBase = strip(p.shortDescription || p.partName) || "Sản phẩm";
  const title = `${titleBase} | Otofine`;
  const desc = `Mua ${titleBase} — mã ${p.partNumber || ""}. Xem giá và liên hệ cửa hàng trên Otofine.`;

  const path = p.slug
    ? `/product/${encodeURIComponent(p.slug)}`
    : `/product/${p.id}`;
  const canonical = absoluteUrl(path);

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

export default async function ProductPage({ params }) {
  const { id } = await params;
  const data = await getProductDetailCached(id);
  if (!data?.product) notFound();

  return (
    <>
      <ProductJsonLd data={data} />
      <ProductDetail />
    </>
  );
}
