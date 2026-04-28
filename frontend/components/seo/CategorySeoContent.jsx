import React from "react";
import Link from "next/link";
import { FiPhoneCall, FiTruck, FiShield, FiCheckCircle } from "react-icons/fi";
import { formatPrice, generateCategoryBreadcrumb } from "@/lib/seo/categorySeoContent";
import "./seo-landing.css";
import "./seo-article.css";

/**
 * JSON-LD structured data component
 */
function JsonLd({ data }) {
  if (!data) return null;
  
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * FAQ section component
 */
function FAQSection({ faqItems }) {
  if (!faqItems || faqItems.length === 0) return null;

  return (
    <section className="category-faq-section">
      <h2 className="category-section-title">Câu hỏi thường gặp về {faqItems[0]?.name?.split(' ')[0] || 'phụ tùng'}</h2>
      <div className="faq-container">
        {faqItems.map((faq, index) => (
          <details key={index} className="faq-item">
            <summary className="faq-question">{faq.name}</summary>
            <div className="faq-answer">
              <p>{faq.acceptAnswer?.text || 'Đang cập nhật câu trả lời...'}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/**
 * Related categories component
 */
function RelatedCategories({ categories, currentCategory }) {
  if (!categories || categories.length === 0) return null;

  return (
    <section className="related-categories-section">
      <h2 className="category-section-title">Danh mục phụ tùng liên quan</h2>
      <div className="related-categories-grid">
        {categories.map((category, index) => (
          <Link 
            key={index}
            href={`/${category.toLowerCase().replace(/\s+/g, '-')}-o-to`}
            className="related-category-card"
          >
            <div className="related-category-content">
              <h3 className="related-category-name">{category}</h3>
              <span className="related-category-arrow">→</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Trust badges component
 */
function TrustBadges() {
  return (
    <section className="trust-badges-section">
      <div className="trust-badges-grid">
        <div className="trust-badge">
          <FiShield className="trust-badge-icon" />
          <h4>Bảo hành uy tín</h4>
          <p>Sản phẩm chính hãng, bảo hành dài hạn</p>
        </div>
        <div className="trust-badge">
          <FiTruck className="trust-badge-icon" />
          <h4>Giao hàng nhanh</h4>
          <p>Giao hàng toàn quốc trong 24h</p>
        </div>
        <div className="trust-badge">
          <FiPhoneCall className="trust-badge-icon" />
          <h4>Tư vấn miễn phí</h4>
          <p>Đội ngũ kỹ thuật viên giàu kinh nghiệm</p>
        </div>
        <div className="trust-badge">
          <FiCheckCircle className="trust-badge-icon" />
          <h4>Chất lượng đảm bảo</h4>
          <p>Kiểm tra chất lượng trước khi giao hàng</p>
        </div>
      </div>
    </section>
  );
}

/**
 * Content section component
 */
function ContentSection({ section, index }) {
  return (
    <section key={index} className="category-content-section">
      <h2 className="category-section-title">{section.heading}</h2>
      <div 
        className="category-content-text"
        dangerouslySetInnerHTML={{ __html: section.content }}
      />
    </section>
  );
}

/**
 * Breadcrumb component
 */
function CategoryBreadcrumb({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <nav className="category-breadcrumb" aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        {items.map((item, index) => (
          <li key={index} className="breadcrumb-item">
            {index === items.length - 1 ? (
              <span className="breadcrumb-current">{item.name}</span>
            ) : (
              <Link href={item.href} className="breadcrumb-link">
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Price range component
 */
function PriceRange({ priceRange, productCount }) {
  if (!priceRange || (!priceRange.min && !priceRange.max)) return null;

  return (
    <div className="price-range-info">
      <div className="price-range-content">
        <span className="price-range-label">Khoảng giá:</span>
        {priceRange.min && priceRange.max ? (
          <span className="price-range-value">
            {formatPrice(priceRange.min)} - {formatPrice(priceRange.max)}
          </span>
        ) : priceRange.min ? (
          <span className="price-range-value">
            Từ {formatPrice(priceRange.min)}
          </span>
        ) : priceRange.max ? (
          <span className="price-range-value">
            Đến {formatPrice(priceRange.max)}
          </span>
        ) : null}
        <span className="product-count">({productCount} sản phẩm)</span>
      </div>
    </div>
  );
}

/**
 * Popular brands component
 */
function PopularBrands({ brands }) {
  if (!brands || brands.length === 0) return null;

  return (
    <section className="popular-brands-section">
      <h2 className="category-section-title">Thương hiệu phổ biến</h2>
      <div className="brands-grid">
        {brands.map((brand, index) => (
          <div key={index} className="brand-item">
            <span className="brand-name">{brand}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Main Category SEO Content component
 */
export default function CategorySeoContent({ 
  categoryData, 
  products = [], 
  filters = {},
  structuredData = null,
  breadcrumb = null 
}) {
  if (!categoryData) return null;

  const { 
    categoryName, 
    productCount = 0, 
    priceRange = {}, 
    seo = {},
    topBrands = [],
    relatedCategories = []
  } = categoryData;

  const breadcrumbItems = breadcrumb || generateCategoryBreadcrumb(categoryName, filters);

  return (
    <div className="category-seo-content">
      {/* Structured Data */}
      <JsonLd data={structuredData} />

      {/* Breadcrumb */}
      <CategoryBreadcrumb items={breadcrumbItems} />

      {/* Category Header */}
      <header className="category-header">
        <h1 className="category-main-title">{categoryName} ô tô</h1>
        <div className="category-header-meta">
          <span className="product-count">{productCount} sản phẩm</span>
          {priceRange.min && priceRange.max && (
            <span className="price-summary">
              Giá: {formatPrice(priceRange.min)} - {formatPrice(priceRange.max)}
            </span>
          )}
        </div>
      </header>

      {/* Trust Badges */}
      <TrustBadges />

      {/* Price Range Info */}
      <PriceRange priceRange={priceRange} productCount={productCount} />

      {/* SEO Content Sections */}
      {seo.sections && seo.sections.length > 0 && (
        <div className="seo-content-sections">
          {seo.sections.map((section, index) => (
            <ContentSection key={index} section={section} index={index} />
          ))}
        </div>
      )}

      {/* Popular Brands */}
      <PopularBrands brands={topBrands} />

      {/* FAQ Section */}
      <FAQSection faqItems={seo.faq || []} />

      {/* Related Categories */}
      <RelatedCategories categories={relatedCategories} currentCategory={categoryName} />

      {/* Call to Action */}
      <section className="category-cta-section">
        <div className="cta-content">
          <h2 className="cta-title">Cần tư vấn về {categoryName.toLowerCase()}?</h2>
          <p className="cta-description">
            Đội ngũ kỹ thuật viên của chúng tôi sẵn sàng tư vấn miễn phí để bạn chọn được sản phẩm phù hợp nhất.
          </p>
          <div className="cta-buttons">
            <a href="tel:19001234" className="cta-button cta-button-primary">
              <FiPhoneCall className="cta-icon" />
              Gọi ngay 1900 1234
            </a>
            <Link href="/shop" className="cta-button cta-button-secondary">
              Xem tất cả sản phẩm
            </Link>
          </div>
        </div>
      </section>

      {/* Schema.org structured data for additional SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: `${categoryName} ô tô`,
            description: seo.description || `${categoryName} ô tô chính hãng, giá tốt`,
            url: typeof window !== 'undefined' ? window.location.href : '',
            mainEntity: {
              "@type": "CollectionPage",
              name: `${categoryName} ô tô`,
              description: seo.description,
              numberOfItems: productCount
            }
          })
        }}
      />
    </div>
  );
}

/**
 * Category SEO Content with Products component
 */
export function CategorySeoContentWithProducts({ 
  categoryData, 
  products = [], 
  filters = {},
  structuredData = null 
}) {
  return (
    <div className="category-page-container">
      {/* SEO Content */}
      <CategorySeoContent 
        categoryData={categoryData}
        products={products}
        filters={filters}
        structuredData={structuredData}
      />
      
      {/* Products Grid */}
      {products.length > 0 && (
        <section className="category-products-section">
          <h2 className="products-section-title">Sản phẩm {categoryData?.categoryName || 'phụ tùng'} nổi bật</h2>
          <div className="products-grid">
            {products.map((product, index) => (
              <div key={product.id || index} className="product-card">
                <div className="product-image">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.partName || product.shortDescription || 'Sản phẩm'}
                      loading="lazy"
                    />
                  ) : (
                    <div className="product-image-placeholder">
                      <span>Không có hình ảnh</span>
                    </div>
                  )}
                </div>
                <div className="product-info">
                  <h3 className="product-name">
                    {product.partName || product.shortDescription || 'Sản phẩm'}
                  </h3>
                  {product.brand && (
                    <span className="product-brand">{product.brand}</span>
                  )}
                  {product.price && (
                    <div className="product-price">
                      {formatPrice(product.price)}
                    </div>
                  )}
                  <Link 
                    href={product.slug ? `/product/${encodeURIComponent(product.slug)}` : `/product/${product.id}`}
                    className="product-link"
                  >
                    Xem chi tiết
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
