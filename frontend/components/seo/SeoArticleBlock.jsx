"use client";

import { useMemo } from "react";
import Link from "next/link";
import { API_ORIGIN } from "@/lib/config";
import { getProductDetailHref } from "@/lib/productDetailHref";
import { SEO_BASE_SLUG } from "@/lib/seo/slugify";
import { enhanceSeoArticleHtml } from "./seoArticleBodyEnhance";
import "./seo-article-card.css";
import "./seo-article-block-shell.css";

/**
 * Strip HTML for plain-text display (titles, shop names).
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

function formatMoney(v) {
  if (v === null || v === undefined || v === "") return "Liên hệ";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString("vi-VN")} ₫`;
}

function resolveImg(u) {
  if (!u) return "";
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `${API_ORIGIN}${s}`;
  return `${API_ORIGIN}/${s}`;
}

function shopBrowseHref(s) {
  const name = stripHtml(String(s?.name ?? "")).trim();
  return name
    ? `/${SEO_BASE_SLUG}?q=${encodeURIComponent(name)}`
    : `/${SEO_BASE_SLUG}`;
}

function faqHasContent(faq) {
  if (!faq?.kind) return false;
  if (faq.kind === "list") return Array.isArray(faq.items) && faq.items.length > 0;
  if (faq.kind === "textLines")
    return Array.isArray(faq.lines) && faq.lines.length > 0;
  if (faq.kind === "json") return faq.payload != null;
  return false;
}

/**
 * SEO article block — part-knowledge routes (inside Home column). Homepage grid unchanged.
 *
 * @param {{
 *   intro?: string,
 *   article?: string,
 *   shops?: unknown[],
 *   faq?: unknown,
 *   relatedLinks?: unknown,
 *   products?: unknown[],
 *   productThumbnails?: Record<string, string>,
 *   partDisplayName?: string,
 * }} props
 */
export default function SeoArticleBlock({
  intro = "",
  article = "",
  shops = [],
  faq = null,
  relatedLinks = null,
  products = [],
  productThumbnails = {},
  partDisplayName = "Phụ tùng",
}) {
  const introHtml = String(intro ?? "");
  const articleHtml = String(article ?? "");
  const shopList = Array.isArray(shops) ? shops : [];
  const productList = Array.isArray(products) ? products : [];

  const cross =
    relatedLinks == null
      ? null
      : Array.isArray(relatedLinks)
        ? relatedLinks
        : relatedLinks &&
            typeof relatedLinks === "object" &&
            Array.isArray(relatedLinks.items)
          ? relatedLinks.items
          : [];

  const showBottomCard =
    shopList.length > 0 ||
    faqHasContent(faq) ||
    (Array.isArray(cross) && cross.length > 0);

  const partLabel =
    stripHtml(String(partDisplayName || "Phụ tùng")) || "Phụ tùng";

  const richArticleHtml = useMemo(
    () =>
      enhanceSeoArticleHtml(articleHtml, {
        products: productList,
        productThumbnails,
        resolveImg,
        partDisplayName: partLabel,
        getProductDetailHref,
        formatMoney,
      }),
    [articleHtml, productList, productThumbnails, partLabel],
  );



  return (
    <div className="seo-ab-root">
      {introHtml.trim() ? (
        <div
          className="seo-ab-hero-intro"
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      ) : null}

      {richArticleHtml.trim() ? (
        <section className="seo-ab-unified-card" aria-label="Nội dung tư vấn">
          <article
            className="seo-article-content"
            itemScope
            itemType="https://schema.org/Article"
            dangerouslySetInnerHTML={{ __html: richArticleHtml }}
          />
        </section>
      ) : null}

      {showBottomCard ? (
        <section className="seo-bc-card" aria-label="Cửa hàng và liên quan">
          {shopList.length > 0 ? (
            <div className="seo-bc-section seo-bc-section--shops">
              <h2 className="seo-bc-heading">Cửa hàng liên quan</h2>
              <ul className="seo-bc-shop-list">
                {shopList.map((s) => {
                  const sid = s?.id;
                  const name = stripHtml(
                    String(s?.name ?? `Cửa hàng #${sid ?? ""}`),
                  );
                  const phone = s?.phone ? stripHtml(String(s.phone)) : "";
                  const count = Number.isFinite(Number(s?.total_products))
                    ? Number(s.total_products)
                    : null;

                  return (
                    <li key={sid ?? name}>
                      <div className="seo-bc-shop-layout">
                        <div className="seo-bc-shop-left">
                          <div className="seo-bc-shop-name">{name}</div>
                          <div className="seo-bc-shop-meta">
                            {count != null
                              ? `${count.toLocaleString("vi-VN")} tin đăng`
                              : ""}
                          </div>
                          {phone ? (
                            <a
                              className="seo-bc-shop-phone"
                              href={`tel:${String(s.phone).replace(/\D/g, "")}`}
                            >
                              {phone}
                            </a>
                          ) : (
                            <span className="seo-bc-shop-phone-muted">
                              —
                            </span>
                          )}
                        </div>
                        <div className="seo-bc-shop-actions">
                          <Link
                            href={shopBrowseHref(s)}
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

          {faqHasContent(faq) ? (
            <div className="seo-bc-section">
              <h2 className="seo-bc-heading">Câu hỏi thường gặp</h2>
              <FaqAccordion faq={faq} />
            </div>
          ) : null}

          {cross && cross.length > 0 ? (
            <div className="seo-bc-section">
              <h2 className="seo-bc-heading">Xem thêm</h2>
              <ul className="seo-bc-related-grid">
                {cross.map((x, idx) => {
                  const slugPart =
                    typeof x?.slug === "string"
                      ? x.slug
                      : typeof x?.slug_vi === "string"
                        ? x.slug_vi
                        : typeof x?.href === "string"
                          ? x.href.replace(/^\//, "")
                          : null;
                  const label =
                    x?.name ||
                    x?.title ||
                    x?.name_vi ||
                    x?.label ||
                    slugPart ||
                    "Xem tiếp";
                  if (!slugPart) return null;
                  const href =
                    typeof x?.href === "string" && x.href.startsWith("/")
                      ? x.href
                      : `/${String(slugPart).replace(/^\//, "")}`;
                  return (
                    <li key={`rel-${idx}-${slugPart}`}>
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
  );
}

function FaqAccordion({ faq }) {
  if (!faq?.kind) return null;
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
  return null;
}
