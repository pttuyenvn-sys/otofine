import { renderRootSitemapIndex } from "@/lib/seo/sitemap/createGroupSitemapHandler.server.js";

export const dynamic = "force-dynamic";
export const revalidate = 86400;

/** Apex sitemap index — always lists the four group sitemaps. */
export async function GET() {
  return renderRootSitemapIndex();
}
