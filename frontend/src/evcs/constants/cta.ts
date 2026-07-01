import type { CtaVariant } from "@evcs/types";
import { SITE } from "@evcs/constants/site";

export interface CtaDefinition {
  variant: CtaVariant;
  label: string;
  href: string;
  description: string;
}

/** Mock CTA definitions — no business logic, static links only. */
export const CTA_DEFINITIONS: Record<CtaVariant, CtaDefinition> = {
  plan: {
    variant: "plan",
    label: "Nhận phương án đầu tư",
    href: SITE.zaloUrl,
    description: "Nhận phương án đầu tư trạm sạc qua Zalo",
  },
  quote: {
    variant: "quote",
    label: "Nhận báo giá",
    href: SITE.zaloUrl,
    description: "Nhận báo giá trạm sạc qua Zalo",
  },
  consult: {
    variant: "consult",
    label: "Tư vấn đầu tư",
    href: SITE.zaloUrl,
    description: "Trao đổi phương án đầu tư với chuyên gia",
  },
  survey: {
    variant: "survey",
    label: "Đặt lịch khảo sát",
    href: SITE.zaloUrl,
    description: "Đặt lịch khảo sát hiện trường qua Zalo",
  },
  hotline: {
    variant: "hotline",
    label: "Gọi Hotline",
    href: `tel:${SITE.hotline}`,
    description: `Gọi hotline ${SITE.hotlineDisplay}`,
  },
};
