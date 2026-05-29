import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function adminAllowed() {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.OTOFINE_SEO_ADMIN === "1";
}

export const metadata = {
  title: "SEO routes (new engine) | Otofine",
  robots: { index: false, follow: false },
};

export default function SeoAdminPages() {
  if (!adminAllowed()) notFound();

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1>SEO — engine mới</h1>
      <p style={{ color: "#64748b", lineHeight: 1.6 }}>
        Registry JSON và trang quản trị cũ đã ngừng. URL SEO được phục vụ từ bảng{" "}
        <code>seo_routes</code>, nội dung cache trong <code>seo_page_cache</code>, và API{" "}
        <code>GET /api/seo-page/:slug</code> trên backend Express. Trang chủ-shell phụ tùng dùng{" "}
        <code>SeoArticleBlock</code> (part-knowledge engine).
      </p>
      <p style={{ marginTop: 16 }}>
        Dọn cache / tái compose: chạy script rebuild SEO trên server backend (đồng bộ với{" "}
        <code>npm run rebuild:seo-cache</code> hoặc quy trình deploy của bạn).
      </p>
    </div>
  );
}
