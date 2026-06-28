const assert = require("assert");
const path = require("path");

const esc = require(path.resolve(__dirname, "../../components/pages/home/hooks/useEscapeListener.js")).default || require(path.resolve(__dirname, "../../components/pages/home/hooks/useEscapeListener.js"));
const lock = require(path.resolve(__dirname, "../../components/pages/home/hooks/useBodyScrollLock.js")).default || require(path.resolve(__dirname, "../../components/pages/home/hooks/useBodyScrollLock.js"));
const vp = require(path.resolve(__dirname, "../../components/pages/home/hooks/useViewportListener.js")).default || require(path.resolve(__dirname, "../../components/pages/home/hooks/useViewportListener.js"));

try {
  assert.strictEqual(typeof esc === "function" || typeof esc.default === "function", true);
  console.log("PASS: useEscapeListener export present");
  assert.strictEqual(typeof lock === "function" || typeof lock.default === "function", true);
  console.log("PASS: useBodyScrollLock export present");
  assert.strictEqual(typeof vp === "function" || typeof vp.default === "function", true);
  console.log("PASS: useViewportListener export present");
  console.log("Hook exports sanity checks passed.");
} catch (err) {
  console.error("Hook unit tests failed:", err && err.message ? err.message : err);
  process.exitCode = 2;
}

