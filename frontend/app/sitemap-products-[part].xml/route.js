import { createGroupSitemapPartHandler } from "@/lib/seo/sitemap/createGroupSitemapHandler.server.js";

export const dynamic = "force-dynamic";
export const revalidate = 86400;

const handler = createGroupSitemapPartHandler("products");
export const GET = handler.GET;
