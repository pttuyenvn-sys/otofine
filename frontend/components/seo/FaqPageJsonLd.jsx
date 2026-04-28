import { absoluteUrl } from "@/lib/seo/siteUrl";

/**
 * FAQPage cho trang chủ — hỗ trợ rich result (không thay nội dung hiển thị).
 */
export default function FaqPageJsonLd() {
  const faqs = [
    {
      q: "Otofine bán phụ tùng như thế nào?",
      a: "Otofine là sàn kết nối người mua với cửa hàng phụ tùng: bạn tìm theo xe, danh mục hoặc mã phụ tùng, so sánh giá và liên hệ trực tiếp shop.",
    },
    {
      q: "Làm sao tìm phụ tùng đúng dòng xe Toyota, Hyundai, Kia?",
      a: "Chọn hãng và dòng xe ở bộ lọc bên trái, rồi tìm theo tên phụ tùng hoặc mã. Bạn cũng có thể mở các trang theo từ khóa SEO như “phụ tùng Toyota” trên Otofine.",
    },
    {
      q: "Cửa hàng bán hàng trên Otofine có tính phí không?",
      a: "Người bán đăng ký để hiển thị cửa hàng và sản phẩm, tiếp cận người mua tìm phụ tùng — xem mục đăng ký bán trên trang dành cho shop.",
    },
    {
      q: "Giá phụ tùng trên Otofine có minh bạch không?",
      a: "Giá do từng cửa hàng hiển thị; bạn nên gọi hoặc nhắn Zalo theo số trên từng sản phẩm để chốt giá và tình trạng hàng.",
    },
  ];

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: x.a,
      },
    })),
    url: absoluteUrl("/"),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
