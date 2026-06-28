import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { stripPort } from "@/lib/shopHost";
import { buildShopLegacyCollectionRedirectTarget } from "@/lib/shopsite/shopLegacyCollectionRedirect";

/**
 * SHOP-SEO-LEGACY-02 — Apex fallback 301 when middleware does not run.
 * Primary redirect is in `middleware.js`.
 */
export default async function ShopLegacyCollectionRedirect({ params }) {
  const { slug } = await params;
  const h = await headers();
  const hostHeader = h.get("host") || "";
  const host = stripPort(hostHeader);
  const port = hostHeader.includes(":") ? hostHeader.split(":")[1] : "";
  const proto = `${h.get("x-forwarded-proto") || "https"}:`;

  const target = buildShopLegacyCollectionRedirectTarget(slug, {
    location: { hostname: host, port, protocol: proto },
  });
  if (target) permanentRedirect(target);

  permanentRedirect(`/shops/${slug}/phu-tung-o-to`);
}
