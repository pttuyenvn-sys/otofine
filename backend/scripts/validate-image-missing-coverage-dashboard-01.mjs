#!/usr/bin/env node
/**
 * IMAGE-MISSING-COVERAGE-DASHBOARD-01 validation
 * Run: cd backend && node scripts/validate-image-missing-coverage-dashboard-01.mjs
 */
import "dotenv/config";
import {
  getImageCoverageReport,
  validateImageCoverageParity,
} from "../modules/admin/seo/services/imageCoverage.service.js";

async function main() {
  const parity = await validateImageCoverageParity();
  const report = await getImageCoverageReport();

  const checks = [];
  checks.push({
    name: "sum(shop.withoutImages) === totals.withoutImages",
    pass: parity.ok,
    detail: `${parity.sumShopMissing} vs ${parity.globalWithoutImages}`,
  });

  const sorted = [...report.sellers];
  const expectedOrder = [...sorted].sort(
    (a, b) =>
      b.withoutImages - a.withoutImages ||
      a.coverageRate - b.coverageRate ||
      a.shopName.localeCompare(b.shopName, "vi"),
  );
  const orderOk = sorted.every(
    (row, i) =>
      row.shopId === expectedOrder[i].shopId &&
      row.withoutImages === expectedOrder[i].withoutImages,
  );
  checks.push({
    name: "default sort withoutImages DESC, coverageRate ASC",
    pass: orderOk,
    detail: `first=${sorted[0]?.shopName || "—"} (${sorted[0]?.withoutImages ?? 0} missing)`,
  });

  const rateOk =
    report.totals.products > 0 &&
    Math.abs(
      report.totals.imageCoverageRate -
        Math.round((report.totals.withImages / report.totals.products) * 1000) / 10,
    ) < 0.05;
  checks.push({
    name: "imageCoverageRate matches withImages/products",
    pass: rateOk,
    detail: `${report.totals.imageCoverageRate}%`,
  });

  const allPass = checks.every((c) => c.pass);

  console.log("IMAGE-MISSING-COVERAGE-DASHBOARD-01 validation");
  console.log("─".repeat(48));
  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"} · ${c.name}`);
    console.log(`       ${c.detail}`);
  }
  console.log("─".repeat(48));
  console.log("Totals:", JSON.stringify(report.totals));
  console.log("Top 20 worst shops:");
  for (const shop of parity.topWorst) {
    console.log(
      `  ${shop.shopName} (#${shop.shopId}): ${shop.withoutImages} missing / ${shop.productCount} (${shop.coverageRate}%)`,
    );
  }
  console.log("─".repeat(48));
  console.log(allPass ? "RESULT: PASS" : "RESULT: FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
