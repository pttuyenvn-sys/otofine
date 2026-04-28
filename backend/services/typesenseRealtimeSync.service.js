import {
  getTypesenseClient,
  getTypesenseCollectionName,
  isTypesenseConfigured,
} from "./productSearch.service.js";
import {
  loadProductRowForTypesense,
  rowToTypesenseDocument,
} from "./typesenseProductDocument.service.js";

/**
 * Đồng bộ 1 document sau create/update (fire-and-forget an toàn).
 */
export async function upsertProductInTypesense(productId) {
  if (!isTypesenseConfigured()) return;
  try {
    const client = getTypesenseClient();
    const row = await loadProductRowForTypesense(productId);
    if (!row) {
      await deleteProductFromTypesense(productId);
      return;
    }
    const doc = rowToTypesenseDocument(row);
    await client.collections(getTypesenseCollectionName()).documents().upsert(doc);
  } catch (e) {
    console.warn("[typesenseRealtime] upsert", productId, e.message);
  }
}

export function queueUpsertProductInTypesense(productId) {
  void upsertProductInTypesense(productId).catch(() => {});
}

export async function deleteProductFromTypesense(productId) {
  if (!isTypesenseConfigured()) return;
  try {
    const client = getTypesenseClient();
    await client
      .collections(getTypesenseCollectionName())
      .documents(String(productId))
      .delete();
  } catch (e) {
    if (e.httpStatus !== 404) {
      console.warn("[typesenseRealtime] delete", productId, e.message);
    }
  }
}

export function queueDeleteProductFromTypesense(productId) {
  void deleteProductFromTypesense(productId).catch(() => {});
}
