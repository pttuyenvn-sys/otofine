import AdminGuard from "@/components/AdminGuard";
import AdminPartKnowledge from "@/components/pages/AdminPartKnowledge";

export default function Page() {
  return (
    <AdminGuard>
      <div className="main-content" style={{ padding: 24 }}>
        <AdminPartKnowledge />
      </div>
    </AdminGuard>
  );
}
