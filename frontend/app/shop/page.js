import { redirect } from "next/navigation";

/** Tránh /shop bị bắt bởi app/[slug] — chuyển vào khu vực cửa hàng. */
export default function ShopIndexPage() {
  redirect("/shop/login");
}
