import ShopGuard from "@/components/ShopGuard";
import ShopInsights from "@/components/pages/ShopInsights";

export const metadata = {
  title: "Hiệu quả shop — Otofine Seller Center",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <ShopGuard>
      <ShopInsights />
    </ShopGuard>
  );
}
