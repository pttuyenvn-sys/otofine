import AdminGuard from "@/components/AdminGuard";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminProtectedLayout({ children }) {
  return (
    <AdminGuard>
      <AdminShell>
        {children}
      </AdminShell>
    </AdminGuard>
  );
}
