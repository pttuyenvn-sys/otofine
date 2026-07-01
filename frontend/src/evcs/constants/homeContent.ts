/**
 * Homepage content — mock data for Sprint 03A+.
 * Sprint 04+ may load from API; UI must not hardcode business strings.
 */

export interface HeroContent {
  eyebrow: string;
  headline: string;
  lead: string;
  subline: string;
}

export interface KpiItem {
  id: string;
  value: string;
  label: string;
}

export const HERO_CONTENT: HeroContent = {
  eyebrow: "Năng lượng xanh",
  headline: "Kiến tạo hạ tầng sạc xanh cho tương lai",
  lead: "Tư vấn đầu tư trạm sạc VinFast — có chuyên gia đồng hành từ khảo sát đến vận hành.",
  subline:
    "Minh bạch từng bước — không áp lực, không ràng buộc khi trao đổi qua Zalo.",
};

export const HERO_KPI_ITEMS: KpiItem[] = [
  {
    id: "models",
    value: "50+",
    label: "Mô hình đầu tư đã tư vấn",
  },
  {
    id: "provinces",
    value: "63",
    label: "Tỉnh thành hỗ trợ khảo sát",
  },
  {
    id: "steps",
    value: "6",
    label: "Bước triển khai minh bạch",
  },
  {
    id: "support",
    value: "24/7",
    label: "Hỗ trợ kỹ thuật",
  },
];

export const SCROLL_INDICATOR = {
  label: "Khám phá thêm",
  targetId: "kpi",
};
