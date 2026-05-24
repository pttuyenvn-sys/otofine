import { Suspense } from "react";
import ShopResetPassword from "@/components/pages/ShopResetPassword";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Đang tải...</div>}>
      <ShopResetPassword />
    </Suspense>
  );
}
