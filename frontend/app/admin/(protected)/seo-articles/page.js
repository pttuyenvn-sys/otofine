import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function adminAllowed() {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.OTOFINE_SEO_ADMIN === "1";
}

export const metadata = {
  title: "SEO articles (legacy removed) | Otofine",
  robots: { index: false, follow: false },
};

export default function SeoArticlesAdminPage() {
  if (!adminAllowed()) notFound();

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1>SEO AI articles — đã ngừng (Next)</h1>
      <p style={{ color: "#64748b", lineHeight: 1.6 }}>
        Hàng đợi và file JSON AI cũ dưới <code>data/seo/articles</code> không còn được Next.js generate.
        Nội dung SEO thống nhất qua composer backend và <code>seo_page_cache</code>.
      </p>
      <p style={{ marginTop: 16 }}>
        Để làm mới một slug: dùng quy trình rebuild cache phía backend, không qua{" "}
        <code>/api/seo/ai-article/*</code>.
      </p>
    </div>
  );
}
