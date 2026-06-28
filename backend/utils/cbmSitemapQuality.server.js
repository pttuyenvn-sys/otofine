import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "./productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";

const WEAK_CATEGORY_PATTERNS = [
  /\btem\b/,
  /\bnhan\b/,
  /\blabel\b/,
  /\boc\b/,
  /\bvit\b/,
  /\bbulong\b/,
  /\bchu\b/,
  /\bclip\b/,
  /\bchot\b/,
  /\bvo\b/,
  /\bnap\b/,
  /\bmu\b/,
  /\bdo\b/,
  /\bgan\b/,
  /\bphu kien\b/,
  /\bchi tiet\b/,
  /\bkhac\b/,
  /\buniversal\b/,
  /\bvo oc\b/,
  /\boc vit\b/,
  /\btam\b/,
  /\bvo\b.*\bnap\b/,
];

const STRONG_CATEGORY_PATTERNS = [
  /phanh/,
  /loc gio/,
  /loc xang/,
  /loc dau/,
  /giam xoc/,
  /bugi/,
  /den pha/,
  /can truoc/,
  /can sau/,
  /ket nuoc/,
  /bom nuoc/,
  /bom xang/,
  /thuoc lai/,
  /ma phanh/,
  /dau cong tac/,
  /hop so/,
  /may phat/,
  /danh lua/,
  /cang a/,
  /guong chieu hau/,
  /lop dieu hoa/,
  /loc dieu hoa/,
  /cao su/,
];

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function foldVi(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function buildCbmSlug(canonicalSlug, brand, model) {
  const cs = String(canonicalSlug || "")
    .trim()
    .toLowerCase();
  if (!cs) return "";
  const prefix = cs.endsWith("-o-to") ? cs.slice(0, -"-o-to".length) : cs;
  const brandSlug = slugify(brand);
  const modelSlug = slugify(model);
  if (!prefix || !brandSlug || !modelSlug) return "";
  return `${prefix}-${brandSlug}-${modelSlug}`;
}

function jaccard(a, b) {
  const inter = [...a].filter((id) => b.has(id)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

function scoreCbm(x, { catPop, brandPop, modelPop, byCatBrand }) {
  const catNorm = foldVi(x.category);
  let score = 0;

  if (x.count >= 8) score += 35;
  else if (x.count >= 5) score += 28;
  else if (x.count >= 4) score += 22;
  else if (x.count >= 3) score += 16;
  else score += 10;

  if (STRONG_CATEGORY_PATTERNS.some((p) => p.test(catNorm))) score += 25;
  if (WEAK_CATEGORY_PATTERNS.some((p) => p.test(catNorm))) score -= 25;

  const cp = catPop.get(x.category) || 0;
  if (cp >= 35) score += 15;
  else if (cp >= 20) score += 10;
  else if (cp >= 10) score += 5;

  const mp = modelPop.get(`${x.brand}|${x.model}`) || 0;
  if (mp >= 150) score += 15;
  else if (mp >= 80) score += 10;
  else if (mp >= 40) score += 5;

  const bp = brandPop.get(x.brand) || 0;
  if (bp >= 800) score += 8;
  else if (bp >= 300) score += 4;

  const group = byCatBrand.get(`${x.category}\0${x.brand}`) || [];
  let maxJac = 0;
  for (const sib of group) {
    if (sib === x) continue;
    const jac = jaccard(x.productIds, sib.productIds);
    if (jac > maxJac) maxJac = jac;
  }
  if (maxJac >= 0.8) score -= 20;
  else if (maxJac >= 0.5) score -= 12;
  else if (maxJac >= 0.3) score -= 6;
  if (x.count <= 2 && maxJac === 1) score -= 15;

  return { score, maxJac };
}

function classifyCbm(x) {
  const catNorm = foldVi(x.category);
  if (
    WEAK_CATEGORY_PATTERNS.some((p) => p.test(catNorm)) ||
    (x.maxJac >= 0.8 && x.count <= 3)
  ) {
    return "C";
  }
  if (x.score >= 55) return "A";
  if (x.score >= 35) return "B";
  return "C";
}

/**
 * Class A/B CBM listings for sitemap phase 1 (SEO-04A.1 scoring).
 * @returns {Promise<{ category: string, brand: string, model: string, productCount: number, qualityClass: 'A'|'B', slug: string }[]>}
 */
export async function getCbmSitemapListings() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(pc.canonical_name), ''), NULLIF(TRIM(pc.category_name), '')) AS category,
      TRIM(pc.canonical_slug) AS canonical_slug,
      TRIM(cm.hang_xe) AS brand,
      TRIM(cm.ten_xe) AS model,
      ${pid} AS product_id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN product_category_map pcm ON pcm.product_id = ${pid}
    INNER JOIN product_categories pc ON pc.id = pcm.category_id
    INNER JOIN product_car_applications pca ON pca.productId = ${pid}
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE TRIM(cm.hang_xe) <> ''
      AND TRIM(cm.ten_xe) <> ''
      AND TRIM(pc.canonical_slug) <> ''
      ${vis.sql}
    `,
  );

  /** @type {Map<string, { category: string, canonicalSlug: string, brand: string, model: string, productIds: Set<number> }>} */
  const cbm = new Map();
  for (const r of rows) {
    const category = String(r.category || "").trim();
    const canonicalSlug = String(r.canonical_slug || "").trim();
    const brand = String(r.brand || "").trim();
    const model = String(r.model || "").trim();
    if (!category || !canonicalSlug || !brand || !model) continue;

    const key = `${category}\0${brand}\0${model}`;
    if (!cbm.has(key)) {
      cbm.set(key, {
        category,
        canonicalSlug,
        brand,
        model,
        productIds: new Set(),
      });
    }
    cbm.get(key).productIds.add(Number(r.product_id));
  }

  let list = [...cbm.values()].map((x) => ({
    ...x,
    count: x.productIds.size,
  }));
  list = list.filter((x) => x.count >= 2);

  const catPop = new Map();
  const brandPop = new Map();
  const modelPop = new Map();
  const byCatBrand = new Map();

  for (const x of list) {
    catPop.set(x.category, (catPop.get(x.category) || 0) + 1);
    brandPop.set(x.brand, (brandPop.get(x.brand) || 0) + 1);
    modelPop.set(`${x.brand}|${x.model}`, (modelPop.get(`${x.brand}|${x.model}`) || 0) + 1);

    const groupKey = `${x.category}\0${x.brand}`;
    if (!byCatBrand.has(groupKey)) byCatBrand.set(groupKey, []);
    byCatBrand.get(groupKey).push(x);
  }

  const popCtx = { catPop, brandPop, modelPop, byCatBrand };
  for (const x of list) {
    Object.assign(x, scoreCbm(x, popCtx));
    x.qualityClass = classifyCbm(x);
  }

  return list
    .filter((x) => x.qualityClass === "A" || x.qualityClass === "B")
    .map((x) => ({
      category: x.category,
      brand: x.brand,
      model: x.model,
      productCount: x.count,
      qualityClass: x.qualityClass,
      slug: buildCbmSlug(x.canonicalSlug, x.brand, x.model),
    }))
    .filter((x) => x.slug)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
