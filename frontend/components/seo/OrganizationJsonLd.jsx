import { absoluteUrl } from "@/lib/seo/siteUrl";

/**
 * Schema Organization — tăng trust, marketplace-ready (publisher / seller graph).
 */
export default function OrganizationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Otofine",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/logo.png"),
    description:
      "Nền tảng tìm mua phụ tùng ô tô đúng xe, kết nối người mua với cửa hàng trên toàn quốc.",
    sameAs: [],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
