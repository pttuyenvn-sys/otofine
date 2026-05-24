/**
 * Hardcoded demo data for the isolated (shopsite) skeleton.
 *
 * Phase 1 only: NO API call, NO DB read. Replaced in Phase 2 by
 * the real `GET /api/public/shops/:slug` endpoint described in
 * `audit/shop-public-pages-overview.md`.
 */

export const shopDemo = {
  slug: "shop-demo",
  name: "Cửa hàng ô tô 355",
  shortDescription:
    "Chuyên phụ tùng - đồ chơi - chăm sóc ô tô chính hãng",
  verified: true,

  avatar: null,
  cover:
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=80",

  phone: "0965 123 456",
  zalo: "0965 123 456",
  facebook: {
    label: "fb.com/cuahangoto355",
    url: "https://facebook.com/",
  },
  email: "contact@cuahangoto355.vn",
  address: "Số 355, Đường Nguyễn Trãi, Thanh Xuân, Hà Nội",
  province: "Hà Nội",

  workingHoursShort: "08:00 - 18:00 (T2 - T7)",
  workingHoursLines: [
    "08:00 - 18:00 (Thứ 2 - Thứ 7)",
    "Chủ nhật: 08:00 - 12:00",
  ],

  rating: 4.9,
  ratingCount: 128,
  customerCount: "2.5k+",
  productCount: 1243,
  experienceYears: 5,

  intro:
    "Cửa hàng ô tô 355 chuyên cung cấp phụ tùng, đồ chơi và phụ kiện xe hơi chính hãng, chất lượng cao với giá tốt nhất thị trường. Uy tín - Chất lượng - Tận tâm là cam kết của chúng tôi.",

  introHtml: `
    <p>Cửa hàng ô tô 355 là đại lý phụ tùng ô tô uy tín tại Hà Nội với hơn 5 năm kinh nghiệm trong ngành. Chúng tôi cung cấp đầy đủ các loại phụ tùng, đồ chơi và phụ kiện cho hầu hết các dòng xe phổ thông tại Việt Nam.</p>
    <h3>Cam kết của chúng tôi</h3>
    <ul>
      <li>100% sản phẩm chính hãng, có nguồn gốc rõ ràng</li>
      <li>Giá cả cạnh tranh, minh bạch</li>
      <li>Tư vấn nhiệt tình bởi đội ngũ kỹ thuật giàu kinh nghiệm</li>
      <li>Giao hàng toàn quốc, đổi trả trong 7 ngày</li>
    </ul>
    <h3>Sản phẩm chủ lực</h3>
    <p>Nhớt động cơ, phụ tùng động cơ, hệ thống phanh, đèn chiếu sáng, phụ kiện nội thất và đồ chơi xe hơi cho các dòng xe Toyota, Honda, Mazda, Ford, Hyundai, Kia.</p>
    <h3>Dịch vụ hỗ trợ</h3>
    <p>Đội ngũ tư vấn của shop hoạt động từ 8h sáng đến 18h tối các ngày trong tuần, sẵn sàng hỗ trợ qua điện thoại, Zalo và Facebook. Đặt hàng nhanh - giao đúng hẹn - bảo hành dài hạn.</p>
  `,

  serviceHighlights: [
    {
      key: "authentic",
      title: "Sản phẩm chính hãng",
      icon: "shield",
    },
    {
      key: "price",
      title: "Giá cả cạnh tranh",
      icon: "tag",
    },
    {
      key: "advice",
      title: "Tư vấn chuyên nghiệp",
      icon: "headphones",
    },
    {
      key: "ship",
      title: "Giao hàng toàn quốc",
      icon: "truck",
    },
  ],

  serviceFooter: [
    {
      key: "authentic",
      title: "CAM KẾT CHÍNH HÃNG",
      desc: "100% sản phẩm chính hãng",
      icon: "shield",
    },
    {
      key: "return",
      title: "ĐỔI TRẢ DỄ DÀNG",
      desc: "Đổi trả trong 7 ngày",
      icon: "rotate",
    },
    {
      key: "ship",
      title: "GIAO HÀNG TOÀN QUỐC",
      desc: "Giao nhanh - đúng hẹn",
      icon: "truck",
    },
    {
      key: "advice",
      title: "TƯ VẤN MIỄN PHÍ",
      desc: "Hỗ trợ 24/7",
      icon: "headphones",
    },
  ],

  categories: [
    { id: 1, name: "Nhớt động cơ", slug: "nhot-dong-co" },
    { id: 2, name: "Phụ tùng động cơ", slug: "phu-tung-dong-co" },
    { id: 3, name: "Hệ thống phanh", slug: "he-thong-phanh" },
    { id: 4, name: "Đèn chiếu sáng", slug: "den-chieu-sang" },
    { id: 5, name: "Phụ kiện nội thất", slug: "phu-kien-noi-that" },
    { id: 6, name: "Đồ chơi ô tô", slug: "do-choi-o-to" },
    { id: 7, name: "Đồ điện - Công nghệ", slug: "do-dien-cong-nghe" },
  ],

  carBrands: [
    "Toyota",
    "Honda",
    "Mazda",
    "Ford",
    "Hyundai",
    "Kia",
    "Mitsubishi",
    "Nissan",
  ],

  promoBanner: {
    title: "PHỤ TÙNG CHÍNH HÃNG",
    headline: "UY TÍN - CHẤT LƯỢNG",
    headline2: "TẠO NIỀM TIN",
    cta: "Xem ngay",
    href: "/shop-demo/san-pham",
  },

  featuredProducts: [
    {
      id: "demo-1",
      productId: 1,
      name: "Nhớt động cơ Shell Helix Ultra 5W-30",
      price: 520000,
      category: "Nhớt động cơ",
      brand: "Shell",
      image:
        "https://images.unsplash.com/photo-1635764995049-4d4ae22c1c40?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "demo-2",
      productId: 2,
      name: "Má phanh trước Brembo cho Toyota",
      price: 1250000,
      category: "Má phanh",
      brand: "Brembo",
      image:
        "https://images.unsplash.com/photo-1486496146582-9ffcd0b2b2b7?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "demo-3",
      productId: 3,
      name: "Đèn LED X-Light V20 chân H11",
      price: 1980000,
      category: "Đèn chiếu sáng",
      brand: "X-Light",
      image:
        "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "demo-4",
      productId: 4,
      name: "Camera hành trình 70mai A500S",
      price: 2450000,
      category: "Đồ điện - Công nghệ",
      brand: "70mai",
      image:
        "https://images.unsplash.com/photo-1597007030739-6d2e7172ee7c?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "demo-5",
      productId: 5,
      name: "Thảm lót sàn 5D cao cấp cho Mazda CX-5",
      price: 1350000,
      category: "Phụ kiện nội thất",
      brand: "5D",
      image:
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=600&q=80",
    },
  ],

  allProducts: [
    {
      id: "p-1",
      productId: 1,
      name: "Nhớt động cơ Shell Helix Ultra 5W-30",
      price: 520000,
      category: "Nhớt động cơ",
      brand: "Shell",
      image:
        "https://images.unsplash.com/photo-1635764995049-4d4ae22c1c40?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-2",
      productId: 2,
      name: "Má phanh trước Brembo cho Toyota Camry",
      price: 1250000,
      category: "Má phanh",
      brand: "Brembo",
      image:
        "https://images.unsplash.com/photo-1486496146582-9ffcd0b2b2b7?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-3",
      productId: 3,
      name: "Đèn LED X-Light V20 chân H11",
      price: 1980000,
      category: "Đèn chiếu sáng",
      brand: "X-Light",
      image:
        "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-4",
      productId: 4,
      name: "Camera hành trình 70mai A500S",
      price: 2450000,
      category: "Đồ điện - Công nghệ",
      brand: "70mai",
      image:
        "https://images.unsplash.com/photo-1597007030739-6d2e7172ee7c?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-5",
      productId: 5,
      name: "Thảm lót sàn 5D cao cấp cho Mazda CX-5",
      price: 1350000,
      category: "Phụ kiện nội thất",
      brand: "5D",
      image:
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-6",
      productId: 6,
      name: "Lọc gió động cơ K&N cho Honda Civic",
      price: 850000,
      category: "Phụ tùng động cơ",
      brand: "K&N",
      image:
        "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-7",
      productId: 7,
      name: "Bình ắc quy GS 70Ah chính hãng",
      price: 2100000,
      category: "Phụ tùng động cơ",
      brand: "GS",
      image:
        "https://images.unsplash.com/photo-1632823471565-1ec3c6a1f7a0?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-8",
      productId: 8,
      name: "Bộ phim cách nhiệt 3M Crystalline 70%",
      price: 4500000,
      category: "Phụ kiện nội thất",
      brand: "3M",
      image:
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-9",
      productId: 9,
      name: "Cảm biến áp suất lốp TPMS gắn ngoài",
      price: 1850000,
      category: "Đồ điện - Công nghệ",
      brand: "TPMS",
      image:
        "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "p-10",
      productId: 10,
      name: "Bộ ghế da Nappa cao cấp cho Ford Ranger",
      price: 12500000,
      category: "Đồ chơi ô tô",
      brand: "Nappa",
      image:
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=600&q=80",
    },
  ],
};

export function formatPrice(value) {
  if (value == null) return "Liên hệ";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Liên hệ";
  return `${n.toLocaleString("vi-VN")}đ`;
}
