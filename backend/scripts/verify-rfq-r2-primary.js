#!/usr/bin/env node
/**
 * RFQ R2 upload verification — DB URL shape, public access, legacy URL derive.
 *
 * Usage:
 *   node scripts/verify-rfq-r2-primary.js
 *   node scripts/verify-rfq-r2-primary.js --category request
 *   node scripts/verify-rfq-r2-primary.js --public-id <pending_otp_publicId>
 */
import dotenv from "dotenv";
import {
  rfqR2Config,
  rfqR2Ready,
  rfqR2Configured,
} from "../config/rfqR2.config.js";
import { logRfqR2StartupConfig, getRfqR2MetricsSnapshot } from "../modules/rfq/utils/rfqR2Observability.js";
import { saveRfqImageBuffer } from "../modules/rfq/utils/rfqImagePersist.js";
import { buildRfqImageUploadResponse } from "../modules/rfq/utils/rfqImageUrls.js";
import * as reqRepo from "../modules/rfq/repositories/rfqRequest.repository.js";

dotenv.config();

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
  "base64",
);

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function rfqImageSrc(url, apiOrigin = "https://otofine.com") {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${apiOrigin}${u.startsWith("/") ? "" : "/"}${u}`;
}

function isR2PublicUrl(url) {
  const base = String(rfqR2Config.publicBaseUrl || "").replace(/\/+$/, "");
  if (!base || !url) return false;
  return String(url).startsWith(`${base}/`);
}

async function fetchPublic(url) {
  const res = await fetch(url, { method: "GET" });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ok: res.ok,
    status: res.status,
    bytes: buf.length,
    contentType: res.headers.get("content-type"),
  };
}

async function stepConfig() {
  console.info("\n=== 1. Config ===");
  logRfqR2StartupConfig();
  if (!rfqR2Configured()) {
    throw new Error("RFQ R2 not configured — set RFQ_R2_* env vars");
  }
  if (!rfqR2Ready()) {
    throw new Error("RFQ R2 not ready — set RFQ_R2_ENABLED=true");
  }
}

async function stepUpload(category) {
  console.info(`\n=== 2. Upload (${category}) ===`);
  const saved = await saveRfqImageBuffer(TINY_JPEG, {
    category,
    requestType: category,
    mime: "image/jpeg",
    input_bytes: TINY_JPEG.length,
    meta: { verify: true },
  });
  const payload = buildRfqImageUploadResponse(saved);
  console.info("Result:", JSON.stringify(payload, null, 2));

  if (!isR2PublicUrl(payload.url)) {
    throw new Error(`URL is not under RFQ_R2_PUBLIC_BASE_URL: ${payload.url}`);
  }

  return payload;
}

async function stepPublicFetch(url) {
  console.info("\n=== 3. R2 public fetch ===");
  const remote = await fetchPublic(url);
  console.info("Public fetch:", remote);
  if (!remote.ok) {
    throw new Error(`Public URL not accessible: ${url} status=${remote.status}`);
  }
}

async function stepFrontendRender(url) {
  console.info("\n=== 4. Frontend URL resolution ===");
  const rendered = rfqImageSrc(url);
  console.info("rfqImageSrc(input):", rendered);
  if (!rendered.startsWith("http")) {
    throw new Error("CDN URL should pass through unchanged");
  }
}

async function stepLegacyRender() {
  console.info("\n=== 5. Legacy local URL (read-only compat) ===");
  const legacy = "/uploads/rfq/legacy-test.jpg";
  const rendered = rfqImageSrc(legacy);
  console.info("legacy render:", rendered);
  if (!rendered.includes("/uploads/rfq/legacy-test.jpg")) {
    throw new Error("Legacy local URL should resolve with API origin");
  }
}

async function stepDbVerify(publicId, url) {
  if (!publicId) {
    console.info("\n=== 6. DB verify ===");
    console.info("SKIP — pass --public-id to verify images_json append");
    return;
  }

  console.info("\n=== 6. DB verify (images_json) ===");
  const row = await reqRepo.findByPublicId(publicId);
  if (!row) throw new Error(`RFQ not found for publicId=${publicId}`);
  if (row.status !== "pending_otp") {
    throw new Error(`RFQ status must be pending_otp, got ${row.status}`);
  }

  await reqRepo.appendImages(publicId, [url]);
  const updated = await reqRepo.findByPublicId(publicId);
  let imgs = [];
  try {
    imgs = updated.images_json ? JSON.parse(updated.images_json) : [];
  } catch {
    imgs = updated.images_json || [];
  }
  if (!imgs.includes(url)) {
    throw new Error(`URL not found in images_json after append: ${url}`);
  }
  console.info("PASS — images_json contains CDN URL:", url);
}

async function main() {
  const category = argValue("--category") || "request";
  const publicId = argValue("--public-id");

  await stepConfig();
  const payload = await stepUpload(category);
  await stepPublicFetch(payload.url);
  await stepFrontendRender(payload.url);
  await stepLegacyRender();
  await stepDbVerify(publicId, payload.url);

  console.info("\n=== Metrics ===");
  console.info(JSON.stringify(getRfqR2MetricsSnapshot(), null, 2));
  console.info("\nPhase verification complete.");
}

main().catch((err) => {
  console.error("\nVERIFY FAILED:", err?.message || err);
  process.exit(1);
});
