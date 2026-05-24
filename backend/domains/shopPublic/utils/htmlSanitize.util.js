/**
 * Allow-list HTML sanitizer for the shop `intro_html` rich content.
 *
 * Phase A allowed only text + img.  Phase B adds:
 *   - safe iframe embeds (YouTube, TikTok, Facebook video plugin ONLY)
 *   - figure / figcaption  (image captions emitted by Tiptap)
 *   - shop CTA blocks      (<a class="shop-cta shop-cta--call|zalo|facebook">)
 *   - shop embed wrappers  (<div class="shop-embed shop-embed--<provider>">)
 *
 * Trust model:
 *   - We run on every PUT /api/shop/public-page write — clients never
 *     bypass this.
 *   - Output is rendered with dangerouslySetInnerHTML on the storefront,
 *     so this file IS the XSS boundary.
 *   - No dependency on jsdom / sanitize-html (cold-start cost, transitive
 *     dep surface). The regex walker is intentionally simple and audited.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "u", "b", "i",
  "ul", "ol", "li",
  "h2", "h3", "h4", "h5",
  "a", "blockquote", "hr",
  "span", "div", "img",
  "figure", "figcaption",
  "iframe",
  "table", "thead", "tbody", "tr", "td", "th",
]);

const ALLOWED_ATTRS_BY_TAG = {
  a:        new Set(["href", "title", "target", "rel", "class"]),
  img:      new Set(["src", "alt", "title", "width", "height", "class", "loading"]),
  iframe:   new Set(["src", "width", "height", "allow", "allowfullscreen", "frameborder", "title", "loading", "referrerpolicy", "class"]),
  div:      new Set(["class"]),
  figure:   new Set(["class"]),
  figcaption: new Set(["class"]),
  span:     new Set(["class"]),
  td:       new Set(["colspan", "rowspan"]),
  th:       new Set(["colspan", "rowspan"]),
};

const SAFE_URL_SCHEMES = /^(https?:|mailto:|tel:)/i;

/**
 * Whitelist of class names that are safe to render. The renderer styles
 * them, but they carry no behaviour, so the only risk is them clashing
 * with site CSS or being used to inject UI. We allow only the small set
 * the editor emits.
 */
const ALLOWED_CLASS_TOKENS = new Set([
  "shop-cta",
  "shop-cta--call",
  "shop-cta--zalo",
  "shop-cta--facebook",
  "shop-embed",
  "shop-embed--youtube",
  "shop-embed--tiktok",
  "shop-embed--facebook",
  "shop-content-img",
  "shop-content-figure",
  "shop-content-caption",
]);

/**
 * Iframe `src` is the most dangerous attribute in this whole document.
 * We hard-code the only three providers we trust and verify each URL
 * against an exact pattern. Everything else is dropped.
 */
const SAFE_IFRAME_PATTERNS = [
  // YouTube embed: https://www.youtube.com/embed/<id> (privacy variant ok)
  /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{6,}(?:\?[^"'<>]*)?$/,
  // TikTok embed:  https://www.tiktok.com/embed/v2/<id>
  /^https:\/\/(?:www\.)?tiktok\.com\/embed(?:\/v\d+)?\/[A-Za-z0-9_-]+(?:\?[^"'<>]*)?$/,
  // Facebook video plugin
  /^https:\/\/(?:www\.)?facebook\.com\/plugins\/video\.php\?[^"'<>]*$/,
];

function isSafeIframeSrc(value) {
  if (typeof value !== "string") return false;
  return SAFE_IFRAME_PATTERNS.some((re) => re.test(value));
}

/**
 * Image `src` for shop content must come from R2 (https) or another
 * trusted https origin. We block `data:` URIs because they would let a
 * seller paste a 5 MB base64 blob straight into the column.
 */
function isSafeImageSrc(value) {
  if (typeof value !== "string") return false;
  return /^https:\/\//i.test(value);
}

/**
 * Filter a `class` attribute through the token whitelist. Any token
 * outside `ALLOWED_CLASS_TOKENS` is dropped; if nothing survives, we
 * skip the attribute entirely.
 */
function filterClass(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .split(/\s+/)
    .filter((tok) => tok && ALLOWED_CLASS_TOKENS.has(tok))
    .join(" ");
}

export function sanitizeShopHtml(html) {
  if (typeof html !== "string") return "";

  let out = html.replace(/<!--[\s\S]*?-->/g, "");

  // Strip whole-block dangerous tags AND their contents — script/style
  // bodies must never leak through, even if we later drop just the wrapper.
  // Note: `iframe` is intentionally NOT here because we conditionally
  // allow it for the 3 embed providers below.
  const DANGEROUS_BLOCKS = [
    "script", "style", "object", "embed",
    "form", "input", "button", "textarea", "select", "noscript",
    "svg", "math", "link", "meta", "base",
  ];
  for (const tag of DANGEROUS_BLOCKS) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi");
    out = out.replace(re, "");
    const selfClose = new RegExp(`<${tag}\\b[^>]*?/?>`, "gi");
    out = out.replace(selfClose, "");
  }

  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (match, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return ""; // drop unsafe wrapper, keep inner text

    if (match.startsWith("</")) return `</${tag}>`;

    const attrAllowList = ALLOWED_ATTRS_BY_TAG[tag];
    if (!attrAllowList) {
      return `<${tag}>`;
    }

    const kept = [];
    const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:.\-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let m;
    let isIframeOk = true;
    while ((m = attrRe.exec(rawAttrs)) !== null) {
      const name = m[1].toLowerCase();
      const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();

      if (!attrAllowList.has(name)) continue;
      if (name.startsWith("on")) continue;

      // URL validation, scoped by tag
      if (name === "src" && tag === "iframe") {
        if (!isSafeIframeSrc(value)) { isIframeOk = false; break; }
      } else if (name === "src" && tag === "img") {
        if (!isSafeImageSrc(value)) continue;
      } else if (name === "href" && !SAFE_URL_SCHEMES.test(value)) {
        continue;
      }

      // Class allow-list (token-by-token)
      if (name === "class") {
        const cleaned = filterClass(value);
        if (!cleaned) continue;
        kept.push(`class="${cleaned.replace(/"/g, "&quot;")}"`);
        continue;
      }

      // loading attr: only "lazy" / "eager"
      if (name === "loading") {
        if (value !== "lazy" && value !== "eager") continue;
      }

      // referrerpolicy: only the safe defaults
      if (name === "referrerpolicy") {
        if (!["no-referrer", "no-referrer-when-downgrade", "strict-origin", "strict-origin-when-cross-origin"].includes(value)) continue;
      }

      const escaped = value.replace(/"/g, "&quot;");
      kept.push(`${name}="${escaped}"`);
    }

    // Iframes with an invalid/missing src are dropped entirely.
    if (tag === "iframe") {
      const hasSrc = kept.some((s) => s.startsWith("src="));
      if (!isIframeOk || !hasSrc) return "";
      // Always force opaque cross-origin defaults
      if (!kept.some((s) => s.startsWith("referrerpolicy="))) {
        kept.push('referrerpolicy="strict-origin-when-cross-origin"');
      }
      if (!kept.some((s) => s.startsWith("allowfullscreen"))) {
        kept.push("allowfullscreen");
      }
      if (!kept.some((s) => s.startsWith("loading="))) {
        kept.push('loading="lazy"');
      }
    }

    // a[target=_blank] must always carry rel="noopener noreferrer"
    if (tag === "a") {
      const hasBlank = /\btarget\s*=\s*["']?_blank["']?/i.test(rawAttrs);
      if (hasBlank) {
        const hasRel = kept.some((s) => s.startsWith("rel="));
        if (!hasRel) kept.push('rel="noopener noreferrer"');
      }
    }

    // Force img lazy-loading by default
    if (tag === "img" && !kept.some((s) => s.startsWith("loading="))) {
      kept.push('loading="lazy"');
    }

    return kept.length ? `<${tag} ${kept.join(" ")}>` : `<${tag}>`;
  });

  return out.trim();
}
