/**
 * Normalize HTML emitted by Tiptap so the DB never stores meaningless
 * `<p></p>` / `<p><br></p>` / `<p>&nbsp;</p>` wrappers.
 *
 * Tiptap always emits at least one empty paragraph when the editor is
 * "empty". If we save that to the DB we end up with two storefront/UX
 * bugs:
 *   - the renderer can't tell "truly empty" from "one empty paragraph",
 *     so the empty-state placeholder never shows
 *   - the product detail page renders an extra blank line under
 *     "Chính sách bán hàng"
 *
 * `normalizeRichHtml` returns `""` for inputs that have no visible
 * content; otherwise it returns the input unchanged (the server-side
 * sanitizer remains the authoritative cleaner).
 */
export function normalizeRichHtml(html) {
  if (typeof html !== "string") return "";
  const trimmed = html.trim();
  if (!trimmed) return "";

  // Strip the typical "empty" Tiptap shapes; if nothing meaningful
  // survives, treat as empty.
  const stripped = trimmed
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .trim();

  if (!stripped) return "";
  return trimmed;
}

/**
 * True iff the (post-sanitize) HTML has no visible content. Used by
 * `ShopRichContentRenderer` so the empty-state placeholder shows
 * regardless of whether the column is NULL or holds one stray <p></p>.
 */
export function isRichHtmlEmpty(html) {
  return !normalizeRichHtml(html);
}
