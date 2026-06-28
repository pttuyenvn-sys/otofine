#!/usr/bin/env node
/**
 * MOBILE-PRODUCT-CARD-UX-REFINE-01
 */
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.resolve(
  __dirname,
  "../../audit/screenshots/mobile-product-card-ux-refine-01",
);

async function inspectCards(page) {
  return page.evaluate(() => {
    const card = document.querySelector(".of-product.of-product--row");
    if (!card) return null;
    const sideLoc = card.querySelectorAll(".of-product__location--side");
    const metaLoc = card.querySelectorAll(
      ".of-product__meta--l3 .of-product__location",
    );
    const cta = card.querySelector(".of-product__cta--call");
    const ctaBox = cta?.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);
    return {
      sideLocationCount: sideLoc.length,
      sideLocationVisible: [...sideLoc].filter(
        (el) => getComputedStyle(el).display !== "none",
      ).length,
      metaLocationCount: metaLoc.length,
      ctaHeight: ctaBox ? Math.round(ctaBox.height) : null,
      cardBorderWidth: cardStyle.borderTopWidth,
      cardBoxShadow: cardStyle.boxShadow,
    };
  });
}

console.log("\n=== MOBILE-PRODUCT-CARD-UX-REFINE-01 ===\n");

await mkdir(shotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

const iPhone = devices["iPhone 13"];
const mobile = await browser.newPage({
  ...iPhone,
  viewport: { width: 390, height: 844 },
});
await mobile.goto(`${BASE}/phu-tung-toyota-vios`, {
  waitUntil: "networkidle",
});
await mobile.waitForSelector(".of-product:not(.of-product--skeleton)", {
  timeout: 45000,
});
const mobileStats = await inspectCards(mobile);
assert.ok(mobileStats, "mobile product card present");
assert.equal(
  mobileStats.sideLocationVisible,
  0,
  "duplicate side location must be hidden on mobile",
);
assert.ok(
  mobileStats.metaLocationCount >= 1,
  "metadata location row retained",
);
assert.ok(
  mobileStats.ctaHeight >= 32 && mobileStats.ctaHeight <= 40,
  `CTA height should be reduced (${mobileStats.ctaHeight}px)`,
);
assert.notEqual(mobileStats.cardBoxShadow, "none", "card should have soft shadow");
console.log("PASS mobile — no duplicate location, lighter CTA, card separation");
console.log(JSON.stringify(mobileStats, null, 2));

await mobile.screenshot({
  path: path.join(shotDir, "after-mobile-toyota-vios.png"),
  fullPage: false,
});

const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desktop.goto(`${BASE}/phu-tung-toyota-vios`, {
  waitUntil: "networkidle",
});
await desktop.waitForSelector(".of-product:not(.of-product--skeleton)", {
  timeout: 45000,
});
const desktopStats = await inspectCards(desktop);
if (!desktopStats) {
  await desktop.waitForTimeout(2000);
}
const desktopStatsFinal = (await inspectCards(desktop)) || desktopStats;
assert.ok(desktopStatsFinal, "desktop product card present");
const sideVisible = await desktop.evaluate(() => {
  const el = document.querySelector(".of-product__location--side");
  return el ? getComputedStyle(el).display !== "none" : false;
});
const metaHidden = await desktop.evaluate(() => {
  const el = document.querySelector(".of-product__meta--l3");
  return el ? getComputedStyle(el).display === "none" : true;
});
assert.ok(sideVisible, "desktop side location visible");
assert.ok(metaHidden, "desktop metadata block hidden");
console.log("PASS desktop layout unchanged (side location visible)");
console.log(JSON.stringify(desktopStatsFinal, null, 2));

await desktop.screenshot({
  path: path.join(shotDir, "after-desktop-toyota-vios.png"),
  fullPage: false,
});

await browser.close();
console.log(`\nScreenshots → ${shotDir}\nALL PASS\n`);
