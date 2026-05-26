#!/usr/bin/env node
/**
 * Phase 4 — standalone RFQ R2 upload test.
 * Does NOT touch RFQ routes or DB.
 *
 * Usage:
 *   RFQ_R2_ENABLED=true node scripts/test-rfq-r2-upload.js
 *   RFQ_R2_ENABLED=true node scripts/test-rfq-r2-upload.js --file ./sample.jpg
 */
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import {
  buildR2Key,
  buildR2PublicUrl,
  rfqR2ServiceStatus,
  uploadBufferToR2,
} from "../services/rfqR2Upload.service.js";

dotenv.config();

/** Minimal valid 1x1 JPEG for smoke test when no --file given */
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
  "base64",
);

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  let buffer = TINY_JPEG;
  let label = "tiny-1x1.jpeg";

  if (fileIdx >= 0 && args[fileIdx + 1]) {
    const filePath = path.resolve(args[fileIdx + 1]);
    buffer = await fs.readFile(filePath);
    label = path.basename(filePath);
    console.info("[test-rfq-r2] using file:", filePath, "bytes:", buffer.length);
  } else {
    console.info("[test-rfq-r2] no --file; using embedded 1x1 JPEG");
  }

  const status = rfqR2ServiceStatus();
  console.info("[test-rfq-r2] status:", JSON.stringify(status, null, 2));

  if (!status.ready) {
    console.error(
      "[test-rfq-r2] ABORT — set RFQ_R2_ENABLED=true and configure RFQ_R2_* in .env",
    );
    console.error("  See backend/.env.rfq-r2.example");
    process.exit(1);
  }

  const key = buildR2Key(`${Date.now()}-test-${label.replace(/[^\w.-]+/g, "_")}.jpg`, {
    subdir: "smoke-test",
  });
  console.info("[test-rfq-r2] uploading key:", key);

  const result = await uploadBufferToR2(buffer, { key });
  console.info("[test-rfq-r2] upload OK:", result);

  const expectedUrl = buildR2PublicUrl(key);
  if (result.url !== expectedUrl) {
    console.warn("[test-rfq-r2] URL mismatch:", { result: result.url, expected: expectedUrl });
  }

  console.info("\n[test-rfq-r2] Verify in browser:\n ", result.url, "\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("[test-rfq-r2] FAILED:", err?.message || err);
  process.exit(1);
});
