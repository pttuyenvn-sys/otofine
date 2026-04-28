/**
 * Product card "middle block": up to 3 compact rows, no repeat of product title.
 * Priority: compatibility → mã + Loại hàng (mapped) → type (partName) → xuất xứ → trust.
 */

import { classifyOriginForCard } from "./loaiHangDisplay.js";

const MAX_R1 = 80;
const MAX_R2 = 98;
const MAX_R3 = 102;

const NEW_DAYS = 10;

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s, max) {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function stripHtmlish(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isProductNew(updatedAt) {
  if (updatedAt == null) return false;
  const d = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < NEW_DAYS * 864e5;
}

/**
 * @param {{
 *   productTitle?: string,
 *   partNumber?: string,
 *   partName?: string,
 *   origin?: string,
 *   provinceName?: string,
 *   shopName?: string,
 *   compatibilityLine?: string | null,
 *   stock?: number | string | null,
 *   updatedAt?: string | Date | null,
 * }} p
 * @returns {{
 *   cardHighlights: string[],
 *   summary: string,
 *   subtitleLine1: string,
 *   subtitleLine2: string,
 * }}
 */
export function buildProductCardHighlights({
  productTitle = "",
  partNumber = "",
  partName = "",
  origin = "",
  provinceName = "",
  shopName = "",
  compatibilityLine = "",
  stock = null,
  updatedAt = null,
} = {}) {
  const title = stripHtmlish(productTitle);
  const nt = title ? norm(title) : "";
  const pn = stripHtmlish(partNumber);
  const pnInTitle =
    pn && title && title.toLowerCase().includes(pn.toLowerCase());

  const typeRaw = stripHtmlish(partName);
  const tpn = typeRaw ? norm(typeRaw) : "";
  const typeRedundant =
    tpn && nt && (tpn === nt || (tpn.length >= 4 && nt.includes(tpn)));
  const typeLabel = tpn && !typeRedundant ? clip(typeRaw, 36) : "";

  let compat = String(compatibilityLine || "")
    .replace(/\s+/g, " ")
    .trim();
  if (compat && nt) {
    const nc = norm(compat);
    if (nc === nt) compat = "";
    else if (nt.includes(nc) && nc.length >= 10) compat = "";
  }

  const originStr = stripHtmlish(origin);
  const { loaiHangLabel, geoLabel } = classifyOriginForCard(originStr);
  const geoForRow = geoLabel ? clip(geoLabel, 28) : "";

  /** Priority: mã + Loại hàng (mapped) → partName (type) → địa lý (max 2 on row 2; overflow…). */
  const slots = [];
  if (pn && !pnInTitle) {
    if (loaiHangLabel) {
      slots.push(`🔩 ${pn} • 🏷 Loại hàng: ${loaiHangLabel}`);
    } else {
      slots.push(`🔩 ${pn}`);
    }
  } else if (loaiHangLabel) {
    slots.push(`🏷 Loại hàng: ${loaiHangLabel}`);
  }
  if (typeLabel) {
    slots.push(`🏷 ${typeLabel}`);
  }
  if (geoForRow) {
    slots.push(`🌍 ${geoForRow}`);
  }

  let row1 = "";
  let row2 = "";
  let row3InfoLead = "";

  if (compat) {
    row1 = clip(compat, MAX_R1);
    if (slots.length === 0) {
      row2 = "";
    } else if (slots.length <= 2) {
      row2 = clip(slots.join(" • "), MAX_R2);
    } else {
      row2 = clip(`${slots[0]} • ${slots[1]}`, MAX_R2);
      row3InfoLead = slots[2];
    }
  } else {
    if (slots.length === 0) {
      row1 = "";
      row2 = "";
    } else if (slots.length === 1) {
      row1 = clip(slots[0], MAX_R1);
    } else if (slots.length === 2) {
      row1 = clip(slots[0], MAX_R1);
      row2 = clip(slots[1], MAX_R2);
    } else {
      row1 = clip(slots[0], MAX_R1);
      row2 = clip(slots[1], MAX_R2);
      row3InfoLead = slots[2];
    }
  }

  const sn = clip(stripHtmlish(shopName), 32);
  const prov = clip(stripHtmlish(provinceName), 24);
  const n = stock != null && stock !== "" ? Number(stock) : null;
  const stockTag =
    Number.isFinite(n) && n > 0
      ? "✅ Còn hàng"
      : Number.isFinite(n) && n === 0
        ? "⚠️ Hết hàng"
        : "";
  const newTag = isProductNew(updatedAt) ? "🆕 Mới" : "";

  const row3Parts = [];
  if (sn) {
    row3Parts.push(`👤 ${sn} ✓`);
  } else {
    row3Parts.push("👤 Shop xác minh");
  }
  if (prov) {
    row3Parts.push(`📍 ${prov}`);
  }
  if (newTag) {
    row3Parts.push(newTag);
  }
  if (stockTag) {
    row3Parts.push(stockTag);
  }

  const row3Body = [row3InfoLead, ...row3Parts].filter(Boolean);
  const row3 = clip(row3Body.join(" • "), MAX_R3);

  const cardHighlights = [row1, row2, row3].filter(Boolean).slice(0, 3);
  const summary = cardHighlights.join("\n");

  return {
    cardHighlights,
    summary,
    subtitleLine1: row1,
    subtitleLine2: row2,
  };
}

/**
 * @deprecated use buildProductCardHighlights — kept name for short migration
 */
export const buildProductCardSubtitle = buildProductCardHighlights;
