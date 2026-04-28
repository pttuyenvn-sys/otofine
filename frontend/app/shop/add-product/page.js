import ShopGuard from "@/components/ShopGuard";
import ShopAddProduct from "@/components/pages/ShopAddProduct";

export default function Page() {
  return (
    <ShopGuard>
      <ShopAddProduct />
    </ShopGuard>
  );
}
