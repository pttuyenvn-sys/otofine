import { getSiteUrl } from "@/lib/seo/siteUrl";

export default function robots() {
  const base = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/shop/", "/admin/", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
