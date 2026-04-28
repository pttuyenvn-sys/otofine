import Typesense from "typesense";

const COLLECTION =
  process.env.TYPESENSE_KNOWLEDGE_COLLECTION || "otofine_part_knowledge";

export function isKnowledgeTypesenseConfigured() {
  return Boolean(process.env.TYPESENSE_HOST && process.env.TYPESENSE_API_KEY);
}

export function getKnowledgeCollectionName() {
  return COLLECTION;
}

export function getKnowledgeCollectionSchema() {
  return {
    name: COLLECTION,
    enable_nested_fields: false,
    fields: [
      { name: "id", type: "string" },
      { name: "slug", type: "string" },
      { name: "category_name", type: "string", locale: "vi" },
      { name: "english_name", type: "string", optional: true },
      { name: "system_group", type: "string", facet: true },
      { name: "vehicle_area", type: "string", facet: true, optional: true },
      { name: "seo_priority", type: "string", facet: true },
      { name: "failure_level", type: "string", facet: true },
      { name: "search_blob", type: "string", locale: "vi" },
      { name: "demand_score", type: "int32" },
      { name: "content_seed_score", type: "int32" },
      { name: "updated_at", type: "int64" },
    ],
    default_sorting_field: "content_seed_score",
  };
}

export function buildKnowledgeTypesenseClient() {
  return new Typesense.Client({
    nodes: [
      {
        host: process.env.TYPESENSE_HOST,
        port: process.env.TYPESENSE_PORT || "8108",
        protocol: process.env.TYPESENSE_PROTOCOL || "http",
      },
    ],
    apiKey: process.env.TYPESENSE_API_KEY,
    connectionTimeoutSeconds: 30,
  });
}

export async function ensureKnowledgeCollection(client) {
  try {
    await client.collections().create(getKnowledgeCollectionSchema());
    return { created: true };
  } catch (e) {
    if (String(e.message || "").includes("already exists") || e.httpStatus === 409) {
      return { created: false };
    }
    throw e;
  }
}

export function rowToKnowledgeDocument(row) {
  const searchParts = [
    row.category_name,
    row.english_name,
    ...(row.aliases || []),
    row.system_group,
    row.sub_group,
    row.function_text,
    row.symptoms_text,
    row.buying_guide_text,
    ...(row.keywords || []),
  ];
  return {
    id: row.slug,
    slug: row.slug,
    category_name: row.category_name,
    english_name: row.english_name || "",
    system_group: row.system_group || "",
    vehicle_area: row.vehicle_area || "",
    seo_priority: row.seo_priority || "C",
    failure_level: row.failure_level || "MEDIUM",
    search_blob: searchParts.filter(Boolean).join(" "),
    demand_score: Math.trunc(Number(row.demand_score) || 0),
    content_seed_score: Math.trunc(Number(row.content_seed_score) || 0),
    updated_at: Date.now(),
  };
}
