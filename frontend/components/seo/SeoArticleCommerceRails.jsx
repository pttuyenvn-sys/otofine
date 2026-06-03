"use client";

import Link from "next/link";
import SeoArticleProductImage from "./SeoArticleProductImage";
import { traceRenderedProductHref } from "@/lib/marketplace/marketplaceHrefTrace";

export function SeoInlineProductFigure({ imageSrc, caption = "Phụ tùng ô tô" }) {
  if (!imageSrc) return null;

  return (
    <figure className="seo-article-inline-fig">
      <div className="seo-article-inline-fig__inner">
        <SeoArticleProductImage
          src={imageSrc}
          alt={caption}
          width={600}
          height={340}
          sizes="(max-width: 768px) 100vw, 640px"
          className="seo-article-inline-img"
        />
      </div>
    </figure>
  );
}

export function SeoTopProductsRail({
  products = [],
  partLabel = "Phụ tùng",
  vehicleLabel = "",
  getProductDetailHref,
  formatMoney,
  marketplaceContext = null,
}) {
  if (!products.length) return null;

  return (
    <section className="seo-commerce-block" aria-label="Sản phẩm liên quan">
      <h2 className="seo-top-products-h2">
        Top phụ tùng {partLabel} bán chạy
      </h2>
      <ul className="seo-top-products" aria-label={`Top ${partLabel}`}>
        {products.map((row) => {
          const href = traceRenderedProductHref({
            src: "seo",
            href: getProductDetailHref(row.product, { marketplaceContext }),
            item: row.product,
            marketplaceContext,
          });
          const title = row.title || "Sản phẩm";
          const price = formatMoney(row.price);
          const partNumber = row.partNumber;

          return (
            <li key={row.product?.id ?? `${title}-${href}`}>
              {row.imageSrc ? (
                <span className="seo-top-products__thumb">
                  <SeoArticleProductImage
                    src={row.imageSrc}
                    alt={title}
                    width={72}
                    height={72}
                    sizes="72px"
                  />
                </span>
              ) : null}
              <span className="seo-top-products__body">
                <Link href={href} className="seo-top-products__a" prefetch={false}>
                  {title}
                </Link>
                {vehicleLabel ? (
                  <span className="seo-top-products__compat">
                    Compatible with {vehicleLabel}
                  </span>
                ) : null}
                {partNumber ? (
                  <span className="seo-top-products__sku">Mã: {partNumber}</span>
                ) : null}
                <span className="seo-top-products__price">Giá: {price}</span>
                <Link href={href} className="seo-top-products__cta" prefetch={false}>
                  View product
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SeoTopShopsRail({ shops = [], label = "phụ tùng" }) {
  if (!shops.length) return null;

  return (
    <section
      className="seo-commerce-block seo-commerce-block--shops"
      aria-label="Cửa hàng liên quan"
    >
      <h2 className="seo-top-products-h2">
        Cửa hàng có nhiều phụ tùng {label}
      </h2>
      <ul className="seo-top-shops" aria-label={`Cửa hàng có nhiều ${label}`}>
        {shops.map((shop) => {
          const phoneHref = String(shop.phone || "").replace(/\D/g, "");
          const meta = [
            shop.location,
            `${Number(shop.count).toLocaleString("vi-VN")} sản phẩm liên quan`,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li key={shop.id || shop.name}>
              <span className="seo-top-shops__body">
                <span className="seo-top-shops__name">{shop.name}</span>
                <span className="seo-top-shops__meta">{meta}</span>
                {shop.phone ? (
                  <a className="seo-top-shops__phone" href={`tel:${phoneHref}`}>
                    {shop.phone}
                  </a>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
