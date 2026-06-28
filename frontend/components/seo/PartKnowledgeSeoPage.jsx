"use client";

import "./seo-article-card.css";
import "./seo-article-block-shell.css";
import SeoArticleBlock from "./SeoArticleBlock";

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

/**
 * @param {{ data: object, slug: string, imageProducts?: unknown[] }} props
 */
export default function PartKnowledgeSeoPage({ data, slug, imageProducts = [] }) {
  const route = data?.route ?? {};
  const rawH1 =
    typeof route.h1 === "string" && route.h1.trim()
      ? route.h1.trim()
      : String(data?.part?.name_vi ?? "").trim() || slug;
  const h1 = stripHtml(rawH1);
  const introHtml =
    data?.seoContent?.introHtml ||
    data?.intro_html ||
    "";
  const rawHtml =
    data?.seoContent?.articleHtml ||
    data?.article_html ||
    data?.part?.body ||
    "";

  const articleHtml = rawHtml
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">");

  if (!articleHtml) {
    return null;
  }

  return (
    <SeoArticleBlock
      intro={introHtml}
      article={articleHtml}
      shops={data?.shops ?? []}
      faq={data?.seoContent?.faqStructured ?? data?.faq_json}
      relatedLinks={data?.seoContent?.crossSell}
      products={data?.products ?? []}
      imageProducts={imageProducts}
      productThumbnails={data?.productThumbnails ?? {}}
      partDisplayName={h1}
      context={data?.context ?? null}
    />
  );
}
