/**
 * Derive a single compact trust badge for a product card.
 *
 * Currently driven from the free-form `product.origin` string (the
 * existing seller-side field). The mapping table is intentionally
 * permissive and case-insensitive — sellers type whatever they want,
 * and we map the most common Vietnamese phrases to a stable badge.
 *
 * Returns `null` when no signal is detectable so the chip is hidden
 * (graceful fallback per the spec).
 */
// Patterns matched against the ASCII-folded origin string so seller
// spellings like "Xịn", "Chính Hãng", "tháo xe" all match without
// listing every diacritic combination.
const RULES = [
  // "xin" is Vietnamese seller slang for genuine / high-quality
  // ("xịn" → "xin" after diacritic folding) — included so the chip
  // surfaces meaningfully on the existing seller data set.
  { match: /^\s*chinh\s*hang|original|genuine|^\s*xin\b/i, label: "Chính hãng",  tone: "emerald" },
  { match: /^\s*oem\b|nha\s*may/i,                          label: "OEM",         tone: "blue"    },
  { match: /aftermarket|thay\s*the/i,                       label: "Aftermarket", tone: "amber"   },
  { match: /thao\s*xe|second/i,                             label: "Tháo xe",     tone: "gray"    },
];

function foldDiacritics(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d");
}

export function deriveProductTrustBadge(product) {
  if (!product) return null;
  const raw = (product.origin || "").trim();
  if (!raw) return null;
  const folded = foldDiacritics(raw);
  for (const rule of RULES) {
    if (rule.match.test(folded)) return { label: rule.label, tone: rule.tone };
  }
  // Falls back to the seller's literal text (truncated, NOT folded)
  // so we preserve the original Vietnamese spelling on the chip.
  return { label: raw.slice(0, 24), tone: "gray" };
}
