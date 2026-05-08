import { pool } from "../config/db.js";
function stripOtoSuffix(s) {
  const t = String(s ?? "")
    .toLowerCase()
    .trim();

  if (t.endsWith("-o-to")) {
    return t.slice(0, -6).replace(/-+$/, "");
  }

  return t;
}
import {
  composeIntroHtml,
  composePartArticle,
} from "./seoComposer.js";
import { logError, logInfo, logWarn } from "../utils/syncLogger.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";

const MIN_RELATED_PRODUCTS_FOR_SEO = 2;

/** @type {Promise<{ vehicles: Array<object>, locations: Array<object> }> | null} */
let seoContextDictionaryPromise = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(str) {
  return String(str ?? "").replace(/<[^>]*>/g, " ");
}

function slugifyContext(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseSlug(slug) {
  return String(slug ?? "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildPartSlugCandidates(slug) {
  const requestedSlug = slugifyContext(slug);
  const tokens = requestedSlug.split("-").filter(Boolean);
  const seen = new Set();
  const candidates = [];

  for (let i = tokens.length; i > 0; i -= 1) {
    const candidate = tokens.slice(0, i).join("-");
    const variants = [candidate];
    if (candidate.endsWith("-o-to")) {
      variants.push(candidate.slice(0, -"-o-to".length).replace(/-+$/, ""));
    }

    for (const variant of variants) {
      if (!variant || seen.has(variant)) continue;
      seen.add(variant);
      candidates.push(variant);
    }
  }

  return candidates;
}

async function findMatchingPartSlug(slug) {
  const candidates = buildPartSlugCandidates(slug);
  if (!candidates.length) return "";

  const [rows] = await pool.query(`
    SELECT slug
    FROM part_knowledge
    WHERE slug IN (?)
  `, [candidates]);

  const matchedSlugs = new Set(rows.map((row) => slugifyContext(row.slug)));
  return candidates.find((candidate) => matchedSlugs.has(candidate)) || "";
}

async function findExactPartByRequestedSlug(slug) {
  const baseSlug = await findMatchingPartSlug(slug);
  if (!baseSlug) return { part: null, baseSlug: "" };

  const [[part]] = await pool.query(`
    SELECT *
    FROM part_knowledge
    WHERE slug = ?
    LIMIT 1
  `, [baseSlug]);

  return {
    part: part ?? null,
    baseSlug,
  };
}

/**
 * Normalize cross_sell_json for API (array of links / labels).
 */
function parseCrossSell(jsonVal) {
  if (jsonVal == null || jsonVal === "") return null;
  if (Array.isArray(jsonVal)) return jsonVal;
  if (typeof jsonVal === "object") return jsonVal;
  try {
    const j = typeof jsonVal === "string" ? JSON.parse(jsonVal) : jsonVal;
    return Array.isArray(j) || typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

/** FAQ as structured payload for frontend + seo_page_cache.faq_json */
function parseFaqFlexible(faq_text) {
  if (faq_text == null || faq_text === "") return null;
  const raw = String(faq_text).trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j))
      return { kind: "list", items: j };
    if (typeof j === "object" && j !== null)
      return { kind: "json", payload: j };
  } catch {
    /** fall through */
  }
  const lines = raw
    .split(/\n\s*\n/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    kind: "textLines",
    lines: lines.length ? lines : [raw],
  };
}

/** Read FAQ from seo_page_cache.faq_json (MySQL JSON / string / object). */
function faqFromCachedColumn(val) {
  if (val == null || val === "") return null;
  let parsed = val;
  if (typeof val === "string") {
    try {
      parsed = JSON.parse(val);
    } catch {
      return parseFaqFlexible(val);
    }
  }
  if (parsed?.kind === "list" || parsed?.kind === "json" || parsed?.kind === "textLines") {
    return parsed;
  }
  if (Array.isArray(parsed)) return { kind: "list", items: parsed };
  if (typeof parsed === "object" && parsed !== null)
    return { kind: "json", payload: parsed };
  return null;
}

/** @param {Record<string, unknown>} route */
/** @param {Record<string, unknown>} part */
export function buildSeoPageTitle(route, part) {
  const h1 =
    (typeof route?.h1 === "string" && route.h1.trim()) ||
    (typeof part?.name_vi === "string" && String(part.name_vi).trim()) ||
    "Phụ tùng";
  return `${h1} chính hãng, giá tốt | Otofine`;
}

/** Meta description grounded in real `summary`; falls back to H1-focused line. */
export function buildSeoMetaDescription(route, part) {
  const h1 =
    (typeof route?.h1 === "string" && route.h1.trim()) ||
    (typeof part?.name_vi === "string" && String(part.name_vi).trim()) ||
    "";
  const fallback = `${h1} cho nhiều dòng xe. Tra cứu đúng phụ tùng, xem giá mới nhất và tư vấn tại Otofine.`;
  const s = String(part?.summary ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return fallback;
  if (/^Đoạn\s*\d+/i.test(s)) {
    /** strip legacy templated placeholders if present */
    return fallback;
  }
  return s.length <= 200 ? s : `${s.slice(0, 197)}…`;
}

/** JSON-serializable FAQ for MySQL JSON column */
function faqStructuredToJsonPayload(structured) {
  if (!structured) return null;
  return structured;
}

/**
 * Persist composed HTML/meta from live part_knowledge (seoComposer — real automotive fields).
 * @param {number} routeId
 * @param {{ title: string, meta_description: string, intro_html: string, article_html: string, faqStructured: unknown }} body
 */
export async function upsertSeoPageCache(routeId, body) {
  const faqJson = faqStructuredToJsonPayload(body.faqStructured);
  await pool.query(
    `
    INSERT INTO seo_page_cache (
      route_id,
      title,
      meta_description,
      intro_html,
      article_html,
      faq_json
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      meta_description = VALUES(meta_description),
      intro_html = VALUES(intro_html),
      article_html = VALUES(article_html),
      faq_json = VALUES(faq_json),
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      routeId,
      body.title,
      body.meta_description,
      body.intro_html,
      body.article_html,
      faqJson == null ? null : JSON.stringify(faqJson),
    ],
  );
}

/** Build composed cache body from DB rows (composer only — no templated generics). */
export async function composeSeoHtmlFromPart(route, part) {
  const introHtml = composeIntroHtml(part);
  const articleHtml = composePartArticle(part, {
    omitSummary: Boolean(introHtml?.trim?.()),
  });
  const title = buildSeoPageTitle(route, part);
  const meta_description = buildSeoMetaDescription(route, part);
  const faqStructured = parseFaqFlexible(part.faq_text);
  return {
    title,
    meta_description,
    intro_html: introHtml,
    article_html: articleHtml,
    faqStructured,
  };
}

function pickProductThumb(productId, imagesByPid) {
  const list = imagesByPid.get(productId);
  const first = list?.[0];
  return first?.url ?? null;
}

function slugToDisplayName(slug) {
  const raw = String(slug ?? "")
    .toLowerCase()
    .replace(/-o-to$/i, "")
    .replace(/^phu-tung-/i, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "phụ tùng ô tô";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function tokensFromSlug(slug) {
  const stop = new Set([
    "phu",
    "tung",
    "o",
    "to",
    "oto",
    "chinh",
    "hang",
    "gia",
    "tot",
    "tai",
  ]);
  return String(slug ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !stop.has(x) && !/^\d{4}$/.test(x))
    .slice(0, 8);
}

async function loadSeoContextDictionary() {
  if (!seoContextDictionaryPromise) {
    seoContextDictionaryPromise = (async () => {
      const [vehicles] = await pool.query(`
        SELECT DISTINCT
          TRIM(hang_xe) AS brand,
          TRIM(ten_xe) AS model
        FROM car_models
        WHERE COALESCE(TRIM(hang_xe), '') <> ''
      `);

      const [locations] = await pool.query(`
        SELECT
          a.id,
          a.tinh_tp AS name
        FROM address a
        WHERE COALESCE(TRIM(a.tinh_tp), '') <> ''
      `);

      return {
        vehicles: vehicles
          .map((row) => {
            const brand = String(row.brand ?? "").trim();
            const model = String(row.model ?? "").trim();
            const brandSlug = slugifyContext(brand);
            const modelSlug = slugifyContext(model);
            return {
              brand,
              model,
              brandSlug,
              modelSlug,
              comboSlug: [brandSlug, modelSlug].filter(Boolean).join("-"),
            };
          })
          .filter((row) => row.brandSlug),
        locations: locations
          .map((row) => {
            const name = String(row.name ?? "").trim();
            const cleanName = name.replace(/^TP\s+/i, "").trim() || name;
            return {
              id: Number(row.id),
              name,
              slug: slugifyContext(cleanName),
            };
          })
          .filter((row) => row.id && row.slug),
      };
    })();
  }
  return seoContextDictionaryPromise;
}

function removeSlugSuffix(slug, suffix) {
  if (!slug || !suffix) return slug;
  if (slug === suffix) return "";
  return slug.endsWith(`-${suffix}`) ? slug.slice(0, -suffix.length - 1) : slug;
}

function removeYearFromSlug(slug, year) {
  if (!slug || !year) return slug;
  return slug
    .split("-")
    .filter((token) => token !== String(year))
    .join("-");
}

function pickSlugContextBase(requestedSlug, part) {
  const candidates = [
    part?.slug,
    stripOtoSuffix(part?.slug),
    part?.name_vi,
    part?.canonical_name,
  ]
    .map(slugifyContext)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    if (requestedSlug === candidate || requestedSlug.startsWith(`${candidate}-`)) {
      return candidate;
    }
  }
  return "";
}

function pickVehicleFromTail(tail, vehicles) {
  if (!tail) return null;
  const sorted = [...vehicles].sort((a, b) => {
    const al = String(a.comboSlug || a.brandSlug).length;
    const bl = String(b.comboSlug || b.brandSlug).length;
    return bl - al;
  });

  for (const vehicle of sorted) {
    if (vehicle.comboSlug && (tail === vehicle.comboSlug || tail.startsWith(`${vehicle.comboSlug}-`))) {
      return vehicle;
    }
  }

  for (const vehicle of sorted) {
    if (vehicle.brandSlug && (tail === vehicle.brandSlug || tail.startsWith(`${vehicle.brandSlug}-`))) {
      return { ...vehicle, model: null, modelSlug: "" };
    }
  }

  return null;
}

async function parseSeoSlugContext(slug, part) {
  const requestedSlug = String(slug ?? "").toLowerCase().trim();
  const baseSlug = pickSlugContextBase(requestedSlug, part);
  if (!requestedSlug || !baseSlug || requestedSlug === baseSlug) {
    return {
      partName: String(part?.name_vi ?? "").trim(),
      sourceSlug: requestedSlug,
      baseSlug,
      brand: null,
      model: null,
      year: null,
      location: null,
      locationId: null,
      locationSlug: null,
      hasVehicleContext: false,
      hasLocationContext: false,
      vehicleLabel: "",
      displayName: String(part?.name_vi ?? "").trim(),
    };
  }

  const dict = await loadSeoContextDictionary();
  let tail = requestedSlug.slice(baseSlug.length).replace(/^-+/, "");
  tail = tail
    .replace(/^o-to(?:-|$)/, "")
    .replace(/^tai-/, "")
    .replace(/-tai-/g, "-");

  const location = [...dict.locations]
    .sort((a, b) => b.slug.length - a.slug.length)
    .find((loc) => tail === loc.slug || tail.endsWith(`-${loc.slug}`) || tail.endsWith(`-tai-${loc.slug}`));
  if (location) tail = removeSlugSuffix(tail, location.slug);
  tail = tail.replace(/-tai$/, "");

  const yearMatch = tail.match(/(?:^|-)((?:19|20)\d{2})(?:-|$)/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  if (year) tail = removeYearFromSlug(tail, year);

  const vehicle = pickVehicleFromTail(tail, dict.vehicles);
  const partName = String(part?.name_vi ?? "").trim() || slugToDisplayName(baseSlug);
  const brand = vehicle?.brand || null;
  const model = vehicle?.model || null;
  const vehicleLabel = [brand, model, year].filter(Boolean).join(" ");
  const displayName = [partName, vehicleLabel].filter(Boolean).join(" ");

  return {
    partName,
    sourceSlug: requestedSlug,
    baseSlug,
    brand,
    model,
    year,
    location: location?.name || null,
    locationId: location?.id || null,
    locationSlug: location?.slug || null,
    hasVehicleContext: Boolean(brand || model || year),
    hasLocationContext: Boolean(location?.id),
    vehicleLabel,
    displayName,
  };
}

function hasEnoughRelatedProducts(dyn) {
  return Array.isArray(dyn?.products) && dyn.products.length >= MIN_RELATED_PRODUCTS_FOR_SEO;
}

function hasDescriptiveSeoText(body) {
  const text = `${body?.intro_html ?? ""} ${body?.article_html ?? ""}`
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 80;
}

function productContextWhere(context, pc) {
  const where = [];
  const params = [];
  const pid = pc.idExpr("p");

  if (context?.brand) {
    where.push(`EXISTS (
      SELECT 1
      FROM product_car_applications pa_brand
      INNER JOIN car_models cm_brand ON cm_brand.id = pa_brand.carModelId
      WHERE pa_brand.productId = ${pid}
        AND cm_brand.hang_xe = ?
    )`);
    params.push(context.brand);
  }

  if (context?.model) {
    where.push(`EXISTS (
      SELECT 1
      FROM product_car_applications pa_model
      INNER JOIN car_models cm_model ON cm_model.id = pa_model.carModelId
      WHERE pa_model.productId = ${pid}
        AND cm_model.ten_xe = ?
    )`);
    params.push(context.model);
  }

  if (context?.year) {
    where.push(`EXISTS (
      SELECT 1
      FROM product_car_applications pa_year
      WHERE pa_year.productId = ${pid}
        AND pa_year.year_from <= ?
        AND pa_year.year_to >= ?
    )`);
    params.push(context.year, context.year);
  }

  return { where, params };
}

async function loadProductBlocks(route, part = null, context = null) {
  const pkId = route.part_knowledge_id;
  const keyword = String(part?.name_vi ?? route?.h1 ?? "").trim();
  const pc = await getProductsColumnsResolved();
  const orderByFresh = pc.orderExprQualified("p");
  const contextual = productContextWhere(context, pc);
  const contextWhere = contextual.where.length
    ? `AND ${contextual.where.join("\n        AND ")}`
    : "";

  const [products] = await pool.query(
    `
    SELECT p.*
    FROM products p
    WHERE
      (
        p.part_knowledge_id = ?
        OR ${pc.partNameExpr("p")} LIKE ?
      )
      ${contextWhere}
    ORDER BY ${pc.stockExpr("p")} DESC, ${orderByFresh} DESC
    LIMIT 24
    `,
    [pkId, `%${keyword}%`, ...contextual.params],
  );

  console.log("SEO DEBUG", {
    slug: route?.slug,
    partId: pkId,
    productCount: products.length,
  });

  return attachImagesAndShops(products, context);
}

async function attachImagesAndShops(products, context = null) {
  const productIds = products.map((p) => p.id);
  /** @type {import("mysql2").RowDataPacket[]} */
  let imageRows = [];
  if (productIds.length > 0) {
    ;[imageRows] = await pool.query(
      `
      SELECT pi.id,
             pi.productId,
             pi.url,
             pi.isPrimary
      FROM product_images pi
      WHERE pi.productId IN (?)
      ORDER BY pi.isPrimary DESC, pi.productId ASC, pi.id ASC
      LIMIT 12
      `,
      [productIds],
    );
  }

  const imagesByPid = new Map();
  for (const im of imageRows) {
    const pid = im.productId;
    if (!imagesByPid.has(pid)) imagesByPid.set(pid, []);
    imagesByPid.get(pid).push(im);
  }

  /** @type {import("mysql2").RowDataPacket[]} */
  let shopRows = [];
  if (productIds.length > 0) {
    const locationWhere = context?.locationId ? "AND s.provinceId = ?" : "";
    const locationParams = context?.locationId ? [Number(context.locationId)] : [];
    ;[shopRows] = await pool.query(
      `
      SELECT s.*,
             a.tinh_tp AS city,
             t.cnt AS total_products
      FROM (
        SELECT p.shopId AS sid,
               COUNT(*) AS cnt
        FROM products p
        WHERE p.id IN (?)
        GROUP BY p.shopId
      ) t
      INNER JOIN shops s ON s.id = t.sid
      LEFT JOIN address a ON a.id = s.provinceId
      WHERE 1=1 ${locationWhere}
      ORDER BY t.cnt DESC
      LIMIT 10
      `,
      [productIds, ...locationParams],
    );
  }

  return {
    products,
    images: imageRows,
    shops: shopRows,
    productThumbnails: Object.fromEntries(
      products.map((p) => [
        String(p.id),
        pickProductThumb(p.id, imagesByPid),
      ]),
    ),
  };
}

async function loadFallbackProductBlocksBySlug(slug) {
  const pc = await getProductsColumnsResolved();
  const tokens = tokensFromSlug(slug);
  if (!tokens.length) {
    return attachImagesAndShops([]);
  }

  const haystack = [
    pc.partNameExpr("p"),
    pc.shortDescriptionExpr("p"),
    pc.descriptionExpr("p"),
    pc.partNumberExpr("p"),
  ].join(", ' ', ");
  const hayExpr = `LOWER(CONCAT_WS(' ', ${haystack}))`;
  const where = tokens.map(() => `${hayExpr} LIKE ?`).join(" OR ");
  const scoreExpr = tokens
    .map(() => `CASE WHEN ${hayExpr} LIKE ? THEN 1 ELSE 0 END`)
    .join(" + ");
  const likeParams = tokens.map((t) => `%${t}%`);
  const orderByFresh = pc.orderExprQualified("p");

  const [products] = await pool.query(
    `
    SELECT p.*, (${scoreExpr}) AS _slug_score
    FROM products p
    WHERE ${where}
    ORDER BY _slug_score DESC, ${pc.stockExpr("p")} DESC, ${orderByFresh} DESC
    LIMIT 24
    `,
    [...likeParams, ...likeParams],
  );

  return attachImagesAndShops(products);
}

function buildFallbackPartFromProducts(slug, dyn) {
  const displayName = slugToDisplayName(slug);
  const productNames = dyn.products
    .map((p) => String(p.partName || p.shortDescription || "").trim())
    .filter(Boolean);
  const sampleNames = [...new Set(productNames)].slice(0, 5);
  const shopNames = dyn.shops
    .map((s) => String(s.name || "").trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    id: null,
    slug,
    name_vi: displayName,
    name_en: "",
    category_name: displayName,
    summary: `${displayName} đang có ${dyn.products.length} sản phẩm liên quan trên Otofine${shopNames.length ? ` từ các cửa hàng như ${shopNames.join(", ")}` : ""}. Danh sách này được tổng hợp từ dữ liệu sản phẩm thực tế để người mua đối chiếu tên phụ tùng, mã hàng, giá và nơi bán trước khi liên hệ.`,
    function_text: sampleNames.length
      ? `Các sản phẩm liên quan hiện gồm ${sampleNames.join(", ")}. Khi chọn mua, nên so khớp tên phụ tùng, mã sản phẩm, đời xe và tình trạng còn hàng để tránh đặt nhầm chi tiết.`
      : "",
    structure_text: "",
    operation_text: "",
    symptoms_text: "",
    common_causes_text: "",
    replace_interval_text: "",
    warnings_text: "Thông tin trang này được tạo từ dữ liệu sản phẩm đang có, vì vậy nên xác nhận lại mã phụ tùng, phiên bản xe và chính sách bảo hành với cửa hàng trước khi mua.",
    garage_notes_text: shopNames.length
      ? `Một số cửa hàng liên quan: ${shopNames.join(", ")}. Ưu tiên liên hệ cửa hàng có ảnh sản phẩm, giá rõ ràng và tư vấn đúng xe.`
      : "",
    buyer_mistakes_text: "Lỗi thường gặp là chỉ nhìn tên gọi chung mà không đối chiếu mã phụ tùng, vị trí lắp hoặc đời xe.",
    buying_guide_text: "Nên chuẩn bị biển số, số khung/số VIN hoặc ảnh phụ tùng cũ để cửa hàng kiểm tra đúng biến thể. So sánh nhiều sản phẩm liên quan giúp tránh nội dung mỏng và tăng khả năng chọn đúng phụ tùng.",
    faq_text: null,
    cross_sell_json: null,
  };
}

async function buildFallbackSeoPageFromProducts(slug) {
  const dyn = await loadFallbackProductBlocksBySlug(slug);
  if (!hasEnoughRelatedProducts(dyn)) {
    logInfo("seoPage", "fallback skipped — insufficient product data", {
      slug,
      products: dyn.products.length,
    });
    return null;
  }

  const part = buildFallbackPartFromProducts(slug, dyn);
  const route = {
    id: null,
    slug,
    h1: part.name_vi,
    part_knowledge_id: null,
    page_type: "product_fallback",
    canonical_url: `/${slug}`,
    is_active: 1,
  };
  const composed = await composeSeoHtmlFromPart(route, part);
  if (!hasDescriptiveSeoText(composed)) {
    logInfo("seoPage", "fallback skipped — insufficient descriptive text", {
      slug,
    });
    return null;
  }

  return buildResponse({
    route,
    part,
    cached: false,
    title: composed.title,
    meta_description: composed.meta_description,
    intro_html: composed.intro_html,
    article_html: composed.article_html,
    faq_json: composed.faqStructured,
    faqStructured: composed.faqStructured,
    dyn,
  });
}

function buildContextualH1(part, context) {
  const base = String(context?.partName || part?.name_vi || "").trim() || "Phụ tùng";
  return context?.vehicleLabel ? `${base} ${context.vehicleLabel}` : base;
}

function buildContextualTitle(route, part, context) {
  const h1 = buildContextualH1(part, context);
  const locationText = context?.location ? ` tại ${context.location}` : "";
  return `${h1}${locationText} chính hãng, giá tốt | Otofine`;
}

function buildContextualMetaDescription(part, context) {
  const h1 = buildContextualH1(part, context);
  const locationText = context?.location ? ` tại ${context.location}` : "";
  const vehicleText = context?.vehicleLabel ? ` cho ${context.vehicleLabel}` : "";
  const fallback = `${h1}${locationText}: tra cứu đúng mã phụ tùng${vehicleText}, xem giá mới nhất và cửa hàng phù hợp trên Otofine.`;
  const s = String(part?.summary ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s || /^Đoạn\s*\d+/i.test(s)) return fallback;
  const prefix = `${h1}${locationText}: `;
  const desc = `${prefix}${stripTags(s)}`;
  return desc.length <= 200 ? desc : `${desc.slice(0, 197)}…`;
}

function contextualIntroHtml(introHtml, part, context) {
  if (!context?.hasVehicleContext && !context?.hasLocationContext) return introHtml;
  const h1 = buildContextualH1(part, context);
  const tail = context?.location
    ? ` Người mua tại ${context.location} có thể đối chiếu thêm cửa hàng, tình trạng còn hàng và thời gian giao/lắp phù hợp.`
    : "";
  const para = `<p>${escapeHtml(`${h1} là bộ phận cần chọn đúng theo mã phụ tùng, phiên bản xe và điều kiện sử dụng thực tế.${tail}`)}</p>\n`;
  return `${para}${introHtml || ""}`;
}

function contextualLocationSection(context) {
  if (!context?.location) return "";
  const partName = context.partName || "phụ tùng";
  const vehicleText = context.vehicleLabel ? ` cho ${context.vehicleLabel}` : "";
  const vehicleParagraph = context.vehicleLabel
    ? `<p>${escapeHtml(`Với ${context.vehicleLabel}, ${partName.toLowerCase()} nên được đối chiếu theo đời xe, phiên bản động cơ và mã OE/OEM trước khi đặt hàng. Cùng một dòng xe có thể có khác biệt nhỏ theo năm sản xuất, vì vậy ảnh chi tiết cũ hoặc số VIN giúp shop kiểm tra đúng biến thể.`)}</p>`
    : "";
  return `\n<section class="seo-part-section seo-part-section--context">\n<h2>${escapeHtml(`${partName}${vehicleText} tại ${context.location}`)}</h2>\n<div class="seo-part-section__body">${vehicleParagraph}<p>${escapeHtml(`Tại ${context.location}, điều kiện giao thông đô thị, mật độ dừng - chạy, đường ngập nước và thời tiết ẩm nóng có thể làm ${partName.toLowerCase()} hao mòn hoặc xuống cấp nhanh hơn so với xe chạy đường trường ổn định.`)}</p><p>${escapeHtml(`Khi chọn mua${vehicleText}, nên ưu tiên sản phẩm có ảnh thật, mã hàng rõ ràng, giá cập nhật và cửa hàng có sẵn hàng gần khu vực để kiểm tra nhanh trước khi lắp.`)}</p></div>\n</section>\n`;
}

function contextualVehicleSection(context) {
  if (!context?.hasVehicleContext || context?.hasLocationContext) return "";
  const partName = context.partName || "phụ tùng";
  return `\n<section class="seo-part-section seo-part-section--context">\n<h2>${escapeHtml(`${partName} cho ${context.vehicleLabel}`)}</h2>\n<div class="seo-part-section__body"><p>${escapeHtml(`${partName} trên ${context.vehicleLabel} cần được đối chiếu theo đời xe, phiên bản động cơ và mã OE/OEM. Cùng một tên phụ tùng có thể có nhiều biến thể, vì vậy nên kiểm tra mã in trên chi tiết cũ hoặc cung cấp số VIN để cửa hàng xác nhận trước khi mua.`)}</p><p>${escapeHtml(`Nếu xe thường chạy phố, tải nặng hoặc đi cao tốc dài, biểu hiện hao mòn có thể khác nhau: chạy phố dễ gặp nhiệt và bụi bẩn tích tụ, còn chạy đường trường cần ưu tiên độ ổn định và đúng thông số lắp đặt.`)}</p><p>${escapeHtml(`Với ${context.vehicleLabel}, lỗi thường bị nhầm là chỉ nhìn tên phụ tùng chung mà bỏ qua năm sản xuất, vị trí lắp hoặc phiên bản xe. Nên so sánh sản phẩm có mã rõ ràng và hỏi shop xác nhận tương thích trước khi mua.`)}</p></div>\n</section>\n`;
}

function injectContextualArticleHtml(articleHtml, context) {
  const addition = contextualLocationSection(context) || contextualVehicleSection(context);
  if (!addition) return articleHtml;
  const html = String(articleHtml ?? "");
  const secondH2 = (() => {
    const re = /<section\b[^>]*class="[^"]*seo-part-section[^"]*"[^>]*>/gi;
    let match;
    let count = 0;
    while ((match = re.exec(html)) !== null) {
      count += 1;
      if (count === 2) return match.index;
    }
    return -1;
  })();
  if (secondH2 >= 0) return `${html.slice(0, secondH2)}${addition}${html.slice(secondH2)}`;
  return `${addition}${html}`;
}

function buildResponse({
  route,
  part,
  cached,
  title,
  meta_description,
  intro_html,
  article_html,
  faq_json,
  faqStructured,
  dyn,
  context,
}) {
  const introHtml = contextualIntroHtml(intro_html || part?.intro_html || "", part, context);
  const articleHtml = injectContextualArticleHtml(article_html || part?.body || "", context);
  const faqMerged = faqStructured ?? faqFromCachedColumn(faq_json);
  const routeWithContext = context?.hasVehicleContext || context?.hasLocationContext
    ? {
      ...route,
      h1: buildContextualH1(part, context),
    }
    : route;
  const titleWithContext =
    context?.hasVehicleContext || context?.hasLocationContext
      ? buildContextualTitle(route, part, context)
      : title;
  const metaWithContext =
    context?.hasVehicleContext || context?.hasLocationContext
      ? buildContextualMetaDescription(part, context)
      : meta_description;

  const payload = {
    route: routeWithContext,
    cached,
    title: titleWithContext,
    meta_description: metaWithContext,
    intro_html: introHtml,
    article_html: articleHtml,
    faq_json: faqMerged ?? faq_json ?? null,
    part,
    products: dyn.products,
    images: dyn.images,
    shops: dyn.shops,
    seoContent: {
      introHtml,
      articleHtml,
      faqStructured: faqMerged,
      rawFields: {
        summary: part?.summary,
        structure_text: part?.structure_text,
        operation_text: part?.operation_text,
        body: part?.body,
        vn_usage_notes_text: part?.vn_usage_notes_text,
      },
      crossSell: parseCrossSell(part?.cross_sell_json),
    },
    productThumbnails: dyn.productThumbnails,
    context: context ?? null,
  };

  return payload;
}

/**
 * Invalidate all cache rows then rebuild compositions from seo_routes + part_knowledge.
 */
export async function rebuildSeoPageCacheAll({ deleteFirst = true } = {}) {
  if (deleteFirst) {
    await pool.query(`DELETE FROM seo_page_cache`);
    logInfo("seoPage.cache", "wiped seo_page_cache", {});
  }

  const [routes] = await pool.query(
    `SELECT * FROM seo_routes WHERE is_active = 1 ORDER BY id ASC`,
  );

  let ok = 0;
  let skipped = 0;

  for (const route of routes) {
    try {
      const [parts] = await pool.query(
        `SELECT * FROM part_knowledge WHERE id = ? LIMIT 1`,
        [route.part_knowledge_id],
      );
      const part = parts[0];
      if (!part) {
        skipped++;
        logWarn("seoPage.cache", "skip route — no part_knowledge", {
          route_id: route.id,
          part_knowledge_id: route.part_knowledge_id,
        });
        continue;
      }

      const dyn = await loadProductBlocks(route, part);
      if (!hasEnoughRelatedProducts(dyn)) {
        skipped++;
        logWarn("seoPage.cache", "skip route — insufficient related products", {
          route_id: route.id,
          part_knowledge_id: route.part_knowledge_id,
          products: dyn.products.length,
        });
        continue;
      }

      const composed = await composeSeoHtmlFromPart(route, part);
      if (!hasDescriptiveSeoText(composed)) {
        skipped++;
        logWarn("seoPage.cache", "skip route — insufficient descriptive text", {
          route_id: route.id,
          part_knowledge_id: route.part_knowledge_id,
        });
        continue;
      }

      await upsertSeoPageCache(route.id, {
        title: composed.title,
        meta_description: composed.meta_description,
        intro_html: composed.intro_html,
        article_html: composed.article_html,
        faqStructured: composed.faqStructured,
      });
      ok++;
    } catch (e) {
      logError("seoPage.cache", e?.message || String(e), {
        route_id: route.id,
      });
      throw e;
    }
  }

  logInfo("seoPage.cache", "rebuild complete", {
    rebuilt: ok,
    skipped,
    routes: routes.length,
  });
}

export async function getSeoPageBySlug(slug) {
  const s = String(slug ?? "").trim().toLowerCase();
  if (!s) return null;

  try {
    const { part, baseSlug } = await findExactPartByRequestedSlug(s);

    if (!part) {
      logInfo("seoPage", "strict slug miss — no fallback", {
        slug: s,
        baseSlug,
      });
      return null;
    }

    const context = await parseSeoSlugContext(s, part);
    const route = {
      id: null,
      slug: s,
      part_knowledge_id: part.id,
      page_type: "part",
      canonical_url: `/${s}`,
      is_active: 1,
      h1: buildContextualH1(part, context) || String(part?.name_vi ?? "").trim(),
    };

    const dyn = await loadProductBlocks(route, part, context);
    const composed = await composeSeoHtmlFromPart(route, part);
    if (!hasDescriptiveSeoText(composed)) {
      logInfo("seoPage", "skip seo page — insufficient descriptive text", {
        slug: s,
        baseSlug,
        part_knowledge_id: part.id,
      });
      return null;
    }

    logInfo("seoPage", "strict slug match", {
      slug: s,
      baseSlug,
      part_knowledge_id: part.id,
    });

    return buildResponse({
      route,
      part,
      cached: false,
      title: composed.title,
      meta_description: composed.meta_description,
      intro_html: composed.intro_html,
      article_html: composed.article_html,
      faq_json: composed.faqStructured,
      faqStructured: composed.faqStructured,
      dyn,
      context,
    });
  } catch (e) {
    logError("seoPage", e?.message || String(e), {
      slug,
      stack: e?.stack,
    });
    throw e;
  }
}
