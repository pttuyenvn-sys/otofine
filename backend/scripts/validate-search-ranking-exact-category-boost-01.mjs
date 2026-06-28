#!/usr/bin/env node
/**
 * SEARCH-RANKING-EXACT-CATEGORY-BOOST-01
 */
import assert from "node:assert/strict";
import {
  extractCategoryPhraseFromKeyword,
  rankCategorySidebarSuggestions,
  scoreCategoryPhraseTier,
  scoreCategoryVehicleTier,
} from "../utils/categorySuggestRanking.js";

const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");

console.log("\n=== SEARCH-RANKING-EXACT-CATEGORY-BOOST-01 ===\n");

assert.equal(extractCategoryPhraseFromKeyword("đèn hậu vios"), "đèn hậu");
assert.equal(
  extractCategoryPhraseFromKeyword("má phanh vios", { brand: "Toyota", model: "Vios" }),
  "má phanh",
);
assert.equal(scoreCategoryPhraseTier("Má Phanh", "má phanh"), 1);
assert.equal(scoreCategoryPhraseTier("Má Phanh Trước", "má phanh"), 3);
assert.equal(scoreCategoryPhraseTier("Càng A Phải", "đèn hậu"), 9);
const vehicleVsExact = rankCategorySidebarSuggestions(
  [
    { canonical_name: "Càng A Toyota Vios", total_count: 100, search_priority: 99 },
    { canonical_name: "Má Phanh", total_count: 1, search_priority: 0 },
  ],
  { keyword: "má phanh vios", brand: "Toyota", model: "Vios" },
);
assert.equal(vehicleVsExact[0].canonical_name, "Má Phanh");
console.log("PASS exact category beats vehicle-heavy label");

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function namesTop(path) {
  return fetch(`${API}${path}`)
    .then((res) => {
      assert.equal(res.status, 200, `${path} HTTP ${res.status}`);
      return res.json();
    })
    .then((rows) => rows.map((r) => String(r.canonical_name || "")));
}

function assertTopMatches(names, patterns, label) {
  assert.ok(names.length > 0, `${label}: expected results`);
  const top = names.slice(0, Math.max(patterns.length, 3));
  for (const pattern of patterns) {
    const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
    assert.ok(
      top.some((name) => re.test(name)),
      `${label}: expected top ${JSON.stringify(top)} to include ${re}`,
    );
  }
  console.log(`PASS ${label} — top: ${top.slice(0, 5).join(" | ")}`);
}

function assertNotBefore(names, preferredRe, disfavoredRe, label) {
  const prefIdx = names.findIndex((n) => preferredRe.test(n));
  const badIdx = names.findIndex((n) => disfavoredRe.test(n));
  if (prefIdx >= 0 && badIdx >= 0) {
    assert.ok(
      prefIdx < badIdx,
      `${label}: "${names[prefIdx]}" should rank above "${names[badIdx]}"`,
    );
  }
}

const CASES = [
  {
    label: "đèn hậu vios",
    path: `/product-categories/search-sidebar?q=${encodeURIComponent("đèn hậu vios")}&brand=Toyota&model=Vios`,
    patterns: [/đèn hậu/i],
    notBefore: { preferred: /đèn hậu/i, disfavored: /^càng a/i },
  },
  {
    label: "má phanh vios",
    path: `/product-categories/search-sidebar?q=${encodeURIComponent("má phanh vios")}&brand=Toyota&model=Vios`,
    patterns: [/^má phanh$/i, /má phanh trước/i],
    notBefore: { preferred: /^má phanh$/i, disfavored: /cụm phanh/i },
  },
  {
    label: "lọc dầu cx5",
    path: `/product-categories/search-sidebar?q=${encodeURIComponent("lọc dầu cx5")}&brand=Mazda&model=CX-5`,
    patterns: [/^lọc dầu$/i],
  },
  {
    label: "cản sau vios",
    path: `/product-categories/search-sidebar?q=${encodeURIComponent("cản sau vios")}&brand=Toyota&model=Vios`,
    patterns: [/^cản sau$/i, /cản sau/i],
    notBefore: { preferred: /^cản sau$/i, disfavored: /cánh cửa/i },
  },
  {
    label: "càng a vios",
    path: `/product-categories/search-sidebar?q=${encodeURIComponent("càng a vios")}&brand=Toyota&model=Vios`,
    patterns: [/càng a/i],
  },
];

for (const c of CASES) {
  const names = await namesTop(c.path);
  assertTopMatches(names, c.patterns, c.label);
  if (c.notBefore) {
    assertNotBefore(
      names,
      c.notBefore.preferred,
      c.notBefore.disfavored,
      c.label,
    );
  }
}

const demo = rankCategorySidebarSuggestions(
  [
    { canonical_name: "Cản Sau", total_count: 10 },
    { canonical_name: "Đèn Hậu Phải", total_count: 3 },
    { canonical_name: "Đèn Hậu Trái", total_count: 3 },
    { canonical_name: "Càng A Phải", total_count: 5 },
  ],
  { keyword: "đèn hậu vios", brand: "Toyota", model: "Vios" },
);
assert.match(fold(demo[0].canonical_name), /den hau/);
assert.ok(fold(demo[0].canonical_name).includes("den hau"));
console.log("PASS offline rank demo");

console.log("\nALL PASS — SEARCH-RANKING-EXACT-CATEGORY-BOOST-01\n");
