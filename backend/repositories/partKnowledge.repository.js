import sql from "mssql";
import { pool as mysqlPool, getDbEngine } from "../config/db.js";
import { getMssqlPool } from "../config/mssqlPool.js";

const TEXT_COLUMNS = [
  "function_text",
  "structure_text",
  "operation_text",
  "symptoms_text",
  "common_causes_text",
  "replace_interval_text",
  "warnings_text",
  "buying_guide_text",
  "faq_text",
  "garage_notes_text",
  "buyer_mistakes_text",
  "vn_usage_notes_text",
];

const WRITABLE_COLUMNS = [
  "slug",
  "name_vi",
  "name_en",
  "canonical_name",
  "aliases_json",
  "regional_aliases_json",
  "summary",
  "body",
  "category_tag",
  "category_name",
  "system_group",
  "vehicle_area",
  "seo_priority",
  "seo_tier",
  "tier_class",
  "ai_priority",
  "search_score",
  "diagnosis_weight",
  "is_active",
  ...TEXT_COLUMNS,
  "style_persona_v2",
  "brand_persona_v3",
  "buyer_intents_v4",
  "symptom_keywords_json",
  "search_intents_json",
  "cross_sell_json",
];

let mysqlColumnSet = null;

async function getMysqlColumnSet() {
  if (mysqlColumnSet) return mysqlColumnSet;
  const [rows] = await mysqlPool.query(`
    SELECT COLUMN_NAME AS name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'part_knowledge'
  `);
  mysqlColumnSet = new Set(rows.map((row) => row.name));
  return mysqlColumnSet;
}

/*
 * MIGRATION SUGGESTION:
 * If canonical_name column is missing from part_knowledge table, run:
 *
 * ALTER TABLE part_knowledge
 * ADD COLUMN canonical_name VARCHAR(512) NULL
 * AFTER name_en;
 *
 * Then add FULLTEXT index:
 * ALTER TABLE part_knowledge
 * ADD FULLTEXT INDEX ft_canonical_name (canonical_name, name_vi, name_en, summary, body);
 *
 * This improves search relevance by matching against canonical part names.
 */

async function getWritableColumnsForCurrentMysqlSchema() {
  const columns = await getMysqlColumnSet();
  return WRITABLE_COLUMNS.filter((column) => columns.has(column));
}

function parseBuyerIntents(raw) {
  if (raw == null || raw === "") return null;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function serializeBuyerIntents(value) {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return JSON.stringify(value.map((item) => String(item).trim()).filter(Boolean));
}

function serializeJsonArray(value) {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out = value.map((item) => String(item).trim()).filter(Boolean);
  return out.length ? JSON.stringify(out) : null;
}

function toDbRow(input = {}) {
  const categoryName = input.categoryName ?? input.category_name ?? null;
  const nameVi = input.nameVi ?? input.name_vi ?? categoryName;
  const nameEn = input.nameEn ?? input.name_en ?? input.english_name ?? null;
  const canonicalName =
    input.canonicalName ?? input.canonical_name ?? nameVi ?? categoryName;
  return {
    slug: String(input.slug ?? "").trim().toLowerCase(),
    name_vi: nameVi != null ? String(nameVi).trim() || null : null,
    name_en: nameEn != null ? String(nameEn).trim() || null : null,
    canonical_name:
      canonicalName != null ? String(canonicalName).trim() || null : null,
    aliases_json: serializeJsonArray(input.aliases ?? input.aliases_json),
    regional_aliases_json: serializeJsonArray(
      input.regionalAliases ?? input.regional_aliases_json,
    ),
    summary: input.summary ?? null,
    body: input.body ?? null,
    category_tag: String(input.categoryTag ?? input.category_tag ?? "").trim(),
    category_name: categoryName != null ? String(categoryName).trim() || null : null,
    system_group: input.systemGroup ?? input.system_group ?? null,
    vehicle_area: input.vehicleArea ?? input.vehicle_area ?? null,
    seo_priority:
      input.seoPriority != null || input.seo_priority != null
        ? String(input.seoPriority ?? input.seo_priority).trim().slice(0, 10) || null
        : null,
    seo_tier: input.seoTier ?? input.seo_tier ?? null,
    tier_class: input.tierClass ?? input.tier_class ?? null,
    ai_priority: input.aiPriority ?? input.ai_priority ?? 50,
    search_score: input.searchScore ?? input.search_score ?? 50,
    diagnosis_weight: input.diagnosisWeight ?? input.diagnosis_weight ?? 50,
    is_active: input.isActive ?? input.is_active ?? input.isPublished ?? input.is_published ?? 1,
    function_text: input.functionText ?? input.function_text ?? null,
    structure_text: input.structureText ?? input.structure_text ?? null,
    operation_text: input.operationText ?? input.operation_text ?? null,
    symptoms_text: input.symptomsText ?? input.symptoms_text ?? null,
    common_causes_text: input.commonCausesText ?? input.common_causes_text ?? null,
    replace_interval_text:
      input.replaceIntervalText ?? input.replace_interval_text ?? null,
    warnings_text: input.warningsText ?? input.warnings_text ?? null,
    buying_guide_text: input.buyingGuideText ?? input.buying_guide_text ?? null,
    faq_text: input.faqText ?? input.faq_text ?? null,
    style_persona_v2: input.stylePersonaV2 ?? input.style_persona_v2 ?? null,
    brand_persona_v3: input.brandPersonaV3 ?? input.brand_persona_v3 ?? null,
    buyer_intents_v4: serializeBuyerIntents(
      input.buyerIntentsV4 ?? input.buyer_intents_v4,
    ),
    symptom_keywords_json: serializeJsonArray(
      input.symptomKeywords ?? input.symptom_keywords_json,
    ),
    search_intents_json: serializeJsonArray(
      input.searchIntents ?? input.search_intents_json,
    ),
    cross_sell_json: serializeJsonArray(input.crossSell ?? input.cross_sell_json),
    garage_notes_text: input.garageNotesText ?? input.garage_notes_text ?? null,
    buyer_mistakes_text:
      input.buyerMistakesText ?? input.buyer_mistakes_text ?? null,
    vn_usage_notes_text: input.vnUsageNotesText ?? input.vn_usage_notes_text ?? null,
  };
}

function toApiRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    nameVi: row.name_vi,
    nameEn: row.name_en,
    canonicalName: row.canonical_name ?? null, // Safe fallback if column missing
    aliasesJson: row.aliases_json,
    regionalAliasesJson: row.regional_aliases_json,
    summary: row.summary,
    body: row.body,
    categoryTag: row.category_tag,
    categoryName: row.category_name,
    systemGroup: row.system_group,
    vehicleArea: row.vehicle_area,
    seoPriority: row.seo_priority,
    seoTier: row.seo_tier,
    tierClass: row.tier_class,
    aiPriority: row.ai_priority,
    searchScore: row.search_score,
    diagnosisWeight: row.diagnosis_weight,
    isActive: Boolean(row.is_active),
    functionText: row.function_text,
    structureText: row.structure_text,
    operationText: row.operation_text,
    symptomsText: row.symptoms_text,
    commonCausesText: row.common_causes_text,
    replaceIntervalText: row.replace_interval_text,
    warningsText: row.warnings_text,
    buyingGuideText: row.buying_guide_text,
    faqText: row.faq_text,
    stylePersonaV2: row.style_persona_v2,
    brandPersonaV3: row.brand_persona_v3,
    buyerIntentsV4: parseBuyerIntents(row.buyer_intents_v4),
    symptomKeywordsJson: row.symptom_keywords_json,
    searchIntentsJson: row.search_intents_json,
    crossSellJson: row.cross_sell_json,
    garageNotesText: row.garage_notes_text,
    buyerMistakesText: row.buyer_mistakes_text,
    vnUsageNotesText: row.vn_usage_notes_text,
    sortOrder: row.ai_priority,
    isPublished: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clampPagination(page, limit) {
  const p = Math.max(1, Math.trunc(Number(page) || 1));
  const l = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 50)));
  return { page: p, limit: l, offset: (p - 1) * l };
}

function bindMssqlRow(request, row) {
  request.input("slug", sql.NVarChar(191), row.slug);
  request.input("name_vi", sql.NVarChar(512), row.name_vi);
  request.input("name_en", sql.NVarChar(512), row.name_en);
  request.input("canonical_name", sql.NVarChar(512), row.canonical_name);
  request.input(
    "regional_aliases_json",
    sql.NVarChar(sql.MAX),
    row.regional_aliases_json,
  );
  request.input("category_tag", sql.NVarChar(128), row.category_tag);
  request.input("category_name", sql.NVarChar(255), row.category_name);
  request.input("system_group", sql.NVarChar(128), row.system_group);
  request.input("vehicle_area", sql.NVarChar(128), row.vehicle_area);
  request.input("seo_priority", sql.NVarChar(10), row.seo_priority);
  request.input("seo_tier", sql.NVarChar(10), row.seo_tier);
  request.input("tier_class", sql.NVarChar(10), row.tier_class);
  request.input("ai_priority", sql.Int, row.ai_priority);
  request.input("search_score", sql.Int, row.search_score);
  request.input("diagnosis_weight", sql.Int, row.diagnosis_weight);
  request.input("is_active", sql.Bit, row.is_active ? 1 : 0);
  request.input("aliases_json", sql.NVarChar(sql.MAX), row.aliases_json);
  request.input("summary", sql.NVarChar(sql.MAX), row.summary);
  request.input("body", sql.NVarChar(sql.MAX), row.body);
  for (const column of TEXT_COLUMNS) {
    request.input(column, sql.NVarChar(sql.MAX), row[column]);
  }
  request.input("style_persona_v2", sql.NVarChar(64), row.style_persona_v2);
  request.input("brand_persona_v3", sql.NVarChar(64), row.brand_persona_v3);
  request.input("buyer_intents_v4", sql.NVarChar(sql.MAX), row.buyer_intents_v4);
  request.input(
    "symptom_keywords_json",
    sql.NVarChar(sql.MAX),
    row.symptom_keywords_json,
  );
  request.input("search_intents_json", sql.NVarChar(sql.MAX), row.search_intents_json);
  request.input("cross_sell_json", sql.NVarChar(sql.MAX), row.cross_sell_json);
  return request;
}

async function listPartKnowledgeMysql({ page, limit, q } = {}) {
  const paging = clampPagination(page, limit);
  const qTrim = q ? String(q).trim() : "";

  if (!qTrim) {
    const [[countRow]] = await mysqlPool.query(
      `SELECT COUNT(*) AS total FROM part_knowledge WHERE 1=1`,
    );
    const [rows] = await mysqlPool.query(
      `SELECT * FROM part_knowledge WHERE 1=1 ORDER BY ai_priority DESC, id DESC LIMIT ? OFFSET ?`,
      [paging.limit, paging.offset],
    );
    return {
      rows: rows.map(toApiRow),
      page: paging.page,
      limit: paging.limit,
      total: Number(countRow.total) || 0,
    };
  }

  // --- Phase 1: LIKE search (slug, name_vi, name_en, category_name, aliases_json) ---
  const like = `%${qTrim}%`;
  const likeWhere = "WHERE (slug LIKE ? OR name_vi LIKE ? OR name_en LIKE ? OR category_name LIKE ? OR aliases_json LIKE ?)";
  const likeParams = [like, like, like, like, like];

  const [likeRows] = await mysqlPool.query(
    `SELECT *,
       CASE
         WHEN slug = ? THEN 1
         WHEN name_vi = ? THEN 2
         WHEN aliases_json LIKE ? THEN 3
         ELSE 4
       END AS _rank
     FROM part_knowledge
     ${likeWhere}
     ORDER BY _rank ASC, ai_priority DESC, id DESC
     LIMIT ?`,
    [qTrim, qTrim, like, ...likeParams, 20],
  );

  console.log("[PART SEARCH] q:", qTrim, "| like rows:", likeRows.length);

  if (likeRows.length > 0) {
    return {
      rows: likeRows.map(toApiRow),
      page: paging.page,
      limit: 20,
      total: likeRows.length,
    };
  }

  // --- Phase 2: FULLTEXT fallback ---
  const ftTerms = qTrim
    .split(/[\s\-]+/)
    .filter((t) => t.length >= 2)
    .map((t) => `+${t}*`)
    .join(" ");

  let ftRows = [];
  if (ftTerms) {
    // Detect if canonical_name column exists
    const columnSet = await getMysqlColumnSet();
    const hasCanonicalName = columnSet.has("canonical_name");

    // Use MATCH with available columns only
    const matchColumns = hasCanonicalName
      ? "canonical_name, name_vi, name_en, summary, body"
      : "name_vi, name_en, summary, body";

    try {
      [ftRows] = await mysqlPool.query(
        `SELECT *, MATCH(${matchColumns}) AGAINST(? IN BOOLEAN MODE) AS _rel
         FROM part_knowledge
         WHERE MATCH(${matchColumns}) AGAINST(? IN BOOLEAN MODE)
         ORDER BY _rel DESC, ai_priority DESC, id DESC
         LIMIT ?`,
        [ftTerms, ftTerms, 20],
      );
    } catch (err) {
      // If FULLTEXT fails, log and return empty results instead of crashing
      console.error("[PART SEARCH] FULLTEXT query failed:", err.message);
      ftRows = [];
    }
  }

  console.log("[PART SEARCH] q:", qTrim, "| fulltext rows:", ftRows.length, "| terms:", ftTerms);

  return {
    rows: ftRows.map(toApiRow),
    page: paging.page,
    limit: 20,
    total: ftRows.length,
  };
}

async function listPartKnowledgeMssql({ page, limit, q } = {}) {
  const paging = clampPagination(page, limit);
  const request = (await getMssqlPool()).request();
  let where = "WHERE 1=1";
  if (q) {
    where +=
      " AND (slug LIKE @q OR name_vi LIKE @q OR name_en LIKE @q OR category_name LIKE @q)";
    request.input("q", sql.NVarChar(512), `%${String(q).trim()}%`);
  }
  request.input("offset", sql.Int, paging.offset);
  request.input("limit", sql.Int, paging.limit);
  const result = await request.query(`
    SELECT COUNT(*) OVER() AS __total, *
    FROM dbo.part_knowledge
    ${where}
    ORDER BY ai_priority DESC, id DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);
  const rows = result.recordset || [];
  return {
    rows: rows.map(toApiRow),
    page: paging.page,
    limit: paging.limit,
    total: rows.length ? Number(rows[0].__total) || 0 : 0,
  };
}

export async function listPartKnowledge(opts = {}) {
  return getDbEngine() === "mssql"
    ? listPartKnowledgeMssql(opts)
    : listPartKnowledgeMysql(opts);
}

export async function getPartKnowledgeById(id) {
  if (getDbEngine() === "mssql") {
    const result = await (await getMssqlPool())
      .request()
      .input("id", sql.BigInt, id)
      .query("SELECT * FROM dbo.part_knowledge WHERE id = @id");
    return toApiRow(result.recordset?.[0]);
  }
  const [rows] = await mysqlPool.query("SELECT * FROM part_knowledge WHERE id = ?", [
    id,
  ]);
  return toApiRow(rows[0]);
}

export async function getPartKnowledgeBySlug(slug) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (getDbEngine() === "mssql") {
    const result = await (await getMssqlPool())
      .request()
      .input("slug", sql.NVarChar(191), normalized)
      .query("SELECT * FROM dbo.part_knowledge WHERE slug = @slug");
    return toApiRow(result.recordset?.[0]);
  }
  const [rows] = await mysqlPool.query(
    "SELECT * FROM part_knowledge WHERE slug = ?",
    [normalized],
  );
  return toApiRow(rows[0]);
}

export async function createPartKnowledge(input) {
  const row = toDbRow(input);
  if (getDbEngine() === "mssql") {
    const columns = WRITABLE_COLUMNS.join(", ");
    const values = WRITABLE_COLUMNS.map((column) => `@${column}`).join(", ");
    const request = bindMssqlRow((await getMssqlPool()).request(), row);
    const result = await request.query(`
      INSERT INTO dbo.part_knowledge (${columns})
      OUTPUT INSERTED.*
      VALUES (${values})
    `);
    return toApiRow(result.recordset?.[0]);
  }

  const columns = await getWritableColumnsForCurrentMysqlSchema();
  const values = columns.map((column) => row[column]);
  const placeholders = columns.map(() => "?").join(", ");
  const [result] = await mysqlPool.query(
    `INSERT INTO part_knowledge (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );
  return getPartKnowledgeById(result.insertId);
}

export async function updatePartKnowledge(id, input) {
  const row = toDbRow(input);
  if (getDbEngine() === "mssql") {
    const setSql = WRITABLE_COLUMNS.map((column) => `${column} = @${column}`).join(
      ", ",
    );
    const request = bindMssqlRow((await getMssqlPool()).request(), row);
    request.input("id", sql.BigInt, id);
    await request.query(`
      UPDATE dbo.part_knowledge
      SET ${setSql}, updated_at = SYSDATETIME()
      WHERE id = @id
    `);
    return getPartKnowledgeById(id);
  }

  const columns = await getWritableColumnsForCurrentMysqlSchema();
  const setSql = columns.map((column) => `${column} = ?`).join(", ");
  await mysqlPool.query(
    `UPDATE part_knowledge SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...columns.map((column) => row[column]), id],
  );
  return getPartKnowledgeById(id);
}

export async function deletePartKnowledge(id) {
  if (getDbEngine() === "mssql") {
    await (await getMssqlPool())
      .request()
      .input("id", sql.BigInt, id)
      .query("DELETE FROM dbo.part_knowledge WHERE id = @id");
    return;
  }
  await mysqlPool.query("DELETE FROM part_knowledge WHERE id = ?", [id]);
}

async function upsertBatch1OneMysql(input) {
  const row = toDbRow({ ...input, isActive: 1 });
  const columns = await getWritableColumnsForCurrentMysqlSchema();
  const values = columns.map((column) => row[column]);
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns.filter(
    (column) => column !== "slug" && column !== "is_active",
  )
    .map((column) => `${column} = VALUES(${column})`)
    .join(", ");
  const [result] = await mysqlPool.query(
    `
    INSERT INTO part_knowledge (${columns.join(", ")})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE
      ${updates},
      is_active = 1,
      updated_at = CURRENT_TIMESTAMP
    `,
    values,
  );
  return result.affectedRows === 1 ? "inserted" : "updated";
}

async function upsertBatch1OneMssql(input) {
  const row = toDbRow({ ...input, isActive: 1 });
  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const updateRequest = bindMssqlRow(new sql.Request(transaction), row);
    const updateResult = await updateRequest.query(`
      UPDATE dbo.part_knowledge
      SET
        name_vi = @name_vi,
        name_en = @name_en,
        canonical_name = @canonical_name,
        regional_aliases_json = @regional_aliases_json,
        category_tag = @category_tag,
        category_name = @category_name,
        system_group = @system_group,
        vehicle_area = @vehicle_area,
        seo_priority = @seo_priority,
        seo_tier = @seo_tier,
        tier_class = @tier_class,
        ai_priority = @ai_priority,
        search_score = @search_score,
        diagnosis_weight = @diagnosis_weight,
        aliases_json = @aliases_json,
        summary = @summary,
        body = @body,
        function_text = @function_text,
        structure_text = @structure_text,
        operation_text = @operation_text,
        symptoms_text = @symptoms_text,
        common_causes_text = @common_causes_text,
        replace_interval_text = @replace_interval_text,
        warnings_text = @warnings_text,
        buying_guide_text = @buying_guide_text,
        faq_text = @faq_text,
        style_persona_v2 = @style_persona_v2,
        brand_persona_v3 = @brand_persona_v3,
        buyer_intents_v4 = @buyer_intents_v4,
        symptom_keywords_json = @symptom_keywords_json,
        search_intents_json = @search_intents_json,
        cross_sell_json = @cross_sell_json,
        garage_notes_text = @garage_notes_text,
        buyer_mistakes_text = @buyer_mistakes_text,
        vn_usage_notes_text = @vn_usage_notes_text,
        is_active = 1,
        updated_at = SYSDATETIME()
      WHERE slug = @slug
    `);

    if ((updateResult.rowsAffected?.[0] || 0) > 0) {
      await transaction.commit();
      return "updated";
    }

    const columns = WRITABLE_COLUMNS.join(", ");
    const values = WRITABLE_COLUMNS.map((column) => `@${column}`).join(", ");
    const insertRequest = bindMssqlRow(new sql.Request(transaction), row);
    await insertRequest.query(`
      INSERT INTO dbo.part_knowledge (${columns})
      VALUES (${values})
    `);
    await transaction.commit();
    return "inserted";
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

export async function upsertPartKnowledgeBatch1Rows(rows) {
  const summary = { inserted: 0, updated: 0, imported: 0 };
  const upsert =
    getDbEngine() === "mssql" ? upsertBatch1OneMssql : upsertBatch1OneMysql;

  for (const row of rows) {
    const action = await upsert(row);
    if (action === "inserted") summary.inserted += 1;
    else summary.updated += 1;
    summary.imported += 1;
  }

  return summary;
}
