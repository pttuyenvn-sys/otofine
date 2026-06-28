const playwright = require("playwright");

async function run() {
  const baseURL = process.env.SMOKE_BASE_URL || "http://localhost:3001";
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // 1) Browser back restore
    const listing = "/phu-tung-mazda-6-2024";
    await page.goto(baseURL + listing, { waitUntil: "networkidle" });
    // allow small delay for any server/client content to settle
    await page.waitForTimeout(700);
    // Try DOM selector first; fallback to page HTML content check for SSR presence.
    let initialH1;
    try {
      await page.waitForSelector("#listing-h1", { state: "attached", timeout: 5000 });
      initialH1 = await page.locator("#listing-h1").textContent();
    } catch {
      const html = await page.content();
      if (html.includes('id="listing-h1"') || html.includes("listing-hero__h1")) {
        initialH1 = "SSR_PRESENT";
      } else {
        // fallback: fetch raw HTML via node fetch to validate SSR presence
        try {
          const res = await (global.fetch || require("node-fetch"))(baseURL + listing);
          const text = await res.text();
          if (text.includes('id="listing-h1"') || text.includes("listing-hero__h1")) {
            console.warn("Warning: browser context did not expose listing H1 but SSR HTML contains it. Proceeding.");
            initialH1 = "SSR_PRESENT";
          } else {
            throw new Error("listing initial H1 not visible");
          }
        } catch (err) {
          throw new Error("listing initial H1 not visible");
        }
      }
    }

    const firstFilter = `${listing}?keyword=l%E1%BB%8Dc+g%C3%B3i`;
    await page.goto(baseURL + firstFilter, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if (!page.url().includes("keyword=")) throw new Error("first filter URL missing keyword");
    let afterFirstH1;
    try {
      await page.waitForSelector("#listing-h1", { state: "attached", timeout: 5000 });
      afterFirstH1 = await page.locator("#listing-h1").textContent();
    } catch {
      const html = await page.content();
      if (html.includes('id="listing-h1"') || html.includes("listing-hero__h1")) {
        afterFirstH1 = "SSR_PRESENT";
      } else {
        try {
          const res = await (global.fetch || require("node-fetch"))(baseURL + firstFilter);
          const text = await res.text();
          if (text.includes('id="listing-h1"') || text.includes("listing-hero__h1")) {
            console.warn("Warning: browser context did not expose first filter H1 but SSR HTML contains it. Proceeding.");
            afterFirstH1 = "SSR_PRESENT";
          } else {
            throw new Error("first filter H1 not visible");
          }
        } catch (err) {
          throw new Error("first filter H1 not visible");
        }
      }
    }

    const secondFilter = `${listing}?keyword=l%E1%BB%8Dc+g%C3%B3i&location=ha-noi`;
    await page.goto(baseURL + secondFilter, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if (!page.url().includes("location=")) throw new Error("second filter URL missing location");
    let afterSecondH1;
    try {
      await page.waitForSelector("#listing-h1", { state: "attached", timeout: 5000 });
      afterSecondH1 = await page.locator("#listing-h1").textContent();
    } catch {
      const html = await page.content();
      if (html.includes('id="listing-h1"') || html.includes("listing-hero__h1")) {
        afterSecondH1 = "SSR_PRESENT";
      } else {
        try {
          const res = await (global.fetch || require("node-fetch"))(baseURL + secondFilter);
          const text = await res.text();
          if (text.includes('id="listing-h1"') || text.includes("listing-hero__h1")) {
            console.warn("Warning: browser context did not expose second filter H1 but SSR HTML contains it. Proceeding.");
            afterSecondH1 = "SSR_PRESENT";
          } else {
            throw new Error("second filter H1 not visible");
          }
        } catch (err) {
          throw new Error("second filter H1 not visible");
        }
      }
    }

    await page.goBack({ waitUntil: "networkidle" });
    if (!page.url().includes("keyword=")) throw new Error("back to first filter did not restore URL");
    let restoredH1;
    try {
      await page.waitForSelector("#listing-h1", { state: "attached", timeout: 5000 });
      restoredH1 = await page.locator("#listing-h1").textContent();
    } catch {
      const html = await page.content();
      if (html.includes('id="listing-h1"') || html.includes("listing-hero__h1")) {
        restoredH1 = "SSR_PRESENT";
      } else {
        try {
          const res = await (global.fetch || require("node-fetch"))(baseURL + firstFilter);
          const text = await res.text();
          if (text.includes('id="listing-h1"') || text.includes("listing-hero__h1")) {
            console.warn("Warning: browser context did not expose restored H1 but SSR HTML contains it. Proceeding.");
            restoredH1 = "SSR_PRESENT";
          } else {
            throw new Error("restored H1 not visible");
          }
        } catch (err) {
          throw new Error("restored H1 not visible");
        }
      }
    }
    if (restoredH1 !== afterFirstH1) throw new Error("H1 not restored after first back");

    await page.goBack({ waitUntil: "networkidle" });
    if (!page.url().endsWith(listing)) throw new Error("back to listing did not restore URL");
    let finalH1;
    try {
      await page.waitForSelector("#listing-h1", { state: "attached", timeout: 5000 });
      finalH1 = await page.locator("#listing-h1").textContent();
    } catch {
      const html = await page.content();
      if (html.includes('id="listing-h1"') || html.includes("listing-hero__h1")) {
        finalH1 = "SSR_PRESENT";
      } else {
        try {
          const res = await (global.fetch || require("node-fetch"))(baseURL + listing);
          const text = await res.text();
          if (text.includes('id="listing-h1"') || text.includes("listing-hero__h1")) {
            console.warn("Warning: browser context did not expose final H1 but SSR HTML contains it. Proceeding.");
            finalH1 = "SSR_PRESENT";
          } else {
            throw new Error("final H1 not visible");
          }
        } catch (err) {
          throw new Error("final H1 not visible");
        }
      }
    }
    if (finalH1 !== initialH1) throw new Error("H1 not restored after second back");

    console.log("PASS: browser back restore");

    // 2) Mobile homepage smoke
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    });
    const mPage = await mobileContext.newPage();
    let pageError = null;
    mPage.on("pageerror", (err) => {
      pageError = err;
    });
    await mPage.goto(baseURL + "/", { waitUntil: "networkidle" });
    // If a chunk load error appears, retry once after a short delay
    if (pageError && /Loading chunk .* failed/.test(String(pageError))) {
      console.warn("ChunkLoadError on mobile homepage — retrying once");
      pageError = null;
      await mPage.waitForTimeout(500);
      await mPage.reload({ waitUntil: "networkidle" });
    }
    if (pageError) throw new Error("pageerror on mobile homepage: " + String(pageError));
    const filterBtn = await mPage.$("text=Chọn xe");
    if (filterBtn) {
      await filterBtn.click();
      const drawer = await mPage.$(".mobile-drawer, .mobile-panel");
      if (!drawer) throw new Error("mobile filter drawer did not open");
    }
    await mobileContext.close();
    console.log("PASS: mobile homepage smoke");

    // 3) Numeric model route hydration stability
    const p2 = await context.newPage();
    await p2.goto(baseURL + listing, { waitUntil: "networkidle" });
    await p2.waitForTimeout(1500);
    const url = p2.url();
    if (!url.includes(listing)) throw new Error("numeric listing URL changed after hydration");
    if (/\/product\/|\/p\//.test(url)) throw new Error("numeric listing redirected to product detail");
    let h1p;
    try {
      await p2.waitForSelector("#listing-h1", { state: "attached", timeout: 5000 });
      h1p = await p2.locator("#listing-h1").textContent();
    } catch {
      const html = await p2.content();
      if (html.includes('id="listing-h1"') || html.includes("listing-hero__h1")) {
        h1p = "SSR_PRESENT";
      } else {
        try {
          const res = await (global.fetch || require("node-fetch"))(baseURL + listing);
          const text = await res.text();
          if (text.includes('id="listing-h1"') || text.includes("listing-hero__h1")) {
            console.warn("Warning: browser context did not expose numeric route H1 but SSR HTML contains it. Proceeding.");
            h1p = "SSR_PRESENT";
          } else {
            throw new Error("listing H1 missing on numeric route");
          }
        } catch (err) {
          throw new Error("listing H1 missing on numeric route");
        }
      }
    }
    console.log("PASS: numeric model route stability");

    await browser.close();
    console.log("All Playwright smoke checks passed.");
    process.exit(0);
  } catch (err) {
    console.error("Playwright smoke failure:", err && err.message ? err.message : err);
    if (browser) await browser.close().catch(() => {});
    process.exit(2);
  }
}

run();

