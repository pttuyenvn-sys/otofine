/** @typedef {'products' | 'marketplace-core' | 'marketplace-location' | 'shops'} SitemapGroupKey */

export const MAX_URLS_PER_FILE = 45000;

export const SITEMAP_CACHE_MARKETPLACE = 86400;
export const SITEMAP_CACHE_SHOPS = 300;

/** @type {Record<SitemapGroupKey, { filename: string, partPrefix: string }>} */
export const SITEMAP_GROUPS = {
  products: {
    filename: "sitemap-products.xml",
    partPrefix: "sitemap-products",
  },
  "marketplace-core": {
    filename: "sitemap-marketplace-core.xml",
    partPrefix: "sitemap-marketplace-core",
  },
  "marketplace-location": {
    filename: "sitemap-marketplace-location.xml",
    partPrefix: "sitemap-marketplace-location",
  },
  shops: {
    filename: "sitemap-shops.xml",
    partPrefix: "sitemap-shops",
  },
};

export const ROOT_SITEMAP_CHILDREN = [
  "sitemap-products.xml",
  "sitemap-marketplace-core.xml",
  "sitemap-marketplace-location.xml",
  "sitemap-shops.xml",
];
