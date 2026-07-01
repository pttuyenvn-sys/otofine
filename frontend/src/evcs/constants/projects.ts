export interface CaseStudy {
  id: string;
  title: string;
  client: string;
  location: string;
  year: string;
  challenge: string;
  solution: string;
  results: string[];
  metrics: Array<{ label: string; value: string }>;
}

/** Mock case studies — Sprint 02+ sẽ load từ API. */
export const MOCK_CASE_STUDIES: CaseStudy[] = [
  {
    id: "cs-01",
    title: "Trạm sạc VinFast hub khu đô thị",
    client: "Chủ đầu tư BĐS",
    location: "Hà Nội",
    year: "2025",
    challenge:
      "Cần bổ sung hạ tầng sạc cho cư dân, tăng giá trị dự án mà không làm phức tạp vận hành.",
    solution:
      "Thiết kế cụm trạm AC/DC, tích hợp quản lý từ xa và mô hình doanh thu chia sẻ với đối tác vận hành.",
    results: [
      "Triển khai 12 cổng sạc trong 6 tuần",
      "Tỷ lệ sử dụng trung bình 68% sau 3 tháng",
      "Tăng mức độ hài lòng cư dân theo khảo sát nội bộ",
    ],
    metrics: [
      { label: "Công suất", value: "120 kW" },
      { label: "Cổng sạc", value: "12" },
      { label: "Hoàn vốn dự kiến", value: "36 tháng" },
    ],
  },
  {
    id: "cs-02",
    title: "Trạm sạc fleet doanh nghiệp",
    client: "Đơn vị logistics",
    location: "Bình Dương",
    year: "2024",
    challenge:
      "Đội xe điện cần sạc nhanh trong ca làm việc, giảm thời gian chờ và chi phí điện.",
    solution:
      "Lắp đặt trạm DC fast charge tại depot, lập lịch sạc theo ca và báo cáo năng lượng hàng tháng.",
    results: [
      "Giảm 22% thời gian chờ sạc so với trạm công cộng",
      "Theo dõi chi phí điện theo từng xe",
      "Mở rộng thêm 8 cổng trong giai đoạn 2",
    ],
    metrics: [
      { label: "Công suất", value: "240 kW" },
      { label: "Xe fleet", value: "45" },
      { label: "Uptime", value: "99.2%" },
    ],
  },
];
