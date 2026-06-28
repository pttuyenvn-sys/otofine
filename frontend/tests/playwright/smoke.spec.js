const { test, expect } = require("@playwright/test");

test.describe("Focused interactive smoke tests", () => {
  test("Browser back restores URL and H1 after navigations (simulated filters)", async ({ page, baseURL }) => {
    const listing = "/phu-tung-mazda-6-2024";
    // initial listing load
    await page.goto(listing, { waitUntil: "networkidle" });
    const h1 = page.locator("#listing-h1");
    await expect(h1).toBeVisible();
    const initialH1 = await h1.innerText();

    // simulate applying first filter by navigating to a URL that represents a filter
    const firstFilter = `${listing}?keyword=l%E1%BB%8Dc+g%C3%B3i`;
    await page.goto(firstFilter, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(`${listing.replace(/\//g, "\\/")}.*keyword=`));
    const afterFirstH1 = await h1.innerText();

    // simulate applying second filter (another query param)
    const secondFilter = `${listing}?keyword=l%E1%BB%8Dc+g%C3%B3i&location=ha-noi`;
    await page.goto(secondFilter, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(`${listing.replace(/\//g, "\\/")}.*location=`));
    const afterSecondH1 = await h1.innerText();

    // go back once -> should return to firstFilter
    await page.goBack({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp("keyword="));
    const restoredH1 = await h1.innerText();
    expect(restoredH1).toBe(afterFirstH1);

    // go back again -> should return to initial listing
    await page.goBack({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(`${listing.replace(/\//g, "\\/")}$`));
    const finalH1 = await h1.innerText();
    expect(finalH1).toBe(initialH1);
  });

  test("Mobile homepage loads without client exception and filter drawer opens", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();

    let pageError = null;
    page.on("pageerror", (err) => {
      pageError = err;
    });

    await page.goto("/", { waitUntil: "networkidle" });
    expect(pageError).toBeNull();

    // attempt to open filter drawer via visible label 'Chọn xe'
    const filterBtn = page.locator("text=Chọn xe");
    if (await filterBtn.count()) {
      await filterBtn.click();
      // mobile drawer should appear
      const drawer = page.locator(".mobile-drawer, .mobile-panel");
      await expect(drawer).toBeVisible();
    } else {
      // fallback: click bottom nav item (by label)
      const alt = page.locator(".of-bottom-nav__item", { hasText: "Chọn xe" });
      if (await alt.count()) {
        await alt.first().click();
        const drawer = page.locator(".mobile-drawer, .mobile-panel");
        await expect(drawer).toBeVisible();
      }
    }

    await context.close();
  });

  test("Numeric model route does not client-redirect to product detail", async ({ page }) => {
    const listing = "/phu-tung-mazda-6-2024";
    await page.goto(listing, { waitUntil: "networkidle" });
    // wait a short while for any client navigation to occur
    await page.waitForTimeout(1500);
    const url = page.url();
    expect(url).toContain(listing);
    expect(/\/product\/|\/p\//.test(url)).toBeFalsy();
    // ensure H1 present
    const h1 = page.locator("#listing-h1");
    await expect(h1).toBeVisible();
  });
});

