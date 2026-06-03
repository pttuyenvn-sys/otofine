"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import SeoArticleProductImage from "./SeoArticleProductImage";
import { getProductDetailHref } from "@/lib/productDetailHref";
import { traceRenderedProductHref } from "@/lib/marketplace/marketplaceHrefTrace";
import "./seo-article-enriched.css";

const NO_IMAGE = "/no-image.png";

function formatMoney(v) {
  if (v === null || v === undefined || v === "") return "Lien he";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString("vi-VN")} ₫`;
}

function pickImages(products, count = 3) {
  const withImg = (products || []).filter(
    (p) => p?.image && String(p.image).trim() && !String(p.image).includes("no-image"),
  );
  if (withImg.length === 0) return [];
  const step = Math.max(1, Math.floor(withImg.length / count));
  const out = [];
  for (let i = 0; i < count && i * step < withImg.length; i++) {
    out.push(withImg[i * step]);
  }
  return out;
}

function dedupeProducts(products, max = 5) {
  const seen = new Set();
  const out = [];
  for (const p of products || []) {
    const key = (p.shortDescription || "").trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

function buildShopRanking(products) {
  const map = new Map();
  for (const p of products || []) {
    const name = (p.shopName || "").trim();
    if (!name) continue;
    const entry = map.get(name) || { shopName: name, count: 0 };
    entry.count += 1;
    map.set(name, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function ProductSnippet({ item, marketplaceContext = null }) {
  const href = traceRenderedProductHref({
    src: "seo",
    href: getProductDetailHref(item, { marketplaceContext }),
    item,
    marketplaceContext,
  });
  return (
    <Link href={href} className="sea-e-snippet" prefetch={false}>
      <div className="sea-e-snippet__img-wrap">
        <SeoArticleProductImage
          src={item.image || NO_IMAGE}
          alt={item.shortDescription || "Phu tung"}
          width={64}
          height={64}
          sizes="64px"
          className="sea-e-snippet__img"
        />
      </div>
      <div className="sea-e-snippet__body">
        <span className="sea-e-snippet__name">
          {item.shortDescription || "Phu tung o to"}
        </span>
        {item.partNumber ? (
          <span className="sea-e-snippet__sku">Ma: {item.partNumber}</span>
        ) : null}
        <span className="sea-e-snippet__price">
          Gia: {formatMoney(item.price)}
        </span>
      </div>
    </Link>
  );
}

function InlineImage({ product, caption }) {
  const src = product?.image || NO_IMAGE;
  const alt = product?.shortDescription || caption || "Phu tung o to";
  return (
    <figure className="sea-e-figure">
      <SeoArticleProductImage
        src={src}
        alt={alt}
        width={600}
        height={340}
        sizes="(max-width: 768px) 100vw, 600px"
        className="sea-e-figure__img"
      />
      <figcaption className="sea-e-figure__cap">{alt}</figcaption>
    </figure>
  );
}

function ShopTrustBlock({ shops }) {
  if (!shops || shops.length === 0) return null;
  return (
    <div className="sea-e-trust">
      <h3 className="sea-e-trust__title">Cua hang lien quan</h3>
      <div className="sea-e-shops">
        {shops.map((s) => (
          <div key={s.shopName} className="sea-e-shop">
            <div className="sea-e-shop__header">
              <span className="sea-e-shop__name">{s.shopName}</span>
              <span className="sea-e-shop__count">{s.count} san pham</span>
            </div>
            <div className="sea-e-shop__badges">
              <span className="sea-e-shop__badge sea-e-shop__badge--verified">Xac minh</span>
              <span className="sea-e-shop__badge sea-e-shop__badge--fast">Phan hoi nhanh</span>
              <span className="sea-e-shop__badge sea-e-shop__badge--support">Ho tro tim dung phu tung</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Enriched SEO article card — wraps raw introHtml + articleHtml
 * with product images, product snippets, shop trust, and CTA.
 */
export default function SeoArticleEnriched({
  introHtml = "",
  articleHtml = "",
  products = [],
  partDisplayName = "Phu tung",
  currentListingUrl = "/",
  marketplaceContext = null,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const images = useMemo(() => pickImages(products, 3), [products]);
  const snippets = useMemo(() => dedupeProducts(products, 5), [products]);
  const shops = useMemo(() => buildShopRanking(products), [products]);

  const articleSections = useMemo(() => {
    if (!articleHtml) return [];
    const parts = articleHtml.split(/(?=<h2[\s>])/i);
    return parts.filter((p) => p.trim());
  }, [articleHtml]);

  const symptomIdx = useMemo(() => {
    const idx = articleSections.findIndex(
      (s) => /dấu hiệu|triệu chứng|hư hỏng|symptoms/i.test(s),
    );
    return idx >= 0 ? idx : Math.min(1, articleSections.length - 1);
  }, [articleSections]);

  const preProductIdx = Math.max(0, articleSections.length - 1);

  return (
    <section className="sea-e-root">
      {/* Intro */}
      {introHtml ? (
        <div
          className="sea-e-intro otf-article-prose"
          dangerouslySetInnerHTML={{ __html: mounted ? introHtml : "" }}
        />
      ) : null}

      {/* Image 1: after intro */}
      {images[0] ? <InlineImage product={images[0]} caption={partDisplayName} /> : null}

      {/* Article sections */}
      {articleSections.map((html, idx) => (
        <div key={idx}>
          <div
            className="sea-e-section otf-article-prose"
            dangerouslySetInnerHTML={{
              __html: mounted ? html : ""
            }}
          />

          {/* Image 2: after symptoms section */}
          {idx === symptomIdx && images[1] ? (
            <InlineImage product={images[1]} caption={`${partDisplayName} - minh hoa`} />
          ) : null}

          {/* Image 3 + product snippets: before last section */}
          {idx === preProductIdx ? (
            <>
              {images[2] ? (
                <InlineImage product={images[2]} caption={partDisplayName} />
              ) : null}
              {snippets.length > 0 ? (
                <div className="sea-e-snippets">
                  <h3 className="sea-e-snippets__title">
                    San pham {partDisplayName} dang ban
                  </h3>
                  <div className="sea-e-snippets__grid">
                    {snippets.map((p) => (
                      <ProductSnippet
                        key={p.id}
                        item={p}
                        marketplaceContext={marketplaceContext}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ))}

      {/* Shop trust */}
      <ShopTrustBlock shops={shops} />

      {/* CTA */}
      <div className="sea-e-cta">
        <Link
          href={currentListingUrl}
          className="sea-e-cta__btn sea-e-cta__btn--primary" prefetch={false}>
          Xem san pham lien quan
        </Link>
        <Link
          href="/lien-he"
          className="sea-e-cta__btn sea-e-cta__btn--secondary" prefetch={false}>
          Lien he cua hang
        </Link>
      </div>
    </section>
  );
}
