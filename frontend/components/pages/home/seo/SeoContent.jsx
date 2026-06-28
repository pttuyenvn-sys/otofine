"use client";
import React from "react";
import PartKnowledgeSeoPage from "@/components/seo/PartKnowledgeSeoPage";
import SeoArticleBlock from "@/components/seo/SeoArticleBlock";
import { buildDynamicListingSeoArticleHtml } from "@/lib/seo/dynamicListingSeoComposer";
import { resolveHomeSeoRender } from "./resolveHomeSeoRender";

function SeoContent({ data, slug, imageProducts }) {
  const gate = resolveHomeSeoRender(data);
  if (!gate.render) return null;

  if (gate.mode === "dynamic") {
    const content = data.content || {};
    const articleHtml = buildDynamicListingSeoArticleHtml(content);
    if (!articleHtml && !content.intro) return null;
    const displayName = String(content.title || "")
      .replace(/\s*\|\s*Otofine$/i, "")
      .trim();

    return (
      <SeoArticleBlock
        intro={String(content.intro || "")}
        article={articleHtml}
        relatedLinks={content.relatedLinks || []}
        imageProducts={imageProducts}
        partDisplayName={displayName || slug}
        context={{}}
      />
    );
  }

  return (
    <PartKnowledgeSeoPage
      data={data}
      slug={slug}
      imageProducts={imageProducts}
    />
  );
}

export default React.memo(SeoContent);
