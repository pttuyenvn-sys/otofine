import AdminGuard from "@/components/AdminGuard";
import AdminShops from "@/components/pages/AdminShops";

export default function Page() {
  return (
    <AdminGuard>
      <AdminShops />
    </AdminGuard>
  );
}
