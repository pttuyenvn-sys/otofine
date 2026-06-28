/** Shared display helpers for seller product dashboard (UI only). */

import { toThumb100 } from "@/lib/imageVariants";

export const FALLBACK_PRODUCT_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' fill='%23f3f4f6'/><text x='50%' y='52%' fill='%239ca3af' font-family='sans-serif' font-size='11' text-anchor='middle'>no image</text></svg>`,
  );

export function pickProductThumb(product) {
  const arr = Array.isArray(product?.images) ? product.images : [];
  const first = arr.find((i) => i && i.url) || arr[0];
  return toThumb100(first?.url);
}

export function stripProductHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function formatProductCarLine(product) {
  const car = stripProductHtml((product?.car || "").replace(/<br\/?>/gi, " · "));
  return car || product?.origin || "";
}

export function deriveOutOfStockFromStats(stats = {}) {
  const all = Number(stats.all) || 0;
  const published = Number(stats.published) || 0;
  const other =
    (Number(stats.pending_review) || 0) +
    (Number(stats.rejected) || 0) +
    (Number(stats.hidden) || 0) +
    (Number(stats.archived) || 0) +
    (Number(stats.deleted) || 0);
  return Math.max(0, all - published - other);
}

export function paginationRange(page, limit, total) {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return { from, to };
}
