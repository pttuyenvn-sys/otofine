/**
 * SEO article enhancement planner — React segments (no raw product <img> HTML).
 */

import { isLegacyLocalThumbUrl } from "@/lib/media/productMediaUrl";

const SEO_FALLBACK_IMAGE_PATH = "/images/default-brake-pad.svg";

function stripControl(s) {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
}

/**
 * @param {{ slug?: string; id?: unknown }} item
 */
export function productTitle(item) {
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
  if (isLegacyLocalThumbUrl(trimmed)) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return trimmed;
  if (!trimmed.startsWith("http")) return null;
  return trimmed.split("?")[0];
}

function imageValue(raw) {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return (
      raw.url ||
      raw.src ||
      raw.image ||
      raw.image_url ||
      raw.thumbnail ||
      raw.thumbnailUrl ||
      null
    );
  }
  return null;
}

/**
 * Original catalog URL for AppImage thumb derivation (never a pre-built sidecar).
 * @param {unknown} p
 * @param {Record<string, string>} productThumbnails
 * @param {(u: unknown) => string} resolveImg
 */
export function pickProductOriginalImage(p, productThumbnails, resolveImg) {
  const id = p?.id != null ? String(p.id) : "";
  const rawImages = Array.isArray(p?.images) ? p.images : [];
  const mapped = productThumbnails?.[id];

  const candidates = [
    p?.image,
    p?.image_url,
    imageValue(rawImages[0]),
    mapped,
  ]
    .map((value) => safeImage(resolveImg(imageValue(value))))
    .filter(Boolean);

  return candidates[0] || null;
}

/**
 * @returns {{ product: unknown, imageSrc: string, caption: string }[]}
 */
export function collectInlineFigureProducts(products, productThumbnails, resolveImg) {
  const list = Array.isArray(products) ? products : [];
  const middleIndex = list.length ? Math.floor(list.length / 2) : -1;
  const lastIndex = list.length ? list.length - 1 : -1;
  const sourceIndexes = [0, middleIndex, lastIndex];

  /** @type {{ product: unknown, imageSrc: string, caption: string }[]} */
  const out = [];
  const seen = new Set();

  for (const index of sourceIndexes) {
    if (index < 0) continue;
    const product = list[index];
    const imageSrc = pickProductOriginalImage(product, productThumbnails, resolveImg);
    if (!imageSrc || seen.has(imageSrc)) continue;
    seen.add(imageSrc);
    out.push({
      product,
      imageSrc,
      caption: productTitle(product),
    });
  }

  return out.slice(0, 3);
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

function firstText(...values) {
  for (const value of values) {
    const raw =
      value && typeof value === "object"
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
  return firstText(
    p?.shopName,
    p?.shop_name,
    p?.shop,
    p?.sellerName,
    p?.seller_name,
    p?.storeName,
    p?.store_name,
  );
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

/**
 * @returns {{ id: string, name: string, location: string, phone: string, count: number }[]}
 */
export function buildTopShopsData(products) {
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

  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"))
    .slice(0, 5);
}

/**
 * @param {unknown[]} products
 * @param {Record<string, string>} productThumbnails
 * @param {(u: unknown) => string} resolveImg
 */
export function buildTopProductsData(products, productThumbnails, resolveImg) {
  return (Array.isArray(products) ? products : [])
    .slice(0, 6)
    .map((product) => ({
      product,
      imageSrc: pickProductOriginalImage(product, productThumbnails, resolveImg),
      title: productTitle(product),
      partNumber: String(product?.partNumber ?? product?.part_number ?? "").trim(),
      price: product?.price,
    }))
    .filter((row) => row.title);
}

/**
 * Plan React segments interleaved into article HTML (strict thumbs via AppImage in rails).
 *
 * @param {string | null | undefined} rawHtml
 * @param {{
 *   products?: unknown[],
 *   imageProducts?: unknown[],
 *   productThumbnails?: Record<string, string>,
 *   resolveImg: (u: unknown) => string,
 *   partDisplayName: string,
 *   shopDisplayName?: string,
 *   vehicleLabel?: string,
 * }} opts
 */
export function planSeoArticleEnhancements(rawHtml, opts) {
  const html = String(rawHtml ?? "");
  if (!html.trim()) {
    return { segments: [] };
  }

  const renderedProducts = Array.isArray(opts.imageProducts) ? opts.imageProducts : [];
  const thumbs = opts.productThumbnails ?? {};
  const partLabel = String(opts.partDisplayName ?? "Phụ tùng").trim() || "Phụ tùng";
  const shopLabel = String(opts.shopDisplayName ?? partLabel).trim() || partLabel;
  const vehicleLabel = String(opts.vehicleLabel ?? "");

  const inlineFigures = collectInlineFigureProducts(
    renderedProducts,
    thumbs,
    opts.resolveImg,
  );
  const topProducts = buildTopProductsData(renderedProducts, thumbs, opts.resolveImg);
  const topShops = buildTopShopsData(renderedProducts);

  const h2Idx = findH2OpenIndices(html);
  const sectionOffset = (slot) => h2Idx[slot] ?? html.length;

  /** @type {{ offset: number, order: number, kind: string, [key: string]: unknown }[]} */
  const inserts = [];

  if (inlineFigures[0]) {
    inserts.push({
      offset: sectionOffset(1),
      order: 1,
      kind: "inlineFigure",
      figure: inlineFigures[0],
    });
  }

  if (topProducts.length) {
    inserts.push({
      offset: sectionOffset(2),
      order: 2,
      kind: "topProducts",
      products: topProducts,
      partLabel,
      vehicleLabel,
    });
  }

  if (topShops.length) {
    inserts.push({
      offset: sectionOffset(3),
      order: 3,
      kind: "topShops",
      shops: topShops,
      label: shopLabel,
    });
  }

  for (let i = 1; i < inlineFigures.length; i += 1) {
    inserts.push({
      offset: sectionOffset(3 + i),
      order: 3 + i,
      kind: "inlineFigure",
      figure: inlineFigures[i],
    });
  }

  if (!inserts.length) {
    return { segments: [{ kind: "html", html }] };
  }

  const byOffset = new Map();
  for (const ins of inserts) {
    if (!byOffset.has(ins.offset)) byOffset.set(ins.offset, []);
    byOffset.get(ins.offset).push(ins);
  }

  const sortedOffsets = [...byOffset.keys()].sort((a, b) => a - b);
  /** @type {object[]} */
  const segments = [];
  let cursor = 0;

  for (const offset of sortedOffsets) {
    if (offset > cursor) {
      segments.push({ kind: "html", html: html.slice(cursor, offset) });
    }
    const group = byOffset.get(offset).sort((a, b) => a.order - b.order);
    for (const ins of group) {
      if (ins.kind === "inlineFigure") {
        segments.push({ kind: "inlineFigure", ...ins.figure });
      } else if (ins.kind === "topProducts") {
        segments.push({
          kind: "topProducts",
          products: ins.products,
          partLabel: ins.partLabel,
          vehicleLabel: ins.vehicleLabel,
        });
      } else if (ins.kind === "topShops") {
        segments.push({
          kind: "topShops",
          shops: ins.shops,
          label: ins.label,
        });
      }
    }
    cursor = offset;
  }

  if (cursor < html.length) {
    segments.push({ kind: "html", html: html.slice(cursor) });
  }

  return { segments };
}

/**
 * @deprecated HTML injection removed — use planSeoArticleEnhancements + React rails.
 */
export function enhanceSeoArticleHtml(rawHtml) {
  return String(rawHtml ?? "");
}
