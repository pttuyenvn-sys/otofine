import type { FooterLink, NavItem, SocialLink } from "@evcs/types";
import { EVCS_ROUTES } from "@evcs/constants/routes";

/** Menu chính — toàn bộ nhãn tiếng Việt. */
export const MAIN_NAV: NavItem[] = [
  { label: "Trang chủ", href: EVCS_ROUTES.home },
  { label: "Giải pháp", href: EVCS_ROUTES.solutions },
  { label: "Trung tâm đầu tư", href: EVCS_ROUTES.investmentCenter },
  { label: "Học viện EV", href: EVCS_ROUTES.academy },
  { label: "Dự án", href: EVCS_ROUTES.projects },
  { label: "Liên hệ", href: EVCS_ROUTES.contact },
];

export const FOOTER_NAV: FooterLink[] = [
  { label: "Giải pháp", href: EVCS_ROUTES.solutions },
  { label: "Trung tâm đầu tư", href: EVCS_ROUTES.investmentCenter },
  { label: "Học viện EV", href: EVCS_ROUTES.academy },
  { label: "Dự án", href: EVCS_ROUTES.projects },
  { label: "Bản đồ trạm sạc", href: EVCS_ROUTES.stationMap },
  { label: "Liên hệ", href: EVCS_ROUTES.contact },
];

export const FOOTER_LEGAL: FooterLink[] = [
  { label: "Chính sách bảo mật", href: EVCS_ROUTES.contact },
  { label: "Điều khoản sử dụng", href: EVCS_ROUTES.contact },
  { label: "Chính sách cookie", href: EVCS_ROUTES.contact },
];

export const SOCIAL_LINKS: SocialLink[] = [
  { label: "Facebook", href: "#", icon: "facebook" },
  { label: "YouTube", href: "#", icon: "youtube" },
  { label: "Zalo", href: "https://zalo.me/evcs-mock", icon: "zalo" },
  { label: "LinkedIn", href: "#", icon: "linkedin" },
];
