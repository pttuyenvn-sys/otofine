"use client";

import { useMemo } from "react";
import Link from "next/link";
import SeoPublicHeader from "./SeoPublicHeader";
import SeoListingProductImage from "./SeoListingProductImage";
import { API_ORIGIN } from "@/lib/config";
import { SEO_BASE_SLUG } from "@/lib/seo/slugify";
import { getProductDetailHref } from "@/lib/productDetailHref";
import { enhanceSeoArticleHtml } from "./seoArticleBodyEnhance";
/** Header chrome only — avoids pulling homepage product/card layout */
import "@/components/pages/Home.css";
import "./seo-article-card.css";
import "./seo-article-block-shell.css";
import styles from "./PartKnowledgeSeoPage.module.css";

/**
 * Remove HTML markup for safe plain-text display (titles often store rich text).
 */
function stripHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function resolveImg(u) {
  if (!u) return "";
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `${API_ORIGIN}${s}`;
  return `${API_ORIGIN}/${s}`;
}

function formatMoney(v) {
  if (v === null || v === undefined || v === "") return "Liên hệ";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString("vi-VN")} ₫`;
}

function shopBrowseHref(name) {
  const n = stripHtml(String(name ?? "")).trim();
  return n
    ? `/${SEO_BASE_SLUG}?q=${encodeURIComponent(n)}`
    : `/${SEO_BASE_SLUG}`;
}

function JsonLd({ data }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

function faqHasContent(faq) {
  if (!faq?.kind) return false;
  if (faq.kind === "list") return Array.isArray(faq.items) && faq.items.length > 0;
  if (faq.kind === "textLines")
    return Array.isArray(faq.lines) && faq.lines.length > 0;
  if (faq.kind === "json") return faq.payload != null;
  return false;
}

function FaqAccordion({ faq }) {
  if (!faq?.kind)
    return <p className={styles.faqMuted}>Chưa có FAQ cho mục này.</p>;
  if (faq.kind === "list" && Array.isArray(faq.items)) {
    return (
      <div className="seo-bc-faq-accordion">
        {faq.items.map((row, i) => {
          if (row && typeof row === "object" && ("q" in row || "a" in row)) {
            const q = stripHtml(String(row.q || row.question || "?"));
            const a = stripHtml(String(row.a || row.answer || ""));
            return (
              <details key={i} className="seo-bc-faq-item">
                <summary>{q}</summary>
                <div className="seo-bc-faq-answer">{a}</div>
              </details>
            );
          }
          return (
            <details key={i} className="seo-bc-faq-item">
              <summary>Xem chi tiết</summary>
              <div className="seo-bc-faq-answer">{stripHtml(String(row))}</div>
            </details>
          );
        })}
      </div>
    );
  }
  if (faq.kind === "json" && faq.payload) {
    return (
      <pre className="seo-ab-faq-pre">
        {JSON.stringify(faq.payload, null, 2)}
      </pre>
    );
  }
  if (faq.kind === "textLines" && Array.isArray(faq.lines)) {
    return (
      <div className="seo-bc-faq-accordion">
        {faq.lines.map((line, idx) => (
          <details key={idx} className="seo-bc-faq-item">
            <summary>Xem chi tiết {idx + 1}</summary>
            <div className="seo-bc-faq-answer">{stripHtml(String(line))}</div>
          </details>
        ))}
      </div>
    );
  }
  return <p className={styles.faqMuted}>Chưa có FAQ cho mục này.</p>;
}

/**
 * @param {{ data: object, slug: string }} props
 */
export default function PartKnowledgeSeoPage({ data, slug }) {
  const route = data?.route ?? {};
  const products = Array.isArray(data?.products) ? data.products : [];
  const shops = Array.isArray(data?.shops) ? data.shops : [];
  const images = Array.isArray(data?.images) ? data.images : [];
  const seo = data?.seoContent ?? {};
  const rawH1 =
    typeof route.h1 === "string" && route.h1.trim()
      ? route.h1.trim()
      : String(data?.part?.name_vi ?? "").trim() || slug;
  const h1 = stripHtml(rawH1);

  const introHtml = seo.introHtml ?? "";
  const articleHtml = seo.articleHtml ?? "";
  const cross = seo.crossSell;
  const thumbMap = data?.productThumbnails ?? {};

  const partVi =
    (typeof data?.part?.name_vi === "string" && data.part.name_vi.trim()
      ? data.part.name_vi.trim()
      : "") || h1 || "Phụ tùng";

  const breadcrumb = [
    { name: "Trang chủ", href: "/" },
    { name: "Phụ tùng ô tô", href: `/${SEO_BASE_SLUG}` },
    { name: h1, href: `/${slug}` },
  ];

  const canonicalPath =
    typeof route.canonical_url === "string"
      ? route.canonical_url
      : `/${slug}`;

  const metaDesc =
    (typeof data?.meta_description === "string" && data.meta_description.trim()) ||
    stripHtml(String(seo?.rawFields?.summary ?? "")) ||
    h1;

  const articleLd =
    articleHtml || introHtml
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: h1,
          description: metaDesc,
          mainEntityOfPage: { "@type": "WebPage", "@id": canonicalPath },
        }
      : null;

  const crossItems = Array.isArray(cross)
    ? cross
    : cross && typeof cross === "object" && Array.isArray(cross.items)
      ? cross.items
      : [];

  const partLabel = stripHtml(String(partVi)).trim() || "Phụ tùng";

  const richArticleHtml = useMemo(
    () =>
      enhanceSeoArticleHtml(articleHtml, {
        products,
        productThumbnails: thumbMap,
        resolveImg,
        partDisplayName: partLabel,
        getProductDetailHref,
        formatMoney,
      }),
    [articleHtml, products, thumbMap, partLabel],
  );

  const hasArticleHtml = !!richArticleHtml?.trim?.();
  /** Show dashed empty banner only when không tin, không intro, không bài */
  const showListingEmptyBanner =
    !hasArticleHtml && !introHtml?.trim?.() && products.length === 0;

  const showBottomCard =
    shops.length > 0 ||
    faqHasContent(seo.faqStructured) ||
    crossItems.length > 0;

  return (
    <>
      {articleLd ? <JsonLd data={articleLd} /> : null}
      <section className={styles.shell} aria-label="Trang phụ tùng">
        <SeoPublicHeader />
        <main className={styles.mainContent}>
          <div className={styles.container}>
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              {breadcrumb.map((b, i) => (
                <span key={`${b.href}-${i}`}>
                  {i > 0 ? <span className={styles.bcSep}> / </span> : null}
                  {i === breadcrumb.length - 1 ? (
                    <span className={styles.bcCurrent}>{b.name}</span>
                  ) : (
                    <Link href={b.href} className={styles.bcLink}>
                      {b.name}
                    </Link>
                  )}
                </span>
              ))}
            </nav>

            <h1 className={styles.pageTitle}>{h1}</h1>

            {introHtml ? (
              <div
                className="seo-ab-hero-intro"
                dangerouslySetInnerHTML={{ __html: introHtml }}
              />
            ) : null}

            <section className={styles.gallery} aria-label="Ảnh sản phẩm">
              {images.length === 0 ? (
                <p className={styles.galleryEmpty}>
                  Đang cập nhật hình ảnh cho danh mục này.
                </p>
              ) : (
                <div className={styles.galleryInner}>
                  {images.slice(0, 12).map((img) => (
                    <figure
                      key={img.id ?? `${img.productId}-${img.url}`}
                      className={styles.galleryItem}
                    >
                      <SeoListingProductImage
                        src={resolveImg(img.url)}
                        alt=""
                        sizes="(max-width: 768px) 120px, 140px"
                      />
                    </figure>
                  ))}
                </div>
              )}
            </section>

            {hasArticleHtml ? (
              <section className="seo-ab-unified-card" aria-label="Nội dung chi tiết">
                <article
                  className="seo-article-content"
                  itemScope
                  itemType="https://schema.org/Article"
                  dangerouslySetInnerHTML={{ __html: richArticleHtml }}
                />
              </section>
            ) : null}

            {showListingEmptyBanner ? (
              <div className={styles.emptyProducts} role="status">
                <p className={styles.emptyProductsTitle}>
                  Chưa có tin đăng phù hợp
                </p>
                <p className={styles.emptyProductsSub}>
                  Các cửa hàng sẽ cập nhật hàng ngay khi có sẵn.
                </p>
              </div>
            ) : null}

            {showBottomCard ? (
              <section className="seo-bc-card" aria-label="Cửa hàng và liên quan">
                {shops.length > 0 ? (
                  <div className="seo-bc-section">
                    <h2 className="seo-bc-heading">Cửa hàng liên quan</h2>
                    <ul className="seo-bc-shop-list">
                      {shops.map((s) => {
                        const name = stripHtml(
                          String(s.name || `Cửa hàng #${s.id}`),
                        );
                        const count = Number.isFinite(Number(s.total_products))
                          ? Number(s.total_products)
                          : null;
                        return (
                          <li key={s.id}>
                            <div className="seo-bc-shop-layout">
                              <div className="seo-bc-shop-left">
                                <div className="seo-bc-shop-name">{name}</div>
                                <div className="seo-bc-shop-meta">
                                  {count != null
                                    ? `${count.toLocaleString("vi-VN")} tin đăng`
                                    : ""}
                                </div>
                                {s.phone ? (
                                  <a
                                    className="seo-bc-shop-phone"
                                    href={`tel:${String(s.phone).replace(/\D/g, "")}`}
                                  >
                                    {stripHtml(String(s.phone))}
                                  </a>
                                ) : (
                                  <span className="seo-bc-shop-phone-muted">
                                    —
                                  </span>
                                )}
                              </div>
                              <div className="seo-bc-shop-actions">
                                <Link
                                  href={shopBrowseHref(name)}
                                  className="seo-bc-shop-btn"
                                >
                                  Xem shop
                                </Link>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {faqHasContent(seo.faqStructured) ? (
                  <div className="seo-bc-section">
                    <h2 className="seo-bc-heading">Câu hỏi thường gặp</h2>
                    <FaqAccordion faq={seo.faqStructured} />
                  </div>
                ) : null}

                {crossItems.length > 0 ? (
                  <div className="seo-bc-section">
                    <h2 className="seo-bc-heading">Xem thêm</h2>
                    <ul className="seo-bc-related-grid">
                      {crossItems.map((x, idx) => {
                        const slugPart =
                          typeof x.slug === "string"
                            ? x.slug
                            : typeof x.slug_vi === "string"
                              ? x.slug_vi
                              : typeof x.href === "string"
                                ? x.href.replace(/^\//, "")
                                : null;
                        const label =
                          x.name ||
                          x.title ||
                          x.name_vi ||
                          x.label ||
                          slugPart ||
                          "Xem tiếp";
                        if (!slugPart) return null;
                        const href =
                          typeof x.href === "string" && x.href.startsWith("/")
                            ? x.href
                            : `/${String(slugPart).replace(/^\//, "")}`;
                        return (
                          <li key={`cross-${idx}-${slugPart}`}>
                            <Link href={href}>{stripHtml(String(label))}</Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </main>
      </section>
    </>
  );
}
