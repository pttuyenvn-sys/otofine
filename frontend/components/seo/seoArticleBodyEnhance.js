/**
 * Builds enhanced SEO article HTML: compact top products + inline figures.
 * Plain functions — usable from client SEO article components only.
 */

const SEO_FALLBACK_IMAGE_PATH = "/images/default-brake-pad.svg";

/**
 * @param {string | null | undefined} s
 */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripControl(s) {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
}

/**
 * @param {{ slug?: string; id?: unknown }} item
 */
function productTitle(item) {
  const raw =
    item?.name ??
    item?.shortDescription ??
    item?.short_description ??
    item?.partName ??
    item?.part_name ??
    "Sản phẩm";
  return String(raw)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function safeImage(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "[object Object]") return null;
  if (trimmed.toLowerCase().includes(SEO_FALLBACK_IMAGE_PATH)) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return trimmed;
  if (!trimmed.startsWith("http")) return null;
  return trimmed;
}

function imageValue(raw) {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return raw.url || raw.src || raw.image || raw.image_url || raw.thumbnail || raw.thumbnailUrl || null;
  }
  return null;
}

function productImage(p, productThumbnails, resolveImg) {
  const id = p?.id != null ? String(p.id) : "";
  const rawImages = Array.isArray(p?.images) ? p.images : [];
  const mappedThumbnail = productThumbnails?.[id];
  const rawImage =
    p?.image ||
    p?.image_url ||
    p?.thumbnail ||
    p?.thumbnailUrl ||
    p?.thumbnail_url ||
    p?.thumb ||
    p?.thumbRaw ||
    imageValue(rawImages[0]) ||
    mappedThumbnail;
  const safePrimary = safeImage(resolveImg(imageValue(p?.image)));
  const finalImage = [
    p?.image,
    p?.image_url,
    p?.thumbnail,
    p?.thumbnailUrl,
    p?.thumbnail_url,
    p?.thumb,
    p?.thumbRaw,
    rawImages[0],
    rawImage,
    mappedThumbnail,
  ]
    .map(imageValue)
    .map((value) => safeImage(resolveImg(value)))
    .find(Boolean) || null;

  console.log("PRODUCT IMAGE RAW:", p);
  console.log("TRY IMAGE FIELD:", p?.image, p?.image_url, p?.images);
  console.log("SEO IMAGE DEBUG:", {
    id: p?.id,
    image: p?.image,
    image_url: p?.image_url,
    thumbnail: p?.thumbnail,
    thumb: p?.thumb,
    images: p?.images,
    mappedThumbnail,
  });
  console.log("AFTER SAFE:", safePrimary);
  console.log("SEO FINAL IMAGE:", finalImage);
  if (!finalImage) {
    console.log("IMAGE SKIPPED:", p);
  }

  return finalImage;
}

/**
 * @param {unknown[]} products
 * @param {Record<string, string>} productThumbnails
 * @param {(u: unknown) => string} resolveImg
 * @returns {{ src: string, alt: string }[]} first, middle, last from the rendered product list.
 */
function collectInlineImages(products, productThumbnails, resolveImg) {
  const images = [];
  const seen = new Set();
  const list = Array.isArray(products) ? products : [];

  const pushImage = (src, alt) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    images.push({ src, alt: alt || "Phụ tùng ô tô" });
  };

  const middleIndex = list.length ? Math.floor(list.length / 2) : -1;
  const lastIndex = list.length ? list.length - 1 : -1;
  const sourceIndexes = [0, middleIndex, lastIndex];

  console.log("SEO IMAGE SOURCE LIST:", list.map((p) => ({
    id: p?.id,
    name: p?.name || p?.partName || p?.part_name || p?.shortDescription || p?.short_description,
  })));
  console.log("SEO IMAGE INDEXES:", {
    first: 0,
    middle: middleIndex,
    last: lastIndex,
  });

  for (const index of sourceIndexes) {
    if (index < 0) continue;
    const product = list[index];
    const image = productImage(product, productThumbnails, resolveImg);
    console.log("SEO IMAGE CHECK:", {
      image,
      isValid: !!image,
    });
    pushImage(image, productTitle(product));
  }

  console.log("FINAL IMAGES:", images);
  console.log("SEO FINAL IMAGES:", images.map((img) => img?.src));

  return images.slice(0, 3);
}

/**
 * @returns {number[]} start index of each <h2 ...> match
 */
function findH2OpenIndices(html) {
  /** @type {number[]} */
  const out = [];
  const re = /<h2\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m.index);
  return out;
}

/**
 * @param {{ src: string, alt?: string }} image
 */
function figureHtml(image) {
  const esc = escapeHtml(image.src);
  const alt = escapeHtml(image.alt || "Phụ tùng ô tô");
  return `<figure class="seo-article-inline-fig"><div class="seo-article-inline-fig__inner"><img class="seo-article-inline-img" src="${esc}" alt="${alt}" loading="lazy" decoding="async" /></div></figure>\n`;
}

/**
 * @param {unknown[]} products
 * @param {(item: unknown) => string} getProductDetailHref
 * @param {(v: unknown) => string} formatMoney
 * @param {string} partLabel
 * @param {string} vehicleLabel
 */
function buildTopProductsBlockHtml(
  products,
  productThumbnails,
  resolveImg,
  getProductDetailHref,
  formatMoney,
  partLabel,
  vehicleLabel,
) {
  const topProducts = (Array.isArray(products) ? products : []).slice(0, 6);
  console.log("SEO TOP PRODUCTS:", topProducts.map((p) => p?.id));
  if (topProducts.length === 0) return null;

  /** @type {string[]} */
  const items = [];
  for (const p of topProducts) {
    const title = escapeHtml(productTitle(p));
    const price = escapeHtml(formatMoney(p?.price));
    const partNumber = String(p?.partNumber ?? p?.part_number ?? "").trim();
    const rawHref = getProductDetailHref(p);
    const safeHref = escapeHtml(String(rawHref || "/"));
    const image = productImage(p, productThumbnails, resolveImg);
    const imageHtml = image
      ? `<span class="seo-top-products__thumb"><img src="${escapeHtml(image)}" alt="${title}" loading="lazy" decoding="async" /></span>`
      : "";
    const compat = vehicleLabel
      ? `<span class="seo-top-products__compat">Compatible with ${escapeHtml(vehicleLabel)}</span>`
      : "";
    items.push(
      `<li>${imageHtml}<span class="seo-top-products__body"><a href="${safeHref}" class="seo-top-products__a">${title}</a>${compat}${partNumber ? `<span class="seo-top-products__sku">Mã: ${escapeHtml(partNumber)}</span>` : ""}<span class="seo-top-products__price">Giá: ${price}</span><a href="${safeHref}" class="seo-top-products__cta">View product</a></span></li>`,
    );
  }

  const label = escapeHtml(partLabel.trim() || "Phụ tùng");
  return `\n<section class="seo-commerce-block" aria-label="Sản phẩm liên quan">\n<h2 class="seo-top-products-h2">
  Top phụ tùng ${label} bán chạy
</h2>\n<ul class="seo-top-products" aria-label="Top ${label}">${items.join("")}</ul>\n</section>\n`;
}

function firstText(...values) {
  for (const value of values) {
    const raw = value && typeof value === "object"
      ? value.name ?? value.shopName ?? value.shop_name ?? ""
      : value;
    const text = stripControl(String(raw ?? "")).trim();
    if (text === "[object Object]") continue;
    if (text) return text;
  }
  return "";
}

function shopIdOfProduct(p) {
  return firstText(p?.shop_id, p?.shopId, p?.shopID, p?.seller_id, p?.sellerId);
}

function shopNameOfProduct(p) {
  return firstText(p?.shopName, p?.shop_name, p?.shop, p?.sellerName, p?.seller_name, p?.storeName, p?.store_name);
}

function shopLocationOfProduct(p) {
  return firstText(
    p?.provinceName,
    p?.province_name,
    p?.city,
    p?.location,
    p?.address,
    p?.shopLocation,
    p?.shop_location,
  );
}

function shopPhoneOfProduct(p) {
  return firstText(p?.phone, p?.shopPhone, p?.shop_phone, p?.sellerPhone, p?.seller_phone);
}

function buildTopShopsBlockHtml(products, label) {
  const map = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const name = shopNameOfProduct(product);
    if (!name) continue;
    const id = shopIdOfProduct(product);
    const key = id || name.toLowerCase();
    const current = map.get(key) || {
      id,
      name,
      location: shopLocationOfProduct(product),
      phone: shopPhoneOfProduct(product),
      count: 0,
    };
    current.count += 1;
    if (!current.location) current.location = shopLocationOfProduct(product);
    if (!current.phone) current.phone = shopPhoneOfProduct(product);
    map.set(key, current);
  }

  const groupedShops = [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"))
    .slice(0, 5);
  console.log("SEO SHOP GROUP:", groupedShops);
  if (groupedShops.length === 0) return null;

  const safeLabel = escapeHtml(label.trim() || "phụ tùng");
  const items = groupedShops.map((shop) => {
    const name = escapeHtml(shop.name);
    const location = escapeHtml(shop.location);
    const phone = escapeHtml(shop.phone);
    const phoneHref = String(shop.phone || "").replace(/\D/g, "");
    const meta = [
      location,
      `${Number(shop.count).toLocaleString("vi-VN")} sản phẩm liên quan`,
    ].filter(Boolean).join(" · ");
    return `<li><span class="seo-top-shops__body"><span class="seo-top-shops__name">${name}</span><span class="seo-top-shops__meta">${meta}</span>${phone ? `<a class="seo-top-shops__phone" href="tel:${phoneHref}">${phone}</a>` : ""}</span></li>`;
  });

  return `\n<section class="seo-commerce-block seo-commerce-block--shops" aria-label="Cửa hàng liên quan">\n<h2 class="seo-top-products-h2">
  Cửa hàng có nhiều phụ tùng ${safeLabel}
</h2>\n<ul class="seo-top-shops" aria-label="Cửa hàng có nhiều ${safeLabel}">${items.join("")}</ul>\n</section>\n`;
}

/**
 * @param {string | null | undefined} rawHtml
 * @param {{
 *   products?: unknown[],
 *   imageProducts?: unknown[],
 *   productThumbnails?: Record<string, string>,
 *   resolveImg: (u: unknown) => string,
 *   partDisplayName: string,
 *   shopDisplayName?: string,
 *   vehicleLabel?: string,
 *   getProductDetailHref: (item: unknown) => string,
 *   formatMoney: (v: unknown) => string,
 * }} opts
 */
function doEnhanceSeoArticleHtml(html, opts) {
  const products = Array.isArray(opts.products) ? opts.products : [];
  const renderedProducts = Array.isArray(opts.imageProducts) ? opts.imageProducts : [];
  const thumbs = opts.productThumbnails ?? {};
  const partLabel = String(opts.partDisplayName ?? "Phụ tùng").trim() || "Phụ tùng";
  const shopLabel = String(opts.shopDisplayName ?? partLabel).trim() || partLabel;

  console.log("SEO PRODUCT SAMPLE:", products[0]);
  console.log("IMAGE LIST:", products.map((p) => p?.image));

  const topBlock = buildTopProductsBlockHtml(
    renderedProducts,
    thumbs,
    opts.resolveImg,
    opts.getProductDetailHref,
    opts.formatMoney,
    partLabel,
    String(opts.vehicleLabel ?? ""),
  );
  const shopBlock = buildTopShopsBlockHtml(renderedProducts, shopLabel);

  const inlineImages = collectInlineImages(renderedProducts, thumbs, opts.resolveImg);
  console.log("INLINE IMAGE LIST:", inlineImages.map((img) => img?.src));

  const h2Idx = findH2OpenIndices(html);

  /** @type {{ offset: number; fragment: string, order: number }[]} */
  const inserts = [];
  const sectionOffset = (slot) => h2Idx[slot] ?? html.length;

  if (inlineImages[0]) {
    inserts.push({ offset: sectionOffset(1), fragment: figureHtml(inlineImages[0]), order: 1 });
  }

  if (topBlock) {
    inserts.push({ offset: sectionOffset(2), fragment: topBlock, order: 2 });
  }

  if (shopBlock) {
    inserts.push({ offset: sectionOffset(3), fragment: shopBlock, order: 3 });
  }

  for (let i = 1; i < inlineImages.length; i++) {
    inserts.push({
      offset: sectionOffset(3 + i),
      fragment: figureHtml(inlineImages[i]),
      order: 3 + i,
    });
  }

  inserts.sort((a, b) => b.offset - a.offset || b.order - a.order);
  let out = html;
  for (const { offset, fragment } of inserts) {
    out = out.slice(0, offset) + fragment + out.slice(offset);
  }
  return out;
}

export function enhanceSeoArticleHtml(rawHtml, opts) {
  const html = String(rawHtml ?? "");
  if (!html.trim()) return html;
  try {
    return doEnhanceSeoArticleHtml(html, opts);
  } catch (err) {
    console.error("Enhance error:", err);
    return html;
  }
}
