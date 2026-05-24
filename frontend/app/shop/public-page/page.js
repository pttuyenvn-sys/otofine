import ShopGuard from "@/components/ShopGuard";
import ShopPublicPage from "@/components/pages/ShopPublicPage";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ShopGuard>
      <ShopPublicPage />
    </ShopGuard>
  );
}
