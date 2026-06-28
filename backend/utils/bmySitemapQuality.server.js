import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "./productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { slugifyVi } from "./productSlug.js";

const INTENT_GATE = 50;
const SIBLING_DEDUP_JACCARD = 0.95;
const MIN_PRODUCT_COUNT = 10;

const MAINSTREAM_BRANDS = new Set([
  "Toyota",
  "Kia",
  "Mazda",
  "Honda",
  "Hyundai",
  "Ford",
  "Mitsubishi",
  "Nissan",
  "Chevrolet",
  "VinFast",
]);

const MAINSTREAM_MODELS = new Map([
  ["Toyota|Vios", 25],
  ["Toyota|Camry", 25],
  ["Toyota|Fortuner", 22],
  ["Toyota|Innova", 22],
  ["Toyota|Altis", 20],
  ["Kia|Cerato", 20],
  ["Kia|Morning", 18],
  ["Kia|Sorento", 18],
  ["Kia|Sedona", 16],
  ["Mazda|CX-5", 22],
  ["Mazda|3", 20],
  ["Honda|City", 18],
  ["Honda|Civic", 18],
  ["Hyundai|Accent", 16],
  ["Hyundai|Tucson", 16],
]);

function jaccard(a, b) {
  const inter = [...a].filter((id) => b.has(id)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

function buildBmySlug(brand, model, year) {
  const brandSlug = slugifyVi(String(brand || "").trim());
  const modelSlug = slugifyVi(String(model || "").trim());
  const yr = Number(year);
  if (!brandSlug || !modelSlug || !Number.isFinite(yr) || !/^(19|20)\d{2}$/.test(String(yr))) {
    return "";
  }
  if (brandSlug === "san-pham" || modelSlug === "san-pham") return "";
  return `phu-tung-${brandSlug}-${modelSlug}-${yr}`;
}

function siblingDedup(items, threshold = SIBLING_DEDUP_JACCARD) {
  const picked = [];
  const used = new Set();
  const sorted = [...items].sort((a, b) => b.count - a.count);

  for (const x of sorted) {
    const key = `${x.brand}\0${x.model}\0${x.year}`;
    if (used.has(key)) continue;
    picked.push(x);
    for (const y of sorted) {
      const k2 = `${y.brand}\0${y.model}\0${y.year}`;
      if (used.has(k2) || y.brand !== x.brand || y.model !== x.model) continue;
      if (jaccard(x.ids, y.ids) >= threshold) used.add(k2);
    }
    used.add(key);
  }

  return picked;
}

function intentScore(x, bmCounts, modelPop) {
  let score = 0;

  if (x.count >= 150) score += 35;
  else if (x.count >= 100) score += 28;
  else if (x.count >= 50) score += 20;
  else if (x.count >= 30) score += 14;
  else if (x.count >= 20) score += 10;
  else score += 6;

  if (MAINSTREAM_BRANDS.has(x.brand)) score += 12;
  else score += 4;

  score += MAINSTREAM_MODELS.get(`${x.brand}|${x.model}`) || 0;

  const mp = modelPop.get(`${x.brand}|${x.model}`) || 0;
  if (mp >= 8) score += 10;
  else if (mp >= 5) score += 6;
  else if (mp >= 3) score += 3;

  if (x.year >= 2005 && x.year <= 2025) score += 8;
  else if (x.year >= 1995) score += 4;

  const bm = bmCounts.get(`${x.brand}\0${x.model}`);
  if (bm) {
    const ratio = x.count / bm.count;
    if (ratio <= 0.35) score += 8;
    else if (ratio <= 0.55) score += 5;
    else if (ratio <= 0.75) score += 2;
  }

  return score;
}

/**
 * BMY phase-1 sitemap listings (SEO-04B.3 gate).
 * Gate: productCount >= 10, sibling dedup Jaccard >= 0.95, intentScore >= 50.
 *
 * @returns {Promise<{ brand: string, model: string, year: number, productCount: number, intentScore: number, slug: string }[]>}
 */
export async function getBmySitemapListings() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      ${pid} AS product_id,
      TRIM(cm.hang_xe) AS brand,
      TRIM(cm.ten_xe) AS model,
      pca.year_from,
      pca.year_to
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN product_car_applications pca ON pca.productId = ${pid}
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE TRIM(cm.hang_xe) <> ''
      AND TRIM(cm.ten_xe) <> ''
      ${vis.sql}
    `,
  );

  /** @type {Map<string, { brand: string, model: string, year: number, ids: Set<number> }>} */
  const bmy = new Map();
  /** @type {Map<string, Set<number>>} */
  const bm = new Map();

  for (const r of rows) {
    const brand = String(r.brand || "").trim();
    const model = String(r.model || "").trim();
    const productId = Number(r.product_id);
    if (!brand || !model || !Number.isFinite(productId)) continue;

    const bmKey = `${brand}\0${model}`;
    if (!bm.has(bmKey)) bm.set(bmKey, new Set());
    bm.get(bmKey).add(productId);

    const yf = Number(r.year_from);
    const yt = Number(r.year_to);
    if (!Number.isFinite(yf) || !Number.isFinite(yt)) continue;

    for (let y = Math.min(yf, yt); y <= Math.max(yf, yt); y++) {
      if (!/^(19|20)\d{2}$/.test(String(y))) continue;
      const key = `${brand}\0${model}\0${y}`;
      if (!bmy.has(key)) {
        bmy.set(key, { brand, model, year: y, ids: new Set() });
      }
      bmy.get(key).ids.add(productId);
    }
  }

  const ge10 = [...bmy.values()]
    .map((x) => ({ ...x, count: x.ids.size }))
    .filter((x) => x.count >= MIN_PRODUCT_COUNT);

  /** @type {Map<string, typeof ge10>} */
  const byBm = new Map();
  for (const x of ge10) {
    const k = `${x.brand}\0${x.model}`;
    if (!byBm.has(k)) byBm.set(k, []);
    byBm.get(k).push(x);
  }

  const deduped = [];
  for (const arr of byBm.values()) {
    deduped.push(...siblingDedup(arr));
  }

  const bmCounts = new Map([...bm.entries()].map(([k, s]) => [k, { count: s.size }]));
  const modelPop = new Map();
  for (const x of deduped) {
    const k = `${x.brand}|${x.model}`;
    modelPop.set(k, (modelPop.get(k) || 0) + 1);
  }

  return deduped
    .map((x) => {
      const intent = intentScore(x, bmCounts, modelPop);
      const slug = buildBmySlug(x.brand, x.model, x.year);
      return {
        brand: x.brand,
        model: x.model,
        year: x.year,
        productCount: x.count,
        intentScore: intent,
        slug,
      };
    })
    .filter((x) => x.intentScore >= INTENT_GATE && x.slug)
    .sort((a, b) => b.intentScore - a.intentScore || b.productCount - a.productCount || a.slug.localeCompare(b.slug));
}
