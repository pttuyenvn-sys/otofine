#!/usr/bin/env node
/**
 * SEARCH-RELEVANCE-BOOST-01
 */
import assert from "node:assert/strict";
import {
  foldVi,
  scoreKeywordRelevance,
} from "../utils/keywordRelevanceRanking.js";

const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");

console.log("\n=== SEARCH-RELEVANCE-BOOST-01 ===\n");

assert.equal(
  scoreKeywordRelevance({ title: "Giảm xóc trước Toyota Vios", query: "giảm" }),
  1,
);
assert.equal(
  scoreKeywordRelevance({
    title: "Bạc cao su tay đỡ giảm xóc",
    query: "giảm",
  }),
  3,
);
assert.ok(
  scoreKeywordRelevance({ title: "Giảm xóc trước", query: "giảm" })
    < scoreKeywordRelevance({ title: "Bạc cao su tay đỡ giảm xóc", query: "giảm" }),
);
console.log("PASS unit scores for giảm");

async function fetchTitles(path) {
  const res = await fetch(`${API}${path}`);
  assert.equal(res.status, 200, `${path} HTTP ${res.status}`);
  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map((r) => String(r.partName || r.displayTitle || "").trim());
}

const q = encodeURIComponent("giảm");
const searchTitles = await fetchTitles(`/products/search?q=${q}&limit=12`);
const listTitles = await fetchTitles(`/products?keyword=${q}&page=1`);

function assertStartsWithPreferred(titles, label) {
  assert.ok(titles.length >= 2, `${label} needs at least 2 results`);
  const firstFold = foldVi(titles[0]);
  assert.ok(
    firstFold.startsWith("giam"),
    `${label}: first result should start with giảm, got "${titles[0]}"`,
  );
  const lateIdx = titles.findIndex((t) => {
    const f = foldVi(t);
    return f.includes("giam") && !f.startsWith("giam");
  });
  if (lateIdx >= 0) {
    assert.ok(
      lateIdx > 0,
      `${label}: "${titles[lateIdx]}" should rank below title-start matches`,
    );
  }
  console.log(`PASS ${label} — top: "${titles[0]}"`);
}

if (searchTitles.length) assertStartsWithPreferred(searchTitles, "/products/search");
if (listTitles.length) assertStartsWithPreferred(listTitles, "/products?keyword");

console.log(
  JSON.stringify(
    {
      searchTop3: searchTitles.slice(0, 3),
      listTop3: listTitles.slice(0, 3),
    },
    null,
    2,
  ),
);
console.log("\nALL PASS\n");
