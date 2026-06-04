 "use client";
 import React from "react";
 import PartKnowledgeSeoPage from "@/components/seo/PartKnowledgeSeoPage";

 export default function SeoContent({ data, slug, imageProducts }) {
   return data ? (
     <PartKnowledgeSeoPage data={data} slug={slug} imageProducts={imageProducts} />
   ) : null;
 }

