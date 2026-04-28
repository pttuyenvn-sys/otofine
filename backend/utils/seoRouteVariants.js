/**
 * Shared URL variants for part_knowledge SEO (must match seedSeoRoutes.js logic).
 */
import { slugifyVi } from "./productSlug.js";

/** @param {unknown} raw */
export function normalizePrimarySlug(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\/+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 191);
}

/** @param {unknown} raw */
export function parseAliasesJson(raw) {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * @param {string} base slug segment (base clipped so base + '-o-to' fits 191)
 */
export function withOTo(base) {
  let s = String(base ?? "").trim().slice(0, 186);
  if (!s) return null;
  if (s.endsWith("-o-to")) return null;
  return `${s}-o-to`;
}

/**
 * Unique variant slugs for one part (same rules as seedSeoRoutes).
 * @param {string} primarySlug
 * @param {string[]} aliasStrings
 * @returns {Set<string>}
 */
export function collectVariantSlugs(primarySlug, aliasStrings) {
  const out = new Set();
  if (primarySlug) {
    const p = primarySlug.slice(0, 191);
    out.add(p);
    const oto = withOTo(p);
    if (oto) out.add(oto);
  }

  for (const raw of aliasStrings) {
    const slug = slugifyVi(String(raw).trim()).slice(0, 191);
    if (!slug || slug.length < 2) continue;
    out.add(slug);
    const oto = withOTo(slug.length <= 186 ? slug : slug.slice(0, 186));
    if (oto) out.add(oto);
  }

  return out;
}
