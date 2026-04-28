import { API_BASE } from "@/lib/config";
import { categoryLandingSlugFromName } from "./slugify";

/**
 * Fetch category SEO content from backend API
 * @param {string} categoryName - Category name
 * @param {Object} filters - Filter options
 * @param {number} page - Page number
 * @returns {Promise<Object>} Category SEO content
 */
export async function fetchCategorySeoContent(categoryName, filters = {}, page = 1) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, Number(page) || 1)));
  
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.model) params.set("model", filters.model);
  if (filters.year) params.set("year", filters.year);

  const url = `${API_BASE}/category-seo/${encodeURIComponent(categoryName)}?${params.toString()}`;
  
  try {
    const res = await fetch(url, { 
      next: { revalidate: 3600 }, // Cache for 1 hour
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch category SEO content: ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error("Error fetching category SEO content:", error);
    return null;
  }
}

/**
 * Fetch all categories with product counts
 * @returns {Promise<Array>} Categories with metadata
 */
export async function fetchCategoriesWithCounts() {
  const url = `${API_BASE}/category-seo/categories`;
  
  try {
    const res = await fetch(url, { 
      next: { revalidate: 7200 }, // Cache for 2 hours
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch categories: ${res.status}`);
      return [];
    }
    
    const data = await res.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

/**
 * Fetch related categories for a given category
 * @param {string} categoryName - Category name
 * @returns {Promise<Array>} Related categories
 */
export async function fetchRelatedCategories(categoryName) {
  const url = `${API_BASE}/category-seo/${encodeURIComponent(categoryName)}/related`;
  
  try {
    const res = await fetch(url, { 
      next: { revalidate: 3600 },
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch related categories: ${res.status}`);
      return [];
    }
    
    const data = await res.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error("Error fetching related categories:", error);
    return [];
  }
}

/**
 * Fetch category FAQ data
 * @param {string} categoryName - Category name
 * @returns {Promise<Object>} FAQ data
 */
export async function fetchCategoryFAQ(categoryName) {
  const url = `${API_BASE}/category-seo/${encodeURIComponent(categoryName)}/faq`;
  
  try {
    const res = await fetch(url, { 
      next: { revalidate: 7200 },
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch category FAQ: ${res.status}`);
      return { generated: [], customer: [], profile: 'default' };
    }
    
    const data = await res.json();
    return data.success ? data.data : { generated: [], customer: [], profile: 'default' };
  } catch (error) {
    console.error("Error fetching category FAQ:", error);
    return { generated: [], customer: [], profile: 'default' };
  }
}

/**
 * Fetch category metadata for SEO
 * @param {string} categoryName - Category name
 * @returns {Promise<Object>} Category metadata
 */
export async function fetchCategoryMetadata(categoryName) {
  const url = `${API_BASE}/category-seo/${encodeURIComponent(categoryName)}/metadata`;
  
  try {
    const res = await fetch(url, { 
      next: { revalidate: 3600 },
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch category metadata: ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error("Error fetching category metadata:", error);
    return null;
  }
}

/**
 * Check if a slug represents a category page
 * @param {string} slug - URL slug
 * @returns {boolean} True if it's a category slug
 */
export function isCategorySlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  
  const s = slug.trim().toLowerCase();
  // Category slugs end with "-o-to" but don't start with "phu-tung-o-to"
  return s.endsWith("-o-to") && !s.startsWith("phu-tung-o-to");
}

/**
 * Extract category name from slug
 * @param {string} slug - URL slug
 * @returns {string} Category name
 */
export function extractCategoryFromSlug(slug) {
  if (!isCategorySlug(slug)) return "";
  
  const s = slug.trim().toLowerCase();
  // Remove "-o-to" suffix and convert back to readable format
  const baseName = s.slice(0, -6); // Remove "-o-to"
  
  // Convert slug back to readable category name
  return baseName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate category slug from category name
 * @param {string} categoryName - Category name
 * @returns {string} Category slug
 */
export function generateCategorySlug(categoryName) {
  if (!categoryName || typeof categoryName !== "string") return "";
  
  return categoryLandingSlugFromName(categoryName);
}

/**
 * Build category page URL
 * @param {string} categoryName - Category name
 * @param {Object} filters - Filter options
 * @param {number} page - Page number
 * @returns {string} Category page URL
 */
export function buildCategoryUrl(categoryName, filters = {}, page = 1) {
  const slug = generateCategorySlug(categoryName);
  if (!slug) return "";
  
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.model) params.set("model", filters.model);
  if (filters.year) params.set("year", filters.year);
  
  const queryString = params.toString();
  return `/${slug}${queryString ? `?${queryString}` : ""}`;
}

/**
 * Generate structured data for category page
 * @param {Object} categoryData - Category SEO data
 * @param {string} url - Page URL
 * @returns {Object} Structured data
 */
export function generateCategoryStructuredData(categoryData, url) {
  const { categoryName, productCount, priceRange, seo } = categoryData;
  
  const mainEntity = {
    "@type": "CollectionPage",
    name: categoryName,
    description: seo?.description || `${categoryName} ô tô chính hãng, giá tốt`,
    url: url,
    numberOfItems: productCount || 0
  };

  // Add offers if price range is available
  if (priceRange?.min && priceRange?.max) {
    mainEntity.offers = {
      "@type": "AggregateOffer",
      lowPrice: priceRange.min,
      highPrice: priceRange.max,
      priceCurrency: "VND",
      offerCount: productCount || 0
    };
  }

  // Add breadcrumb if available
  const breadcrumb = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Trang chủ",
      item: "/"
    },
    {
      "@type": "ListItem", 
      position: 2,
      name: "Phụ tùng ô tô",
      item: "/phu-tung-o-to"
    },
    {
      "@type": "ListItem",
      position: 3,
      name: categoryName,
      item: url
    }
  ];

  // Add FAQ structured data if available
  const faqData = seo?.faq || [];
  
  return {
    mainEntity,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: breadcrumb
    },
    faq: faqData.length > 0 ? {
      "@type": "FAQPage",
      mainEntity: faqData
    } : null
  };
}

/**
 * Generate category page metadata
 * @param {Object} categoryData - Category SEO data
 * @param {string} url - Page URL
 * @returns {Object} Page metadata
 */
export function generateCategoryMetadata(categoryData, url) {
  const { categoryName, productCount, priceRange, seo } = categoryData;
  
  const title = seo?.title || `${categoryName} ô tô chính hãng, giá tốt | Otofine`;
  const description = seo?.description || `${categoryName} ô tô chính hãng, ${productCount} sản phẩm. Bảo hành uy tín, giao hàng nhanh.`;
  
  return {
    title,
    description,
    alternates: {
      canonical: url
    },
    robots: {
      index: true,
      follow: true
    },
    openGraph: {
      title,
      description,
      url: url,
      siteName: "Otofine",
      locale: "vi_VN",
      type: "website",
      images: [
        {
          url: "/logo.png",
          width: 512,
          height: 512,
          alt: `${categoryName} ô tô - Otofine`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/logo.png"]
    }
  };
}

/**
 * Cache category SEO content in memory for performance
 */
const categorySeoCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get cached category SEO content or fetch fresh data
 * @param {string} categoryName - Category name
 * @param {Object} filters - Filter options
 * @param {number} page - Page number
 * @returns {Promise<Object>} Category SEO content
 */
export async function getCachedCategorySeoContent(categoryName, filters = {}, page = 1) {
  const cacheKey = `${categoryName}-${JSON.stringify(filters)}-${page}`;
  const cached = categorySeoCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const data = await fetchCategorySeoContent(categoryName, filters, page);
  
  if (data) {
    categorySeoCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }
  
  return data;
}

/**
 * Clear category SEO cache
 * @param {string} categoryName - Optional category name to clear specific cache
 */
export function clearCategorySeoCache(categoryName = null) {
  if (categoryName) {
    // Clear cache for specific category
    for (const [key, value] of categorySeoCache.entries()) {
      if (key.startsWith(categoryName)) {
        categorySeoCache.delete(key);
      }
    }
  } else {
    // Clear all cache
    categorySeoCache.clear();
  }
}

/**
 * Format price for display
 * @param {number} price - Price in VND
 * @returns {string} Formatted price
 */
export function formatPrice(price) {
  if (!Number.isFinite(price)) return "Liên hệ";
  return `${new Intl.NumberFormat("vi-VN").format(price)}đ`;
}

/**
 * Generate category breadcrumb data
 * @param {string} categoryName - Category name
 * @param {Object} filters - Additional filters
 * @returns {Array} Breadcrumb items
 */
export function generateCategoryBreadcrumb(categoryName, filters = {}) {
  const breadcrumb = [
    { name: "Trang chủ", href: "/" },
    { name: "Phụ tùng ô tô", href: "/phu-tung-o-to" },
    { name: categoryName, href: `/${generateCategorySlug(categoryName)}` }
  ];
  
  // Add brand filter to breadcrumb if present
  if (filters.brand) {
    breadcrumb.push({
      name: filters.brand,
      href: `/${generateCategorySlug(categoryName)}?brand=${encodeURIComponent(filters.brand)}`
    });
  }
  
  // Add model filter to breadcrumb if present
  if (filters.model) {
    breadcrumb.push({
      name: filters.model,
      href: `/${generateCategorySlug(categoryName)}?brand=${encodeURIComponent(filters.brand || '')}&model=${encodeURIComponent(filters.model)}`
    });
  }
  
  return breadcrumb;
}
