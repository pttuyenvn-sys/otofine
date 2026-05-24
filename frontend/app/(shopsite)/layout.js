import ShopHeader from "@/components/shopsite/ShopHeader";
import ShopTabs from "@/components/shopsite/ShopTabs";
import { shopDemo } from "@/data/shop-demo";

export const metadata = {
  title: `${shopDemo.name} — Phụ tùng ô tô | Otofine`,
  description: shopDemo.shortDescription,
  robots: { index: false, follow: false },
};

export default function ShopSiteLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto w-full max-w-screen-xl px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-3">
        <ShopHeader shop={shopDemo} />
        <ShopTabs />
        <main className="space-y-3">{children}</main>
        <ShopFooter />
      </div>
    </div>
  );
}

function ShopFooter() {
  return (
    <footer className="py-6 text-center text-xs text-gray-500">
      © {new Date().getFullYear()} {shopDemo.name} · Powered by{" "}
      <a
        href="https://otofine.com"
        className="text-[#e60012] hover:underline font-medium"
      >
        Otofine
      </a>
    </footer>
  );
}
