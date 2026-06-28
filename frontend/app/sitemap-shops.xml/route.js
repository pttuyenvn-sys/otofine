import { createGroupSitemapHandler } from "@/lib/seo/sitemap/createGroupSitemapHandler.server.js";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const handler = createGroupSitemapHandler("shops");
export const GET = handler.GET;
