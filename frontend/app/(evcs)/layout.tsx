import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { EvcsFooter } from "@evcs/components/layout/EvcsFooter";
import { EvcsHeader } from "@evcs/components/layout/EvcsHeader";
import { EvcsLayout } from "@evcs/components/layout/EvcsLayout";
import { SITE } from "@evcs/constants/site";
import "@evcs/styles/evcs.css";

const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-evcs-sans",
});

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-evcs-display",
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  robots: { index: true, follow: true },
};

export default function EvcsRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`evcs-scope ${dmSans.variable} ${outfit.variable}`}
      data-evcs-site="true"
    >
      <EvcsHeader />
      <EvcsLayout>{children}</EvcsLayout>
      <EvcsFooter />
    </div>
  );
}
