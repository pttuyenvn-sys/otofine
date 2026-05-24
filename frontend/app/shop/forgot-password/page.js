import { Suspense } from "react";
import ShopForgotPassword from "@/components/pages/ShopForgotPassword";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Đang tải...</div>}>
      <ShopForgotPassword />
    </Suspense>
  );
}
