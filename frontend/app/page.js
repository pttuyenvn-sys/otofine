import { Suspense } from "react";
import dynamic from "next/dynamic";
import { getSiteUrl } from "@/lib/seo/siteUrl";
import FaqPageJsonLd from "@/components/seo/FaqPageJsonLd";

export const metadata = {
  title: "Tìm phụ tùng đúng xe trong 10 giây | Otofine",
  description:
    "Chợ phụ tùng ô tô: tìm theo hãng, dòng xe, mã phụ tùng; giá minh bạch, shop xác minh, thân thiện mobile — Otofine.",
  alternates: {
    canonical: getSiteUrl(),
  },
  openGraph: {
    url: getSiteUrl(),
    title: "Tìm phụ tùng đúng xe trong 10 giây | Otofine",
    description:
      "So sánh giá nhiều cửa hàng, tìm đúng phụ tùng theo xe. Otofine — marketplace phụ tùng minh bạch.",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Otofine — phụ tùng ô tô" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tìm phụ tùng đúng xe | Otofine",
    description:
      "Chợ phụ tùng minh bạch: Toyota, Honda, Hyundai, Kia, Mazda… Tìm theo xe, gọi shop ngay.",
    images: ["/logo.png"],
  },
  keywords: [
    "phụ tùng ô tô",
    "phụ tùng Toyota",
    "phụ tùng Honda",
    "phụ tùng Hyundai",
    "phụ tùng Kia",
    "phụ tùng Mazda",
    "phụ tùng Ford",
    "mua phụ tùng oto",
    "Otofine",
  ],
};

const Home = dynamic(() => import("@/components/pages/Home"), {
  ssr: true,
  loading: () => (
    <div className="home-page-loading" aria-busy="true" aria-label="Đang tải">
      <div className="home-page-loading__bar" />
      <div className="home-page-loading__bar home-page-loading__bar--short" />
      <div className="home-page-loading__grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="home-page-loading__card" />
        ))}
      </div>
    </div>
  ),
});

const homeLoading = (
  <div className="home-page-loading" aria-busy="true" aria-label="Đang tải">
    <div className="home-page-loading__bar" />
    <div className="home-page-loading__bar home-page-loading__bar--short" />
    <div className="home-page-loading__grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="home-page-loading__card" />
      ))}
    </div>
  </div>
);

export default function Page() {
  return (
    <>
      <FaqPageJsonLd />
      <Suspense fallback={homeLoading}>
        <Home />
      </Suspense>
    </>
  );
}
