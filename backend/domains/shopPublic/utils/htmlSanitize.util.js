/**
 * Minimal allow-list HTML sanitizer for the shop intro_html field.
 *
 * Why a hand-rolled sanitizer instead of a dependency:
 *   - intro_html is plain seller-written copy. We do NOT need full HTML5
 *     parsing; we need to (1) drop dangerous tags (script, style, iframe,
 *     object, embed, link, meta, form, input, etc.) and (2) drop every
 *     event-handler attribute (onclick=…, onload=…) plus `javascript:`
 *     URLs in href/src.
 *   - Adding a runtime DOM parser (jsdom, sanitize-html) would balloon
 *     cold-start time and pull in 30+ transitive deps.
 *   - This is server-side ONLY; output is later rendered with
 *     dangerouslySetInnerHTML on the public storefront layout, so the
 *     trust boundary lives here.
 *
 * Tradeoff: this WILL strip exotic markup like data-* attributes the
 * seller didn't actually need. Acceptable for v1.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "u", "b", "i",
  "ul", "ol", "li",
  "h2", "h3", "h4", "h5",
  "a", "blockquote", "hr",
  "span", "div", "img",
  "table", "thead", "tbody", "tr", "td", "th",
]);

const ALLOWED_ATTRS_BY_TAG = {
  a:    new Set(["href", "title", "target", "rel"]),
  img:  new Set(["src", "alt", "title", "width", "height"]),
  td:   new Set(["colspan", "rowspan"]),
  th:   new Set(["colspan", "rowspan"]),
  // Every other allowed tag gets NO attributes — keep the surface tiny.
};

const SAFE_URL_SCHEMES = /^(https?:|mailto:|tel:)/i;

/**
 * Strip all HTML comments, then walk the input and rebuild it tag by
 * tag. Anything outside the allow-list is dropped (but its inner text
 * survives).
 */
export function sanitizeShopHtml(html) {
  if (typeof html !== "string") return "";

  // 1. Strip HTML comments (and any conditional comments).
  let out = html.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Strip entire <script>/<style>/<iframe>/<object>/<embed>/<form>
  //    blocks (tag + content) so their bodies never leak.
  const DANGEROUS_BLOCKS = [
    "script", "style", "iframe", "object", "embed",
    "form", "input", "button", "textarea", "select", "noscript",
    "svg", "math", "link", "meta", "base",
  ];
  for (const tag of DANGEROUS_BLOCKS) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi");
    out = out.replace(re, "");
    // Also kill self-closed variants like <link rel="…" />.
    const selfClose = new RegExp(`<${tag}\\b[^>]*?/?>`, "gi");
    out = out.replace(selfClose, "");
  }

  // 3. For every remaining tag, decide: keep it (and filter attrs) or
  //    drop the angle brackets entirely (its inner text stays).
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (match, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return ""; // drop unsafe wrapper, keep inner text

    if (match.startsWith("</")) return `</${tag}>`;

    const attrAllowList = ALLOWED_ATTRS_BY_TAG[tag];
    if (!attrAllowList) {
      // Allowed tag with no allowed attrs.
      return `<${tag}>`;
    }

    const kept = [];
    const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:.\-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let m;
    while ((m = attrRe.exec(rawAttrs)) !== null) {
      const name = m[1].toLowerCase();
      const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
      if (!attrAllowList.has(name)) continue;
      if (name.startsWith("on")) continue; // double-safety vs event handlers
      if ((name === "href" || name === "src") && !SAFE_URL_SCHEMES.test(value)) continue;
      const escaped = value.replace(/"/g, "&quot;");
      kept.push(`${name}="${escaped}"`);
    }

    // Force rel="noopener noreferrer" on outgoing <a target="_blank">.
    if (tag === "a") {
      const hasBlank = /\btarget\s*=\s*["']?_blank["']?/i.test(rawAttrs);
      if (hasBlank) {
        const hasRel = kept.some((s) => s.startsWith("rel="));
        if (!hasRel) kept.push('rel="noopener noreferrer"');
      }
    }

    return kept.length ? `<${tag} ${kept.join(" ")}>` : `<${tag}>`;
  });

  return out.trim();
}
