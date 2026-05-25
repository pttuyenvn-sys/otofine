import ShopGuard from "@/components/ShopGuard";
import ShopAccount from "@/components/pages/ShopAccount";

export default function Page() {
  return (
    <ShopGuard>
      <ShopAccount />
    </ShopGuard>
  );
}
