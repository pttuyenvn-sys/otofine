import { notFound } from "next/navigation";
import ShopHeader from "@/components/shopsite/ShopHeader";
import ShopTabs from "@/components/shopsite/ShopTabs";
import {
  fetchPublicShop,
  fetchPublicShopSafe,
} from "@/services/shopPublic.service";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const shop = await fetchPublicShopSafe(slug);
  if (!shop) {
    return {
      title: "Shop không tồn tại — Otofine",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${shop.name} — Phụ tùng ô tô | Otofine`,
    description: shop.shortDescription || `Phụ tùng ô tô — ${shop.name}`,
    robots: { index: false, follow: false }, // Phase 2: indexing arrives with subdomain in Phase 3
  };
}

/**
 * Dynamic shop tenant layout. Reads slug from URL params, calls the
 * public API once for the chrome (cover, avatar, name, contact CTAs).
 *
 * Fallback (shop missing OR public_status != 'public') → next/notFound().
 * The render passes `basePath="/shops/<slug>"` to ShopTabs so the four
 * tabs route correctly under the dynamic prefix.
 */
export default async function ShopTenantLayout({ children, params }) {
  const { slug } = await params;
  const shop = await fetchPublicShop(slug);
  if (!shop) notFound();

  return (
    <>
      <ShopHeader shop={mapToHeaderShape(shop)} />
      <ShopTabs basePath={`/shops/${shop.slug}`} />
      <main className="space-y-3">{children}</main>
      <footer className="py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} {shop.name} · Powered by{" "}
        <a
          href="https://otofine.com"
          className="text-[#e60012] hover:underline font-medium"
        >
          Otofine
        </a>
      </footer>
    </>
  );
}

/**
 * Bridge API DTO (snake-ish / camelCase mix) to the shape ShopHeader.jsx
 * expects (originally fed by the Phase 1 hardcoded shopDemo object).
 * Defaults preserve a sane UI when fields are NULL in the DB.
 */
function mapToHeaderShape(shop) {
  return {
    name: shop.name,
    shortDescription: shop.shortDescription || "",
    verified: !!shop.verified,
    avatar: shop.avatar,
    cover: shop.cover,
    phone: shop.phone || "",
    zalo: shop.zalo || shop.phone || "",
    province: shop.province || "Việt Nam",
    rating: 4.9,
    ratingCount: 0,
    customerCount: shop.productCount
      ? `${Math.max(1, Math.floor(shop.productCount / 100))}k+`
      : "—",
    workingHoursShort: shop.workingHoursShort || "Liên hệ shop",
  };
}
