#!/usr/bin/env node
/**
 * Stress GET card-list + GET search — latency (ms) p50/p95/p99, RPS.
 *
 * Cần API đang chạy (vd: PORT=5000).
 *
 * Env:
 *   STRESS_BASE_URL=http://127.0.0.1:5000
 *   STRESS_LIST_PATH=/api/products/card-list?limit=24
 *   STRESS_SEARCH_PATH=/api/products/search?q=loc&perPage=12&page=1
 *   STRESS_MODE=list|search|both     (mặc định both)
 *   STRESS_CONCURRENCY=40
 *   STRESS_LIST_REQUESTS / STRESS_SEARCH_REQUESTS — nếu both: mặc định 50k mỗi loại (=100k tổng)
 *   STRESS_REQUESTS — nếu mode list|search đơn: mặc định 100k
 */
import "dotenv/config";
import http from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function pickLib(protocol) {
  return protocol === "https:" ? https : http;
}

function measureOne(lib, urlObj, pathWithQuery) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: pathWithQuery,
        method: "GET",
        headers: { Connection: "keep-alive", Accept: "application/json" },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(performance.now() - t0));
      },
    );
    req.on("error", () => resolve(performance.now() - t0));
    req.setTimeout(120_000, () => {
      try {
        req.destroy();
      } catch {
        /* ignore */
      }
      resolve(performance.now() - t0);
    });
    req.end();
  });
}

async function runPhase(label, urlStr, total, concurrency) {
  const urlObj = new URL(urlStr);
  const lib = pickLib(urlObj.protocol);
  const pathWithQuery = `${urlObj.pathname}${urlObj.search}`;
  const lat = [];
  let cursor = 0;

  async function worker() {
    for (;;) {
      const j = cursor++;
      if (j >= total) break;
      lat.push(await measureOne(lib, urlObj, pathWithQuery));
    }
  }

  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );
  const wallMs = performance.now() - t0;
  lat.sort((a, b) => a - b);
  const sum = lat.reduce((a, b) => a + b, 0);
  const mean = sum / lat.length;
  const rps = total / (wallMs / 1000);

  console.log(`\n=== ${label} (${total} req, conc=${concurrency}) ===`);
  console.log(
    `wall_s ${(wallMs / 1000).toFixed(2)}  rps ${rps.toFixed(1)}  mean_ms ${mean.toFixed(2)}`,
  );
  console.log(
    `p50_ms ${percentile(lat, 50).toFixed(2)}  p95_ms ${percentile(lat, 95).toFixed(2)}  p99_ms ${percentile(lat, 99).toFixed(2)}`,
  );
}

async function main() {
  const base = (process.env.STRESS_BASE_URL || "http://127.0.0.1:5000").replace(
    /\/+$/,
    "",
  );
  const listPath = process.env.STRESS_LIST_PATH || "/api/products/card-list?limit=24";
  const searchPath =
    process.env.STRESS_SEARCH_PATH ||
    "/api/products/search?q=phu&perPage=12&page=1";
  const mode = (process.env.STRESS_MODE || "both").toLowerCase();
  const concurrency = Math.min(
    500,
    Math.max(1, Number(process.env.STRESS_CONCURRENCY || 40)),
  );

  const defaultSingle = Math.max(1, Number(process.env.STRESS_REQUESTS || 100_000));
  const defaultEach = Math.max(1, Number(process.env.STRESS_EACH || 50_000));

  let listN = 0;
  let searchN = 0;
  if (mode === "list") {
    listN = defaultSingle;
  } else if (mode === "search") {
    searchN = defaultSingle;
  } else {
    listN = Math.max(1, Number(process.env.STRESS_LIST_REQUESTS || defaultEach));
    searchN = Math.max(1, Number(process.env.STRESS_SEARCH_REQUESTS || defaultEach));
  }

  console.log("stress-list-search", { base, mode, concurrency, listN, searchN });

  if (listN > 0) {
    await runPhase("card-list", `${base}${listPath.startsWith("/") ? "" : "/"}${listPath}`, listN, concurrency);
  }
  if (searchN > 0) {
    await runPhase(
      "search",
      `${base}${searchPath.startsWith("/") ? "" : "/"}${searchPath}`,
      searchN,
      concurrency,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
