/**
 * RFQ R2 object key builders (category / date partitioned).
 */
import { buildR2Key } from "../../../services/rfqR2Upload.service.js";

/** @typedef {'request' | 'chat' | 'quote'} RfqR2Category */

function cryptoRandom() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {RfqR2Category} category
 * @param {string} filename
 */
export function buildRfqR2ObjectKey(category, filename) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeName = String(filename || `${cryptoRandom()}.jpg`)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
  const subdir = `${category}/${year}/${month}`;
  return buildR2Key(safeName, { subdir });
}
