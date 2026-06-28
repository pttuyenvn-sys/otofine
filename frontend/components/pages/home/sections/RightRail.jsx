import Link from "next/link";
import QuoteCard from "@/components/pages/home/sections/QuoteCard";
import ShopRecommendRail from "@/components/pages/home/sections/ShopRecommendRail";

export default function RightRail({ brand = "" }) {
  return (
    <aside
      className="of-right-rail"
      aria-label="Hỗ trợ mua hàng &amp; lọc nhanh"
    >
      <div className="right-section right-section--trust">
        <h4 className="sidebar-trust-title">Mua hàng an tâm</h4>
        <ul className="sidebar-trust-list">
          <li>Shop xác minh</li>
          <li>Giá minh bạch</li>
          <li>Hỗ trợ tìm đúng phụ tùng</li>
        </ul>
        <Link
          href="/shop/register"
          className="sidebar-register-link"
          prefetch={false}
        >
          🏪 Đăng ký cửa hàng →
        </Link>
      </div>

      <div className="right-section right-section--frq">
        <QuoteCard />
      </div>

      <ShopRecommendRail brand={brand} />

      <div className="right-section right-section--maintenance">
        <h4 className="of-maintenance-title">Bảo dưỡng định kỳ</h4>
        <p className="of-maintenance-desc">
          Chọn mốc km để xem phụ tùng cần thay
        </p>
        <div className="of-maintenance-grid">
          <button type="button" className="of-maintenance-chip">5.000 km</button>
          <button type="button" className="of-maintenance-chip">10.000 km</button>
          <button type="button" className="of-maintenance-chip">20.000 km</button>
          <button type="button" className="of-maintenance-chip">40.000 km</button>
          <button type="button" className="of-maintenance-chip">80.000 km</button>
        </div>
      </div>
    </aside>
  );
}
