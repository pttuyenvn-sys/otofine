import ShopGuard from "@/components/ShopGuard";
import ShopSettings from "@/components/pages/ShopSettings";

export default function Page() {
  return (
    <ShopGuard>
      <ShopSettings />
    </ShopGuard>
  );
}
