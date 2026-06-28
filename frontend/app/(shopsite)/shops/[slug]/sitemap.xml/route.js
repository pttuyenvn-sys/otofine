import { loadShopSeoSitemap } from "@/lib/shopseo/loadShopSeoSitemap.js";
import { renderSitemapUrlset, sitemapXmlResponse } from "@/lib/seo/sitemap/xml.server.js";

export const dynamic = "force-dynamic";
export const revalidate = 300;

/**
 * Shop-only sitemap — served on `{slug}.otofine.com/sitemap.xml`
 * via middleware rewrite. Never merged into marketplace sitemap.
 */
export async function GET(_request, { params }) {
  const { slug } = await params;
  const entries = await loadShopSeoSitemap(slug);
  return sitemapXmlResponse(renderSitemapUrlset(entries), 300);
}
