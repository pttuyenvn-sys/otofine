import Link from "next/link";

/** Header công khai — cùng class với Home để không lệch UI. */
export default function SeoPublicHeader() {
  return (
    <header className="header">
      <div className="header-accent-bar" aria-hidden />
      <div className="mobile-topbar">
        <Link href="/" className="mobile-btn mobile-btn-primary">
          Trang chủ
        </Link>
        <div className="mobile-logo">
          <img src="/logo.png" alt="Otofine — phụ tùng ô tô" />
          <div className="mobile-slogan">
            Phụ tùng chính hãng · Giao dịch minh bạch
          </div>
        </div>
        <Link href="/shop/login" className="mobile-btn">
          Cửa hàng
        </Link>
      </div>

      <div className="header-inner">
        <Link href="/" className="logo" style={{ textDecoration: "none", color: "inherit" }}>
          <img src="/logo.png" alt="Otofine — phụ tùng ô tô" />
          <div className="logo-text">Phụ tùng ô tô uy tín — đúng xe, đúng giá</div>
        </Link>

        <nav className="menu" aria-label="Điều hướng chính">
          <Link href="/" className="menu-link">
            Trang chủ
          </Link>
          <span className="menu-link menu-link-muted">Tin tức</span>
          <span className="menu-link menu-link-muted">Hướng dẫn</span>
        </nav>

        <div className="header-right">
          <Link href="/shop/login" className="shop-login-btn">
            Đăng nhập cửa hàng
          </Link>
        </div>
      </div>
    </header>
  );
}
