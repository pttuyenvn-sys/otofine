import ShopHeader from "@/components/shopsite/ShopHeader";
import ShopTabs from "@/components/shopsite/ShopTabs";
import { shopDemo } from "@/data/shop-demo";

export const metadata = {
  title: `${shopDemo.name} — Phụ tùng ô tô | Otofine`,
  description: shopDemo.shortDescription,
  robots: { index: false, follow: false },
};

/**
 * Phase 1 hardcoded shop kept ALONGSIDE the new DB-backed
 * `/shops/[slug]` tree so we can compare UI / debug without DB.
 */
export default function ShopDemoLayout({ children }) {
  return (
    <>
      <ShopHeader shop={shopDemo} />
      <ShopTabs basePath="/shop-demo" />
      <main className="space-y-3">{children}</main>
      <footer className="py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} {shopDemo.name} · Powered by{" "}
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
