const MERGE_MARKER = "\n--- merged ---\n";

function normalizeToken(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Collapse merged RFQ part descriptions for display.
 * e.g. "Cản trước trái\n--- merged ---\nCản trước trái" → "Cản trước trái"
 */
export function normalizeMergedPartDescription(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  if (!s.includes(MERGE_MARKER)) {
    return s.replace(/\s+/g, " ").trim();
  }

  const parts = s
    .split(MERGE_MARKER)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!parts.length) return "";

  const tokens = parts.map(normalizeToken);
  const allSame = tokens.every((t) => t === tokens[0]);
  if (allSame) return parts[0];

  const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const key = normalizeToken(part);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }

  return unique.join(" · ");
}
