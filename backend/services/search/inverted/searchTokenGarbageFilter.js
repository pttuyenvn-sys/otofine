/**
 * SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01 — garbage token classification.
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";

const CSS_UNIT = /^\d+(?:\.\d+)?(?:pt|px|em|rem|%)$/i;
const HTML_ENTITY = /^&(?:[a-z]+|#\d+|#x[0-9a-f]+);$/i;
const PHONE_VN = /^(?:\+?84|0)\d{8,10}$/;
const TRACKING = /^(?:utm_|fbclid|gclid|ref_)/i;
const FONT_NAMES = new Set([
  "arial", "helvetica", "times", "roboto", "sans", "serif", "monospace",
  "zalo", "facebook", "instagram",
]);

/**
 * @typedef {{ token: string, reason: string }} GarbageHit
 */

/**
 * @param {string} raw
 * @param {{ allowNumeric?: boolean, allowYear?: boolean }} [opts]
 * @returns {GarbageHit | null}
 */
export function classifyGarbageToken(raw, opts = {}) {
  const original = String(raw || "").trim();
  if (!original) return { token: original, reason: "empty" };

  const token = foldVi(original);
  if (token.length < 2) return { token: original, reason: "single_character" };
  if (token.length > 64) return { token: original, reason: "excessive_length" };

  if (HTML_ENTITY.test(original) || /[<>]/.test(original)) {
    return { token: original, reason: "html_fragment" };
  }
  if (CSS_UNIT.test(original) || CSS_UNIT.test(token)) {
    return { token: original, reason: "css_font_size" };
  }
  if (/^(?:rgb|rgba|hsl|#)[\d(,.)a-f#\s-]+$/i.test(original)) {
    return { token: original, reason: "css_color" };
  }
  if (PHONE_VN.test(original.replace(/\s/g, ""))) {
    return { token: original, reason: "phone_number" };
  }
  if (TRACKING.test(original)) {
    return { token: original, reason: "tracking_code" };
  }
  if (FONT_NAMES.has(token)) {
    return { token: original, reason: "font_or_social_name" };
  }

  if (/^\d+$/.test(token)) {
    const n = Number(token);
    if (opts.allowYear && n >= 1950 && n <= 2035) return null;
    if (opts.allowNumeric) return null;
    if (n >= 1950 && n <= 2035) return null;
    if (token.length <= 4) {
      return { token: original, reason: "random_numeric_fragment" };
    }
    return { token: original, reason: "numeric_only" };
  }

  if (/^[a-z]*\d+[a-z\d]*$/i.test(token) && token.length <= 4) {
    return { token: original, reason: "random_alphanumeric_fragment" };
  }

  return null;
}

/**
 * @param {string} raw
 * @param {object} [opts]
 * @returns {string | null}
 */
export function cleanBusinessToken(raw, opts = {}) {
  const hit = classifyGarbageToken(raw, opts);
  if (hit) return null;
  const token = foldVi(String(raw || "").trim());
  return token.length >= 2 ? token : null;
}
