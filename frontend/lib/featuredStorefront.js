/** Featured storefront UI helpers (Phase 6E.1). */

export function featuredTone(eligible) {
  if (eligible) {
    return { bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" };
  }
  return { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" };
}

export function featuredBadgeLabel(eligible, score) {
  const s = Number.isFinite(Number(score)) ? Math.round(Number(score)) : null;
  if (eligible) return s != null ? `Featured ${s}` : "Featured eligible";
  return "Not featured";
}
