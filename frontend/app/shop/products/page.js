import ShopGuard from "@/components/ShopGuard";
import ShopProducts from "@/components/pages/products/ShopProducts";

export default function Page() {
  return (
    <ShopGuard>
      <ShopProducts />
    </ShopGuard>
  );
}
