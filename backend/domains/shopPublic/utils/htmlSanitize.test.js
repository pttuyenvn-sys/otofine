/**
 * Regression tests for `sanitizeShopHtml()` — the XSS boundary for
 * shop rich content.
 *
 * Runner: bare-bones, no Jest / Mocha — `node --experimental-vm-modules
 * domains/shopPublic/utils/htmlSanitize.test.js`. Prints `PASS` / `FAIL`
 * per case and exits non-zero on any failure.
 *
 * Why bare-bones: the backend has no JS test infra yet; we don't want
 * to drag Jest's transitive dep tree onto the prod server just for one
 * file. Migrate to Vitest when the broader test push happens.
 *
 * Coverage tiers (in order of severity):
 *   1. Hard XSS: <script>, javascript: hrefs, on* handlers, data: URIs
 *   2. Sneaky XSS: nested <SCRIPT>, double-encoded events, css expr
 *   3. Iframe abuse: arbitrary iframe src, missing src, javascript: src
 *   4. Class abuse: arbitrary classes (style hijack)
 *   5. Allowed surface: legit text, lists, headings, links,
 *      whitelisted YouTube / TikTok / Facebook embeds, allowed CTA
 *      and embed wrappers, automatic security attrs.
 */
import { sanitizeShopHtml } from "./htmlSanitize.util.js";

let passed = 0;
let failed = 0;

function expect(label, input, predicate) {
  const out = sanitizeShopHtml(input);
  const ok = predicate(out);
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}`);
    console.error(`      input    : ${truncate(input)}`);
    console.error(`      sanitized: ${truncate(out)}`);
  }
}

function truncate(s) {
  return String(s).length > 140 ? `${String(s).slice(0, 137)}...` : String(s);
}

const has = (s) => (out) => out.includes(s);
const lacks = (s) => (out) => !out.includes(s);
const all = (...preds) => (out) => preds.every((p) => p(out));

/* 1. Hard XSS ------------------------------------------------------- */

expect("strips <script> tag and body",
  `<p>hi</p><script>alert(1)</script>`,
  all(has("<p>hi</p>"), lacks("alert"), lacks("script")));

expect("strips on* handler attributes",
  `<a href="https://example.com" onclick="alert(1)">x</a>`,
  all(has("https://example.com"), lacks("onclick"), lacks("alert")));

expect("strips javascript: href",
  `<a href="javascript:alert(1)">x</a>`,
  lacks("javascript:"));

expect("strips data: img src",
  `<img src="data:text/html;base64,PHNjcmlwdD4=" />`,
  lacks("data:"));

expect("strips http: img src (mixed content)",
  `<img src="http://evil.example/pixel.gif" />`,
  lacks("http://evil"));

expect("strips <style> tag and body",
  `hello<style>body { background: red }</style>world`,
  all(lacks("<style"), lacks("background")));

expect("strips form / input / button",
  `<form><input name="x"><button>go</button></form>`,
  all(lacks("<form"), lacks("<input"), lacks("<button")));

expect("strips svg + math",
  `<svg onload=alert(1)></svg><math></math>`,
  all(lacks("svg"), lacks("math"), lacks("alert")));

/* 2. Sneaky XSS ----------------------------------------------------- */

expect("strips <SCRIPT> upper case",
  `<SCRIPT>alert(1)</SCRIPT>`,
  lacks("alert"));

expect("strips mixed-case on* handlers",
  `<a OnMouseOver="alert(1)" href="https://x.com">x</a>`,
  all(lacks("OnMouseOver"), lacks("alert")));

expect("strips javascript: with whitespace",
  `<a href="  javascript:alert(1) ">x</a>`,
  lacks("javascript:"));

/* 3. Iframe abuse --------------------------------------------------- */

expect("drops arbitrary iframe src",
  `<iframe src="https://evil.example/embed"></iframe>`,
  lacks("evil.example"));

expect("drops iframe with javascript: src",
  `<iframe src="javascript:alert(1)"></iframe>`,
  all(lacks("javascript:"), lacks("<iframe")));

expect("drops iframe with no src",
  `<iframe></iframe>`,
  lacks("<iframe"));

expect("keeps whitelisted YouTube iframe",
  `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>`,
  all(
    has("youtube.com/embed/dQw4w9WgXcQ"),
    has("referrerpolicy="),
    has("allowfullscreen"),
  ));

expect("keeps whitelisted TikTok iframe",
  `<iframe src="https://www.tiktok.com/embed/v2/12345678901"></iframe>`,
  has("tiktok.com/embed/v2/12345678901"));

expect("keeps Facebook video plugin iframe",
  `<iframe src="https://www.facebook.com/plugins/video.php?href=foo&autoplay=0"></iframe>`,
  has("facebook.com/plugins/video.php"));

/* 4. Class allow-list ---------------------------------------------- */

expect("drops arbitrary class names on <div>",
  `<div class="absolute inset-0 evil-overlay"></div>`,
  all(lacks("absolute"), lacks("inset-0"), lacks("evil-overlay")));

expect("keeps whitelisted shop-cta classes",
  `<a class="shop-cta shop-cta--zalo" href="https://zalo.me/12345">Zalo</a>`,
  all(has("shop-cta"), has("shop-cta--zalo"), has("zalo.me/12345")));

expect("auto-injects rel=noopener for target=_blank",
  `<a href="https://example.com" target="_blank">x</a>`,
  all(has("target=\"_blank\""), has("rel=\"noopener noreferrer\"")));

/* 5. Allowed surface ----------------------------------------------- */

expect("keeps headings + bold + lists",
  `<h2>Title</h2><p><strong>bold</strong> <em>em</em></p><ul><li>a</li><li>b</li></ul>`,
  all(has("<h2>Title</h2>"), has("<strong>bold</strong>"), has("<li>a</li>")));

expect("keeps figure + figcaption + img",
  `<figure class="shop-content-figure"><img src="https://img.example/x.jpg"/><figcaption class="shop-content-caption">cap</figcaption></figure>`,
  all(
    has("shop-content-figure"),
    has("shop-content-caption"),
    has("img.example/x.jpg"),
    has("loading=\"lazy\""), // auto-injected
  ));

expect("auto-injects loading=lazy on img",
  `<img src="https://img.example/x.jpg" alt="x" />`,
  has("loading=\"lazy\""));

expect("preserves https mailto: tel:",
  `<a href="mailto:x@y.com">x</a> <a href="tel:0911">y</a>`,
  all(has("mailto:x@y.com"), has("tel:0911")));

/* ------------------------------------------------------------------ */
console.log("");
console.log(`Total: ${passed + failed}  passed: ${passed}  failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
