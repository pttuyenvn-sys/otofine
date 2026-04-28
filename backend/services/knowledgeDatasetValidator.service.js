import {
  MASTER_DATASET_BRAND,
  MASTER_DATASET_LOCALE,
  MASTER_DATASET_VERSION,
  normalizeNameKey,
  slugifyPartName,
} from "./knowledgeDataset.service.js";

const REQUIRED_STRING_FIELDS = [
  "slug",
  "category_name",
  "english_name",
  "system_group",
  "seo_priority",
  "seo_tier",
  "style_persona_v2",
  "brand_persona_v3",
  "function_text",
  "structure_text",
  "operation_text",
  "symptoms_text",
  "replace_interval_text",
  "warnings_text",
  "buying_guide_text",
  "garage_notes_text",
  "buyer_mistakes_text",
  "vn_usage_notes_text",
  "faq_text",
];

const REQUIRED_ARRAY_FIELDS = [
  "aliases",
  "buyer_intents_v4",
  "compatible_vehicle_types",
  "keywords",
  "cross_sell",
  "upsell",
];

const SCORE_FIELDS = [
  "demand_score",
  "competition_score",
  "profit_score",
  "content_seed_score",
];

function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ""));
}

function pushError(errors, index, slug, field, message, severity = "error") {
  errors.push({ index, slug, field, message, severity });
}

export function validateKnowledgeDataset(dataset) {
  const errors = [];
  const warnings = [];

  if (!dataset || typeof dataset !== "object") {
    return {
      ok: false,
      errors: [{ index: null, slug: null, field: "dataset", message: "Dataset phải là object", severity: "error" }],
      warnings,
      summary: { total_rows: 0, error_count: 1, warning_count: 0 },
    };
  }

  if (dataset.version !== MASTER_DATASET_VERSION) {
    warnings.push({
      index: null,
      slug: null,
      field: "version",
      message: `Version không phải ${MASTER_DATASET_VERSION}`,
      severity: "warning",
    });
  }

  if (dataset.brand !== MASTER_DATASET_BRAND) {
    warnings.push({
      index: null,
      slug: null,
      field: "brand",
      message: `Brand không phải ${MASTER_DATASET_BRAND}`,
      severity: "warning",
    });
  }

  if (dataset.locale !== MASTER_DATASET_LOCALE) {
    warnings.push({
      index: null,
      slug: null,
      field: "locale",
      message: `Locale không phải ${MASTER_DATASET_LOCALE}`,
      severity: "warning",
    });
  }

  if (!Array.isArray(dataset.rows)) {
    pushError(errors, null, null, "rows", "Dataset thiếu mảng rows");
    return {
      ok: false,
      errors,
      warnings,
      summary: { total_rows: 0, error_count: errors.length, warning_count: warnings.length },
    };
  }

  const seenSlugs = new Map();
  const seenNames = new Map();

  if (dataset.rows.length === 0) {
    pushError(errors, null, null, "rows", "Dataset không có row nào");
  }

  dataset.rows.forEach((row, index) => {
    const slug = row?.slug;
    if (!row || typeof row !== "object") {
      pushError(errors, index, null, "row", "Row không phải object");
      return;
    }

    for (const field of REQUIRED_STRING_FIELDS) {
      const value = row[field];
      if (value == null || String(value).trim() === "") {
        pushError(errors, index, slug, field, "Thiếu field bắt buộc");
      }
    }

    for (const field of REQUIRED_ARRAY_FIELDS) {
      if (!Array.isArray(row[field])) {
        pushError(errors, index, slug, field, "Field phải là array");
      } else if (row[field].length === 0) {
        pushError(errors, index, slug, field, "Array không được rỗng");
      } else if (row[field].some((value) => String(value || "").trim() === "")) {
        pushError(errors, index, slug, field, "Array không được chứa giá trị rỗng");
      }
    }

    if (!isValidSlug(slug)) {
      pushError(errors, index, slug, "slug", "Slug sai format");
    }

    if (row.category_name && slug && slugifyPartName(row.category_name) !== slug) {
      warnings.push({
        index,
        slug,
        field: "slug",
        message: "Slug không khớp hoàn toàn với category_name; có thể là alias hoặc tên rút gọn",
        severity: "warning",
      });
    }

    if (!/^(A1|A2|B|C)$/.test(String(row.seo_tier || ""))) {
      pushError(errors, index, slug, "seo_tier", "seo_tier phải là A1, A2, B hoặc C");
    }

    const priorityByTier = { A1: 95, A2: 82, B: 60, C: 35 };
    if (Number(row.seo_priority) !== priorityByTier[row.seo_tier]) {
      pushError(errors, index, slug, "seo_priority", "seo_priority phải khớp seo_tier: A1=95, A2=82, B=60, C=35");
    }

    if (!["LOW", "MEDIUM", "HIGH"].includes(String(row.failure_level || ""))) {
      pushError(errors, index, slug, "failure_level", "failure_level phải là LOW, MEDIUM hoặc HIGH");
    }

    for (const field of SCORE_FIELDS) {
      const n = Number(row[field]);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        pushError(errors, index, slug, field, "Score phải nằm trong khoảng 0-100");
      }
    }

    for (const field of REQUIRED_STRING_FIELDS.filter((f) => f.endsWith("_text"))) {
      if (String(row[field] || "").trim().length < 24) {
        pushError(errors, index, slug, field, "Text quá ngắn");
      }
    }

    const faqParts = String(row.faq_text || "")
      .split("||")
      .map((x) => x.trim())
      .filter(Boolean);
    if (faqParts.length !== 2) {
      pushError(errors, index, slug, "faq_text", "faq_text phải có đúng 2 câu hỏi, ngăn bằng ||");
    }

    if (seenSlugs.has(slug)) {
      pushError(errors, index, slug, "slug", `Trùng slug với row ${seenSlugs.get(slug)}`);
    } else {
      seenSlugs.set(slug, index);
    }

    const nameKey = normalizeNameKey(row.category_name);
    if (nameKey && seenNames.has(nameKey)) {
      warnings.push({
        index,
        slug,
        field: "category_name",
        message: `Tên gần/trùng với row ${seenNames.get(nameKey)}`,
        severity: "warning",
      });
    } else if (nameKey) {
      seenNames.set(nameKey, index);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      total_rows: dataset.rows.length,
      error_count: errors.length,
      warning_count: warnings.length,
    },
  };
}
