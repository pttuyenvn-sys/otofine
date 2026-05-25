import "./globals.css";
import AppShell from "@/components/AppShell";
import SellerMobileBottomNav from "@/components/SellerMobileBottomNav";
import SellerToaster from "@/components/ui/SellerToaster";
import WebSiteJsonLd from "@/components/seo/WebSiteJsonLd";
import OrganizationJsonLd from "@/components/seo/OrganizationJsonLd";
import { getSiteUrl } from "@/lib/seo/siteUrl";
import { Inter } from "next/font/google";
import PushInit from "@/components/PushInit";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Otofine — Phụ tùng ô tô đúng xe, minh bạch giá",
  },
  description:
    "Tìm phụ tùng ô tô đúng dòng xe, so sánh giá nhiều cửa hàng, liên hệ nhanh — Otofine.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    siteName: "Otofine",
    locale: "vi_VN",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Otofine — phụ tùng ô tô" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Otofine — Phụ tùng ô tô",
    description:
      "Sàn phụ tùng: tìm theo hãng xe, so sánh giá, gọi shop — chuẩn marketplace 2026+.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className={inter.className}>
        <PushInit />
        <WebSiteJsonLd />
        <OrganizationJsonLd />
        <AppShell>{children}</AppShell>
        {/* Phone-only seller bottom nav. Lives outside AppShell so it
            remains visible on /rfq/shop/* (where AppShell is hidden).
            Visibility is fully owned by the component itself
            (path + auth gate); SSR renders null until hydration. */}
        <SellerMobileBottomNav />
        {/* Global toast surface — see SellerToaster. The component is
            zero-cost when idle (just a listener registered on the
            singleton store) so leaving it mounted at the root level
            is safe across every route. */}
        <SellerToaster />
      </body>
    </html>
  );
}
