export type CtaVariant = "plan" | "quote" | "consult" | "survey" | "hotline";

export interface NavItem {
  label: string;
  href: string;
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface SocialLink {
  label: string;
  href: string;
  icon: "facebook" | "youtube" | "zalo" | "linkedin";
}

export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  hotline: string;
  hotlineDisplay: string;
  zaloUrl: string;
  email: string;
  address: string;
}

export interface PageHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  variant?: "default" | "dark" | "gradient";
}
