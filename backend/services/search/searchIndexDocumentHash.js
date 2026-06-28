/**
 * SEARCH-INDEX-SYNC-IMPLEMENT-01 + SEARCH-INDEX-COMPLETE-DOCUMENT-01
 */

import crypto from "crypto";
import { normalizeModelKey, normalizeYearKey } from "./searchIndexDocument.builder.js";

/**
 * @param {import('./searchIndexDocument.builder.js').SearchIndexDocument | Record<string, unknown>} doc
 */
export function computeDocumentHash(doc) {
  const parts = [
    String(doc.product_name ?? ""),
    String(doc.title ?? ""),
    String(doc.part_number ?? ""),
    String(doc.part_number_norm ?? ""),
    String(doc.search_keywords ?? ""),
    String(doc.search_text ?? ""),
    String(doc.search_tokens ?? ""),
    String(doc.normalized_tokens ?? ""),
    String(doc.synonym_tokens ?? ""),
    String(doc.category_name ?? ""),
    String(doc.category_slug ?? ""),
    String(doc.canonical_slug ?? ""),
    String(doc.canonical_path ?? ""),
    String(doc.canonical_url ?? ""),
    String(doc.thumbnail_url ?? ""),
    String(doc.search_priority ?? 0),
    String(doc.category_id ?? ""),
    String(doc.brand_name ?? ""),
    String(doc.brand_slug ?? ""),
    String(doc.model_name ?? ""),
    String(doc.model_slug ?? ""),
    String(doc.vehicle_label ?? ""),
    String(normalizeModelKey(doc.model_id)),
    String(normalizeYearKey(doc.year_from)),
    String(normalizeYearKey(doc.year_to)),
    String(doc.location_name ?? ""),
    String(doc.location_id ?? ""),
    String(doc.shop_name ?? ""),
    String(doc.price ?? ""),
    String(doc.stock_status ?? ""),
    String(doc.popularity_score ?? 0),
    String(doc.search_score ?? 0),
    String(doc.primary_brand_name ?? ""),
    String(doc.primary_model_name ?? ""),
    String(normalizeYearKey(doc.primary_year_from)),
    String(normalizeYearKey(doc.primary_year_to)),
    String(doc.status ?? ""),
  ];
  return crypto.createHash("sha256").update(parts.join("\x1f")).digest("hex");
}

/**
 * @param {import('./searchIndexDocument.builder.js').SearchIndexDocument[]} docs
 */
export function hashDocumentSet(docs) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const doc of docs) {
    const key = `${normalizeModelKey(doc.model_id)}:${normalizeYearKey(doc.year_from)}:${normalizeYearKey(doc.year_to)}`;
    map.set(key, computeDocumentHash(doc));
  }
  return map;
}
