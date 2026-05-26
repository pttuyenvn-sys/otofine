#!/usr/bin/env node
/**
 * RFQ R2 production verification — config, upload, public URL, thumbnails.
 *
 * Usage:
 *   node scripts/verify-rfq-r2-production.js
 *   node scripts/verify-rfq-r2-production.js --curl-url https://cdn.example.com/rfq/chat/2026/05/test.jpg
 */
import dotenv from "dotenv";
import { rfqR2Ready, rfqR2Configured } from "../config/rfqR2.config.js";
import { logRfqR2StartupConfig, getRfqR2MetricsSnapshot } from "../modules/rfq/utils/rfqR2Observability.js";
import { saveRfqImageBuffer } from "../modules/rfq/utils/rfqImagePersist.js";
import { buildRfqImageUploadResponse } from "../modules/rfq/utils/rfqImageUrls.js";

dotenv.config();

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
  "base64",
);

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function curlPublicUrl(url) {
  const res = await fetch(url, { method: "GET" });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ok: res.ok,
    status: res.status,
    bytes: buf.length,
    contentType: res.headers.get("content-type"),
  };
}

async function stepCurlOnly() {
  const url = argValue("--curl-url");
  if (!url) return;
  console.info("\n=== Public URL curl ===");
  const r = await curlPublicUrl(url);
  console.info(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(1);
}

async function main() {
  await stepCurlOnly();
  if (argValue("--curl-url") && process.argv.length <= 3) return;

  console.info("\n=== 1. Config ===");
  logRfqR2StartupConfig();
  console.info("Metrics:", JSON.stringify(getRfqR2MetricsSnapshot(), null, 2));

  if (!rfqR2Configured()) {
    throw new Error("RFQ R2 not configured");
  }
  if (!rfqR2Ready()) {
    throw new Error("RFQ R2 not ready — set RFQ_R2_ENABLED=true");
  }

  console.info("\n=== 2. R2 upload pipeline ===");
  const saved = await saveRfqImageBuffer(TINY_JPEG, { category: "chat" });
  const payload = buildRfqImageUploadResponse(saved);
  console.info("Payload:", JSON.stringify(payload, null, 2));

  if (!payload.url.startsWith("http")) {
    throw new Error(`Expected CDN URL, got ${payload.url}`);
  }

  console.info("\n=== 3. Public fetch ===");
  const remote = await curlPublicUrl(payload.url);
  console.info("original:", remote);
  if (!remote.ok) throw new Error(`Public URL failed: ${payload.url}`);

  if (payload.thumbnails?.medium) {
    const med = await curlPublicUrl(payload.thumbnails.medium);
    console.info("medium thumb:", med);
  }

  console.info("\nVerification complete.");
}

main().catch((err) => {
  console.error("\nVERIFY FAILED:", err?.message || err);
  process.exit(1);
});
