import { pool } from "../config/db.js";
import {
  composeIntroHtml,
  composePartArticle,
} from "./seoComposer.js";
import { logError, logInfo, logWarn } from "../utils/syncLogger.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { resolveSeoSlugWithRanking } from "./seoSlugResolver.service.js";

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

async function loadProductBlocks(route) {
  const pkId = route.part_knowledge_id;
  const pc = await getProductsColumnsResolved();
  const orderByFresh = pc.orderExprQualified("p");

  const [products] = await pool.query(
    `
    SELECT p.*
    FROM products p
    WHERE p.part_knowledge_id = ?
    ORDER BY p.stock DESC, ${orderByFresh} DESC
    LIMIT 24
    `,
    [pkId],
  );

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

  const [shopRows] = await pool.query(
    `
    SELECT s.*,
           t.cnt AS total_products
    FROM (
      SELECT p.shopId AS sid,
             COUNT(*) AS cnt
      FROM products p
      WHERE p.part_knowledge_id = ?
      GROUP BY p.shopId
    ) t
    INNER JOIN shops s ON s.id = t.sid
    ORDER BY t.cnt DESC
    LIMIT 10
    `,
    [pkId],
  );

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
}) {
  const introHtml = intro_html ?? "";
  const articleHtml = article_html ?? "";
  const faqMerged = faqStructured ?? faqFromCachedColumn(faq_json);

  const payload = {
    route,
    cached,
    title,
    meta_description,
    intro_html,
    article_html,
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

      const composed = await composeSeoHtmlFromPart(route, part);
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
    const { part: resolverPart, routeRow, resolution } =
      await resolveSeoSlugWithRanking(s);

    if (!routeRow) {
      logInfo("seoPage", "route not found — legacy slug flow", { slug: s });
      return null;
    }

    const mergedPkId =
      resolverPart?.id != null
        ? Number(resolverPart.id)
        : Number(routeRow.part_knowledge_id);
    const [[part]] = await pool.query(`SELECT * FROM part_knowledge WHERE id = ? LIMIT 1`, [
      mergedPkId,
    ]);

    if (!part) {
      logError("seoPage", "part_knowledge missing for route", {
        slug: s,
        part_knowledge_id: mergedPkId,
      });
      return null;
    }

    const route = {
      ...routeRow,
      part_knowledge_id: part.id,
      h1: String(part?.name_vi ?? "").trim() || routeRow?.h1,
    };

    if (resolution?.mismatchWithDb) {
      logWarn("seoPage", "slug resolver overrode seo_routes.part_knowledge_id", {
        slug: s,
        ...resolution,
      });
    }

    const dyn = await loadProductBlocks(route);

    const skipStaleCache =
      resolution?.mismatchWithDb === true ||
      Number(routeRow.part_knowledge_id) !== Number(part.id);

    let cached = /** @type {Record<string, unknown> | null} */ (null);
    if (!skipStaleCache) {
      const [[row]] = await pool.query(`SELECT * FROM seo_page_cache WHERE route_id = ? LIMIT 1`, [
        route.id,
      ]);
      cached = row ?? null;
    }

    if (cached) {
      logInfo("seoPage", "seo_page_cache hit", {
        slug: s,
        route_id: route.id,
      });

      const faqStructured = faqFromCachedColumn(cached.faq_json);
      const payload = buildResponse({
        route,
        part,
        cached: true,
        title: cached.title ?? buildSeoPageTitle(route, part),
        meta_description:
          cached.meta_description ?? buildSeoMetaDescription(route, part),
        intro_html: cached.intro_html ?? "",
        article_html: cached.article_html ?? "",
        faq_json: cached.faq_json,
        faqStructured,
        dyn,
      });
      return payload;
    }

    const composed = await composeSeoHtmlFromPart(route, part);
    await upsertSeoPageCache(route.id, {
      title: composed.title,
      meta_description: composed.meta_description,
      intro_html: composed.intro_html,
      article_html: composed.article_html,
      faqStructured: composed.faqStructured,
    });

    logInfo("seoPage", "seo_page_cache miss — persisted fresh composer output", {
      slug: s,
      route_id: route.id,
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
    });
  } catch (e) {
    logError("seoPage", e?.message || String(e), {
      slug,
      stack: e?.stack,
    });
    throw e;
  }
}
