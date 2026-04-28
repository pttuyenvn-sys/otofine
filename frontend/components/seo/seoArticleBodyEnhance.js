/**
 * Builds enhanced SEO article HTML: compact top products + inline figures.
 * Plain functions — usable from client SEO article components only.
 */

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

/**
 * @param {{ slug?: string; id?: unknown }} item
 */
function productTitle(item) {
  const raw =
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

/**
 * @param {unknown[]} products
 * @param {Record<string, string>} productThumbnails
 * @param {(u: unknown) => string} resolveImg
 * @returns {string[]} 0–4 URLs (prefer 2–4 when thumbnails exist).
 */
function collectInlineImageUrls(products, productThumbnails, resolveImg) {
  const urls = [];
  const list = Array.isArray(products) ? products : [];
  const cap = 4;
  for (const p of list) {
    const id = p?.id != null ? String(p.id) : "";
    const t = productThumbnails?.[id];
    if (!t) continue;
    const u = resolveImg(t);
    if (u) urls.push(u);
    if (urls.length >= cap) break;
  }
  return urls.slice(0, cap);
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
 * @param {string} src
 */
function figureHtml(src) {
  const esc = escapeHtml(src);
  return `<figure class="seo-article-inline-fig"><div class="seo-article-inline-fig__inner"><img class="seo-article-inline-img" src="${esc}" alt="" loading="lazy" decoding="async" /></div></figure>\n`;
}

/**
 * @param {unknown[]} products
 * @param {(item: unknown) => string} getProductDetailHref
 * @param {(v: unknown) => string} formatMoney
 * @param {string} partLabel
 */
function buildTopProductsBlockHtml(products, getProductDetailHref, formatMoney, partLabel) {
  const top = (Array.isArray(products) ? products : []).slice(0, 4);
  if (top.length === 0) return "";

  /** @type {string[]} */
  const items = [];
  for (const p of top) {
    const title = escapeHtml(productTitle(p));
    const price = escapeHtml(formatMoney(p?.price));
    const rawHref = getProductDetailHref(p);
    const safeHref = escapeHtml(String(rawHref || "/"));
    items.push(
      `<li><a href="${safeHref}" class="seo-top-products__a">${title}</a> — ${price}</li>`,
    );
  }

  const label = escapeHtml(partLabel.trim() || "Phụ tùng");
  return `\n<h2 class="seo-top-products-h2">Top ${label} bán chạy</h2>\n<ul class="seo-top-products" aria-label="Top ${label}">${items.join("")}</ul>\n`;
}

/**
 * @param {string | null | undefined} rawHtml
 * @param {{
 *   products?: unknown[],
 *   productThumbnails?: Record<string, string>,
 *   resolveImg: (u: unknown) => string,
 *   partDisplayName: string,
 *   getProductDetailHref: (item: unknown) => string,
 *   formatMoney: (v: unknown) => string,
 * }} opts
 */
export function enhanceSeoArticleHtml(rawHtml, opts) {
  const html = String(rawHtml ?? "");
  if (!html.trim()) return html;

  const products = Array.isArray(opts.products) ? opts.products : [];
  const thumbs = opts.productThumbnails ?? {};
  const partLabel = String(opts.partDisplayName ?? "Phụ tùng").trim() || "Phụ tùng";

  const topBlock = buildTopProductsBlockHtml(
    products,
    opts.getProductDetailHref,
    opts.formatMoney,
    partLabel,
  );

  const imageUrls = collectInlineImageUrls(products, thumbs, opts.resolveImg);

  const h2Idx = findH2OpenIndices(html);

  /** @type {{ offset: number; fragment: string }[]} */
  const inserts = [];

  if (topBlock) {
    if (h2Idx.length >= 2) inserts.push({ offset: h2Idx[1], fragment: topBlock });
    else inserts.push({ offset: html.length, fragment: `\n${topBlock}` });
  }

  for (let i = 0; i < imageUrls.length; i++) {
    const nth = 2 + i;
    if (h2Idx.length <= nth) break;
    inserts.push({ offset: h2Idx[nth], fragment: figureHtml(imageUrls[i]) });
  }

  inserts.sort((a, b) => b.offset - a.offset);
  let out = html;
  for (const { offset, fragment } of inserts) {
    out = out.slice(0, offset) + fragment + out.slice(offset);
  }
  return out;
}
