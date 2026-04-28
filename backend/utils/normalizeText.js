import { SYNONYM_MAP } from "./synonymMap.js";

/**
 * @typedef {{
 *   semantic?: boolean;
 *   stripBrands?: boolean;
 *   extraStripTokens?: string[]; // lowercase, no diacritics, matched as whole words
 * }} NormalizeTextOptions
 */

const STOPWORDS = new Set([
  "bo",
  "cai",
  "chiec",
  "loai",
  "hang",
  "chinh",
  "zin",
  "o",
  "xe",
  "phu",
  "dung",
  "cho",
  "cua",
  "the",
  "mot",
]);

/** @type {Set<string>} */
const DEFAULT_UNIT_TOKENS = new Set(
  [
    "v",
    "mv",
    "kv",
    "vdc",
    "vac",
    "ah",
    "ma",
    "w",
    "kw",
    "mw",
    "wh",
    "mm",
    "cm",
    "km",
    "ft",
    "nm",
    "um",
    "oz",
    "ml",
    "cc",
    "kg",
    "g",
    "ms",
    "min",
    "hr",
    "rpm",
    "deg",
  ].map((t) => t.toLowerCase()),
);

/** @type {Set<string>} */
const DEFAULT_CAR_BRANDS = new Set(
  [
    "toyota",
    "honda",
    "mazda",
    "ford",
    "bmw",
    "mercedes",
    "benz",
    "audi",
    "nissan",
    "suzuki",
    "mitsubishi",
    "kia",
    "hyundai",
    "peugeot",
    "chevrolet",
    "isuzu",
    "subaru",
    "volkswagen",
    "vw",
    "porsche",
    "lexus",
    "acura",
    "infiniti",
    "land",
    "rover",
    "volvo",
    "jaguar",
    "mini",
    "tesla",
    "byd",
    "daewoo",
    "dodge",
    "jeep",
    "gmc",
    "cadillac",
    "skoda",
    "seat",
    "fiat",
    "opel",
    "renault",
    "citroen",
  ].map((t) => t.toLowerCase()),
);

/**
 * OEM-style / part-number token: long mixed letters+digits (typical MPN). Pure words (letters only) stay.
 * @param {string} t lowercased token, letters+numbers only
 */
function isOemAlphanumericCode(t) {
  if (t.length <= 4) return false;
  if (!/^[a-z0-9]+$/i.test(t)) return false;
  if (!/\d/.test(t) || !/[a-zA-Z]/.test(t)) return false;
  return true;
}

const HAS_DIGIT = /[0-9\uFF10-\uFF19]/;
const DIGIT = /[0-9\uFF10-\uFF19]/g;
const ONLY_DIGITS = /^[0-9\uFF10-\uFF19]+$/;
const ONLY_LETTERS = /^\p{L}+$/u;

/** Drop suffix letters “A” / “I” on part labels (cang a, cang i); keep other 1-char tokens. */
function shouldSkipSingleLetterToken(token) {
  return (
    token.length === 1 && (token === "a" || token === "i")
  );
}

/**
 * Split into letter–digit “runs” first so codes like `ABC123X` stay one token for OEM rules.
 * @param {string} s base-normalized string
 * @param {NonNullable<NormalizeTextOptions> & { stripBrands: boolean; extra: Set<string> | null }} ctx
 * @returns {string}
 */
function normalizeSemanticCore(s, ctx) {
  const { stripBrands, extra } = ctx;
  const rawParts = s.match(/[\p{L}\p{N}]+/gu) || [];
  const out = [];
  for (const part of rawParts) {
    const t = part.toLowerCase();
    if (ONLY_DIGITS.test(t)) continue;
    if (isOemAlphanumericCode(t)) continue;
    if (DEFAULT_UNIT_TOKENS.has(t)) continue;
    if (stripBrands && DEFAULT_CAR_BRANDS.has(t)) continue;
    if (extra && extra.has(t)) continue;
    if (HAS_DIGIT.test(t)) {
      const lettersOnly = t.replace(DIGIT, "");
      if (lettersOnly.length < 1) continue;
      const lo = lettersOnly.toLowerCase();
      if (DEFAULT_UNIT_TOKENS.has(lo)) continue;
      if (stripBrands && DEFAULT_CAR_BRANDS.has(lo)) continue;
      if (extra && extra.has(lo)) continue;
      if (ONLY_LETTERS.test(lettersOnly)) {
        const w = lettersOnly.toLowerCase();
        if (shouldSkipSingleLetterToken(w)) continue;
        out.push(w);
      }
      continue;
    }
    if (ONLY_LETTERS.test(t)) {
      if (shouldSkipSingleLetterToken(t)) continue;
      out.push(t);
    }
  }
  const joined0 = out.join(" ").replace(/\s+/g, " ").trim();
  const afterSyn = applySynonymsToResult(joined0);
  const tokens = afterSyn
    .split(/\s+/)
    .filter(
      (t) =>
        !STOPWORDS.has(t) &&
        (t.length > 1 || (t.length === 1 && t !== "a" && t !== "i")),
    );
  let result = tokens.join(" ").replace(/\s+/g, " ").trim();
  if (result.includes("ben trai")) {
    result = result.replaceAll("ben trai", "trai");
  }
  if (result.includes("ben phai")) {
    result = result.replaceAll("ben phai", "phai");
  }
  return result;
}

/**
 * Full-string map first, then longest-key phrase replace (e.g. "bo thang" inside "bo thang truoc").
 * @param {string} result
 * @returns {string}
 */
function applySynonymsToResult(result) {
  if (!result) return "";
  let s = result.replace(/\s+/g, " ").trim();
  if (Object.prototype.hasOwnProperty.call(SYNONYM_MAP, s)) {
    s = SYNONYM_MAP[s] ?? s;
  }
  const keys = Object.keys(SYNONYM_MAP).sort(
    (a, b) => b.length - a.length,
  );
  let pass = 0;
  let changed = true;
  while (changed && pass < 12) {
    pass += 1;
    changed = false;
    const pad = ` ${s} `;
    for (const k of keys) {
      const v = SYNONYM_MAP[k];
      if (v === undefined || k === v) continue;
      const needle = ` ${k} `;
      if (pad.includes(needle)) {
        const next = pad
          .split(needle)
          .join(` ${v} `)
          .trim()
          .replace(/\s+/g, " ");
        if (next !== s) {
          s = next;
          changed = true;
          break;
        }
      }
    }
  }
  return s;
}

/**
 * Lowercase, strip diacritics, collapse spaces.
 * With `options.semantic`, drop numbers, common units, OEM-style codes, and optionally brand tokens
 * to keep only semantic (descriptive) words.
 *
 * @param {unknown} str
 * @param {NormalizeTextOptions} [options]
 * @returns {string}
 */
export function normalizeText(str = "", options = {}) {
  const semantic = Boolean(options && options.semantic);
  const stripBrands = Boolean(options && options.stripBrands);
  const extra = options?.extraStripTokens
    ? new Set(
        options.extraStripTokens
          .map((t) => baseNormalize(t))
          .filter(Boolean),
      )
    : null;

  if (!semantic) {
    return baseNormalize(str);
  }

  const s0 = baseNormalize(String(str));
  if (!s0) return "";
  return normalizeSemanticCore(s0, { stripBrands, extra });
}

/**
 * @param {unknown} str
 * @returns {string}
 */
function baseNormalize(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Semantic normalization for matching (removes numbers, units, codes, etc.).
 * @param {unknown} [str]
 * @param {Omit<NormalizeTextOptions, "semantic">} [options]
 * @returns {string}
 */
export function normalizeTextSemantic(str, options = {}) {
  return normalizeText(str, { ...options, semantic: true });
}

/* Temporary: run with OTOFINE_NORMALIZE_SELFTEST=1 — uses semantic path (see expected comments) */
if (
  typeof process !== "undefined" &&
  process.env.OTOFINE_NORMALIZE_SELFTEST === "1"
) {
  console.log(
    normalizeText("Bộ cảm biến 12V 350mm ABC123X toyota", { semantic: true }),
  );
  // expected: "cam bien toyota"
  console.log(
    normalizeText("bố thắng trước", { semantic: true }),
  );
  // expected: "ma phanh truoc"
}
