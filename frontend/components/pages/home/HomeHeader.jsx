"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * Header trang chủ: logo gọn, ô tìm kiếm lớn, nav ngắn, CTA người bán.
 * `searchDesktop` / `searchMobile` do Home render (cùng state tìm kiếm).
 */
export default function HomeHeader({
  onOpenFilter,
  onOpenMenu,
  searchDesktop,
  searchMobile,
}) {
  return (
    <header className="of-top-header">
      <div className="of-top-header__accent" aria-hidden />
      <div className="of-top-header__mobile-actions">
        <button
          type="button"
          onClick={() => onOpenFilter(true)}
          className="of-icon-btn of-icon-btn--primary"
        >
          Chọn xe
        </button>
        <Link href="/" className="of-mobile-logo" prefetch={false}>
          <Image
            src="/logo.png"
            alt="Otofine"
            width={160}
            height={40}
            priority
            sizes="120px"
            className="of-mobile-logo__img"
          />
        </Link>
        <button
          type="button"
          className="of-icon-btn"
          onClick={() => onOpenMenu(true)}
        >
          Danh mục
        </button>
      </div>
      {searchMobile}

      <div className="of-top-header__desktop">
        <div className="of-top-header__inner of-top-header__inner--no-search">
          <Link
            href="/"
            className="of-brand"
            aria-label="Otofine — về trang chủ" prefetch={false}>
            <Image
              src="/logo.png"
              alt="Otofine — phụ tùng ô tô"
              width={180}
              height={44}
              priority
              sizes="180px"
              className="of-brand__img"

            />
          </Link>
          <nav
            className="of-top-nav"
            aria-label="Điều hướng chính"
          >
            <Link href="/" className="of-top-nav__link" prefetch={false}>
              Trang chủ
            </Link>
            <span className="of-top-nav__link of-top-nav__link--muted">
              Tin &amp; hướng dẫn
            </span>
          </nav>
          {searchDesktop}
          <div className="of-top-header__ctas">
            <Link
              href="/shop/login"
              className="of-btn-ghost of-btn-ghost--sm" prefetch={false}>
              Đăng nhập
            </Link>
            <Link
              href="/shop/register"
              className="of-cta-seller of-btn-cta of-btn-cta--lg" prefetch={false}>
              Bán cùng Otofine
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
