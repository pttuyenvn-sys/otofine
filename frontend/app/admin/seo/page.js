import { notFound } from "next/navigation";

export const metadata = {
  title: "SEO article cache | Otofine",
  robots: { index: false, follow: false },
};

export default function AdminSeoPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_SEO_ADMIN !== "1") {
    notFound();
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>SEO — cache (đã đổi nguồn)</h1>
      <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
        Trang này trước đây liệt kê file JSON cache template trong repo. Pipeline đó đã ngừng; nội dung SEO
        nằm trong MySQL <code>seo_page_cache</code> và được phục vụ qua{" "}
        <code>GET /api/seo-page/:slug</code>.
      </p>
      <p style={{ marginTop: 16 }}>
        Xóa/refresh không còn qua <code>POST /api/seo/refresh</code>; dùng công cụ hoặc script rebuild trên
        backend.
      </p>
    </div>
  );
}
