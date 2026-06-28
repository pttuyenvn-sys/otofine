/**
 * SEARCH-INVERTED-INDEX-01 — token type weights.
 */

/** @typedef {'WORD'|'PHRASE'|'OEM'|'BRAND'|'MODEL'|'CATEGORY'|'SYNONYM'|'LOCATION'|'YEAR'} TokenType */

export const TOKEN_WEIGHTS = {
  OEM: 100,
  WORD_TITLE: 80,
  PHRASE_TITLE: 80,
  CATEGORY: 60,
  BRAND: 40,
  MODEL: 40,
  SYNONYM: 20,
  LOCATION: 10,
  YEAR: 10,
  DEFAULT: 30,
};

/**
 * @param {TokenType} tokenType
 * @param {string} source
 */
export function resolveTokenWeight(tokenType, source) {
  if (tokenType === "OEM") return TOKEN_WEIGHTS.OEM;
  if (tokenType === "CATEGORY") return TOKEN_WEIGHTS.CATEGORY;
  if (tokenType === "BRAND") return TOKEN_WEIGHTS.BRAND;
  if (tokenType === "MODEL") return TOKEN_WEIGHTS.MODEL;
  if (tokenType === "SYNONYM") return TOKEN_WEIGHTS.SYNONYM;
  if (tokenType === "LOCATION") return TOKEN_WEIGHTS.LOCATION;
  if (tokenType === "YEAR") return TOKEN_WEIGHTS.YEAR;
  if (tokenType === "PHRASE" && source === "title") return TOKEN_WEIGHTS.PHRASE_TITLE;
  if (tokenType === "WORD" && source === "title") return TOKEN_WEIGHTS.WORD_TITLE;
  return TOKEN_WEIGHTS.DEFAULT;
}

export const TOKEN_TYPES = [
  "WORD",
  "PHRASE",
  "OEM",
  "BRAND",
  "MODEL",
  "CATEGORY",
  "SYNONYM",
  "LOCATION",
  "YEAR",
];
