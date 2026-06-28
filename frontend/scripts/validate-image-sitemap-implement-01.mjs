#!/usr/bin/env node
/**
 * IMAGE-SITEMAP-IMPLEMENT-01 validation
 */
const BASE = process.env.SITEMAP_VALIDATE_BASE || "http://127.0.0.1:3000";
const API = process.env.ALT_VALIDATE_API || "http://127.0.0.1:5000/api";

function extractUrlBlocks(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function parseProductUrlBlocks(xml) {
  return extractUrlBlocks(xml).map((block) => {
    const pageLoc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] || null;
    const imageLocs = [...block.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((m) => m[1]);
    const imageBlocks = (block.match(/<image:image>/g) || []).length;
    return { pageLoc, imageLocs, imageBlocks };
  });
}

async function fetchXml(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return { text: await res.text(), bytes: Number(res.headers.get("content-length")) || null };
}

async function loadProductsSitemapXml() {
  const root = await fetchXml("/sitemap-products.xml");
  if (root.text.includes("<sitemapindex")) {
    const childLocs = extractLocs(root.text);
    let combined = "";
    for (const loc of childLocs) {
      const childPath = new URL(loc).pathname;
      const part = await fetchXml(childPath);
      combined += part.text;
    }
    return { xml: combined, rootBytes: root.text.length, combinedBytes: combined.length };
  }
  return { xml: root.text, rootBytes: root.text.length, combinedBytes: root.text.length };
}

function shufflePick(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function main() {
  console.log("IMAGE-SITEMAP-IMPLEMENT-01 validation\n");

  const remote = await fetch(`${API}/seo/sitemap-data`).then((r) => r.json());
  const apiProducts = remote.products || [];
  const apiProductUrls = new Set(
    apiProducts.map((p) => {
      const cp = String(p.canonicalPath || "").trim();
      return cp.startsWith("/") ? `https://otofine.com${cp}` : null;
    }).filter(Boolean),
  );
  const apiWithImage = apiProducts.filter((p) => p.primaryImageUrl).length;

  const { xml, rootBytes, combinedBytes } = await loadProductsSitemapXml();

  if (!xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')) {
    throw new Error("Missing xmlns:image namespace on product sitemap");
  }

  const blocks = parseProductUrlBlocks(xml);
  const productLocs = blocks.map((b) => b.pageLoc).filter(Boolean);
  const productSet = new Set(productLocs);

  const withImage = blocks.filter((b) => b.imageLocs.length > 0);
  const duplicateImageBlocks = blocks.filter((b) => b.imageBlocks > 1);
  const missingPageLoc = blocks.filter((b) => !b.pageLoc);

  const sample = shufflePick(withImage, Math.min(100, withImage.length));
  const probeResults = [];
  for (const row of sample) {
    const imageUrl = row.imageLocs[0];
    let status = 0;
    try {
      const res = await fetch(imageUrl, { method: "HEAD", signal: AbortSignal.timeout(20000) });
      status = res.status;
      if (status === 405 || status === 501) {
        const getRes = await fetch(imageUrl, { method: "GET", signal: AbortSignal.timeout(20000) });
        status = getRes.status;
      }
    } catch (err) {
      status = -1;
      void err;
    }
    probeResults.push({ page: row.pageLoc, imageUrl, status });
  }

  const failedProbes = probeResults.filter((r) => r.status !== 200);
  const avgUrlOnlyBytes = 190;
  const avgWithImageBytes = 360;
  const estimatedBefore = productLocs.length * avgUrlOnlyBytes;
  const estimatedAfter = combinedBytes || productLocs.length * avgWithImageBytes;

  const report = {
    productUrlCount: productLocs.length,
    apiProductUrlCount: apiProductUrls.size,
    parityOk: productLocs.length === apiProductUrls.size,
    urlsWithImageBlock: withImage.length,
    apiProductsWithPrimaryImage: apiWithImage,
    duplicateImageBlocks: duplicateImageBlocks.length,
    missingPageLoc: missingPageLoc.length,
    sampleProbeSize: sample.length,
    sampleProbeFailures: failedProbes.length,
    sitemapProductsBytes: rootBytes,
    sitemapProductsCombinedBytes: combinedBytes,
    estimatedBytesBefore: estimatedBefore,
    estimatedGrowthBytes: (combinedBytes || estimatedAfter) - estimatedBefore,
    projectedAt50kProductsMb: Number(((50000 * avgWithImageBytes) / (1024 * 1024)).toFixed(2)),
    projectedAt100kProductsMb: Number(((100000 * avgWithImageBytes) / (1024 * 1024)).toFixed(2)),
    sampleXmlSnippet: xml.slice(0, 800),
    failedProbes: failedProbes.slice(0, 5),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.parityOk) {
    throw new Error(
      `Product URL parity mismatch: sitemap=${productLocs.length} api=${apiProductUrls.size}`,
    );
  }
  if (duplicateImageBlocks.length > 0) {
    throw new Error(`Duplicate image blocks found: ${duplicateImageBlocks.length}`);
  }
  if (withImage.length === 0) {
    throw new Error("No image:image blocks in product sitemap");
  }
  if (failedProbes.length > 0) {
    throw new Error(`${failedProbes.length} sampled image URLs not HTTP 200`);
  }

  console.log("\nPASS: IMAGE-SITEMAP-IMPLEMENT-01");
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exitCode = 1;
});
