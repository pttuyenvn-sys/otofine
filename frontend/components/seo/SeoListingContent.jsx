import Link from "next/link";
import { FiPhoneCall } from "react-icons/fi";
import SeoPublicHeader from "./SeoPublicHeader";
import SeoListingProductImage from "./SeoListingProductImage";
import "@/components/pages/Home.css";
import "./seo-landing.css";
import "./seo-article.css";
import { SEO_BASE_SLUG } from "@/lib/seo/slugify";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

function productHref(item) {
  // Root-level canonical /<slug>-<id>; apex `[slug]/page.js` canonical-
  // enforce branch repairs any slug drift, internal APIs remain
  // id-based. Falls back to short `/p/<id>` when item has no slug
  // fields — that route 308s to canonical in a single hop.
  return buildProductSeoUrl(item);
}

function pageHref(slug, n) {
  if (n <= 1) return `/${slug}`;
  return `/${slug}?page=${n}`;
}

function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function SeoListingContent({
  slug,
  parsed,
  list,
  page,
  showJsonLd = true,
}) {
  const products = list?.data || [];
  const totalPages = Math.max(1, Number(list?.totalPages) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const itemListElements = products.map((p, i) => ({
    "@type": "ListItem",
    position: (currentPage - 1) * 16 + i + 1,
    url: absoluteUrl(productHref(p)),
    name: p.shortDescription || p.partName || "Sản phẩm",
  }));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: parsed.breadcrumb.map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: b.name,
      item: absoluteUrl(b.href === "/" ? "/" : b.href),
    })),
  };

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: parsed.h1,
    numberOfItems: products.length,
    itemListElement: itemListElements,
  };

  return (
    <>
      {showJsonLd ? (
        <>
          <JsonLd data={breadcrumbLd} />
          <JsonLd data={itemListLd} />
        </>
      ) : null}

      <div>
        <SeoPublicHeader />
        <div className="page">
          <div className="home">
            <div className="container seo-landing-container">
              <div className="seo-landing-main">
                <nav className="seo-breadcrumb" aria-label="Breadcrumb">
                {parsed.breadcrumb.map((b, i) => {
                  const isLast = i === parsed.breadcrumb.length - 1;
                  return (
                    <span key={`${b.href}-${i}`}>
                      {i > 0 ? <span className="seo-bc-sep"> / </span> : null}
                      {isLast ? (
                        <span className="seo-bc-current" aria-current="page">
                          {b.name}
                        </span>
                      ) : (
                        <Link href={b.href} prefetch={false}>{b.name}</Link>
                      )}
                    </span>
                  );
                })}
                </nav>

                <h1 className="page-title seo-landing-h1">{parsed.h1}</h1>

                <p className="seo-landing-lead">
                {parsed.kind === "category"
                  ? `Tìm mua ${parsed.h1.replace(/\s+ô tô$/i, "")} chính hãng, đúng xe, giá minh bạch từ nhiều cửa hàng trên Otofine.`
                  : `Danh sách phụ tùng ${parsed.filters.brand ? `cho ${parsed.filters.brand}` : ""}${parsed.filters.model ? ` ${parsed.filters.model}` : ""}${parsed.filters.year ? ` đời ${parsed.filters.year}` : ""} — liên hệ trực tiếp cửa hàng để đặt hàng nhanh.`}
                </p>

                <div
                  id="otofine-products-start"
                  className="product-list-scroll-anchor"
                  aria-hidden
                />

                <div className="content-grid seo-landing-grid">
                  <div className="content-grid-primary">
                    <div className="center">
                      {products.length === 0 ? (
                        <div className="seo-empty-state" role="status">
                          <p className="seo-empty-state__title">
                            Chưa có sản phẩm phù hợp
                          </p>
                          <p className="seo-empty-state__sub">
                            Thử từ khóa hoặc danh mục khác, hoặc về trang chủ để
                            tìm kiếm thêm.
                          </p>
                          <Link className="seo-empty-state__cta" href="/" prefetch={false}>
                            Về trang chủ
                          </Link>
                        </div>
                      ) : null}

                      {products.map((item) => (
                      <div
                        key={item.id}
                        className="product seo-product-card"
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <Link
                          href={productHref(item)}
                          className="seo-product-card__overlay"
                          aria-label={
                            item.shortDescription || "Xem chi tiết sản phẩm"
                          } prefetch={false}>
                          <span className="seo-product-card__sr-only">
                            Xem chi tiết
                          </span>
                        </Link>
                        <div className="seo-product-card__inner">
                          <div className="product-top">
                            <h2 className="seo-card-title">
                              {item.shortDescription}
                            </h2>
                            <div className="product-price">{item.priceText}</div>
                          </div>

                          <div className="product-body">
                            <div className="product-image">
                              <div className="no-image-box">
                                <div className="no-image-icon">🖼️</div>
                                <span>Đang cập nhật ảnh</span>
                              </div>
                              <SeoListingProductImage
                                src={item.image}
                                alt=""
                                sizes="(max-width: 768px) 45vw, 180px"
                              />
                            </div>

                            <div className="product-content">
                              {(Array.isArray(item.cardHighlights) &&
                              item.cardHighlights.length > 0
                                ? item.cardHighlights
                                : String(item.summary || "")
                                    .split("\n")
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                              )
                                .slice(0, 3)
                                .map((line, i) => (
                                  <p
                                    key={`sub-${item.id}-${i}`}
                                    className={
                                      i === 0
                                        ? "seo-product-subtitle seo-product-subtitle--l1"
                                        : i === 1
                                          ? "seo-product-subtitle seo-product-subtitle--l2"
                                          : "seo-product-subtitle seo-product-subtitle--l3"
                                    }
                                  >
                                    {line}
                                  </p>
                                ))}
                            </div>

                            <div
                              className="product-right"
                              data-title={item.shortDescription}
                            >
                              <div className="mobile-price">
                                {item.priceText}
                              </div>
                              <a
                                className="phone phone-click"
                                href={`tel:${String(item.phone || "").replace(/\D/g, "")}`}
                              >
                                <FiPhoneCall className="phone-icon" />
                                <span className="phone-label">Liên hệ</span>
                                <span className="phone-number">{item.phone}</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                      ))}
                    </div>

                    {products.length > 0 && totalPages > 1 ? (
                    <nav
                      className="pagination product-pagination"
                      aria-label="Phân trang sản phẩm"
                    >
                      {currentPage <= 1 ? (
                        <span
                          className="page-btn page-btn-nav is-disabled"
                          aria-hidden
                        >
                          &lt;
                        </span>
                      ) : (
                        <Link
                          href={pageHref(slug, currentPage - 1)}
                          className="page-btn page-btn-nav"
                          scroll={false} prefetch={false}>
                          &lt;
                        </Link>
                      )}
                      {(() => {
                        const total = totalPages;
                        const current = currentPage;
                        const maxBtns = 5;
                        let start = Math.max(1, current - Math.floor(maxBtns / 2));
                        let end = Math.min(total, start + maxBtns - 1);
                        start = Math.max(1, end - maxBtns + 1);
                        const nums = [];
                        for (let i = start; i <= end; i += 1) nums.push(i);
                        return nums.map((n) => (
                          <Link
                            key={n}
                            href={pageHref(slug, n)}
                            className={`page-btn${n === current ? " active" : ""}`}
                            aria-current={n === current ? "page" : undefined}
                            scroll={false} prefetch={false}>
                            {n}
                          </Link>
                        ));
                      })()}
                      {currentPage >= totalPages ? (
                        <span
                          className="page-btn page-btn-nav is-disabled"
                          aria-hidden
                        >
                          &gt;
                        </span>
                      ) : (
                        <Link
                          href={pageHref(slug, currentPage + 1)}
                          className="page-btn page-btn-nav"
                          scroll={false} prefetch={false}>
                          &gt;
                        </Link>
                      )}
                    </nav>
                    ) : null}
                  </div>
                </div>

                <section
                  className="seo-landing-footer-note"
                  aria-label="Mô tả SEO"
                >
                  <p>
                    {slug === SEO_BASE_SLUG ? (
                      <>
                        Otofine là nền tảng kết nối người mua phụ tùng ô tô với
                        cửa hàng trên toàn quốc. Bạn có thể lọc theo hãng xe,
                        dòng xe, năm sản xuất và danh mục phụ tùng để tìm đúng
                        mã hàng.
                      </>
                    ) : (
                      <>
                        Trang {currentPage}: {parsed.h1} — thông tin giá và tồn
                        kho mang tính tham khảo; vui lòng liên hệ cửa hàng trước
                        khi đặt mua.
                      </>
                    )}
                  </p>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
