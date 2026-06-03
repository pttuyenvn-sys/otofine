#!/usr/bin/env node
/**
 * RFQ thumbnail pipeline verification (Phases 1–7).
 *
 * Usage:
 *   node scripts/verify-rfq-thumbnails.js
 *   node scripts/verify-rfq-thumbnails.js --fetch
 */
import dotenv from "dotenv";
import {
  deriveRfqThumbnailUrls,
  deriveRfqThumbnailCandidates,
  buildRfqImageUploadResponse,
  filenameFromMediaUrl,
  canonicalizeRfqMediaUrl,
  buildPossibleRfqR2Urls,
} from "../modules/rfq/utils/rfqImageUrls.js";
import {
  buildRfqThumbPath,
  generateRfqThumbnailBuffers,
  RFQ_THUMB_VARIANT,
} from "../modules/rfq/utils/rfqImageThumbnails.js";
import { saveRfqImageBuffer } from "../modules/rfq/utils/rfqImagePersist.js";
import { rfqR2Ready, rfqR2Configured } from "../config/rfqR2.config.js";
import { rfqThumbnailsEnabled, rfqThumbsWebpEnabled } from "../config/rfq.config.js";
import { rfqThumbFilename } from "../modules/rfq/utils/rfqImageThumbnails.js";

dotenv.config();

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
  "base64",
);

function argFlag(name) {
  return process.argv.includes(name);
}

async function fetchOk(url) {
  const res = await fetch(url, { method: "GET" });
  return {
    ok: res.ok,
    status: res.status,
    bytes: Number(res.headers.get("content-length") || 0),
    contentType: res.headers.get("content-type"),
  };
}

async function main() {
  console.info("\n=== RFQ Thumbnail Verification ===\n");
  console.info("RFQ_THUMBNAILS_ENABLED:", rfqThumbnailsEnabled());
  console.info("RFQ_THUMBS_WEBP_ENABLED:", rfqThumbsWebpEnabled());
  console.info("RFQ R2 ready:", rfqR2Ready());
  console.info("RFQ R2 configured:", rfqR2Configured());

  console.info("\n--- Phase A: thumb filename builder ---");
  const webpMedium = rfqThumbFilename(RFQ_THUMB_VARIANT.MEDIUM, "abc.jpg");
  const webpSmall = rfqThumbFilename(RFQ_THUMB_VARIANT.SMALL, "abc.jpg");
  console.info("builder:", { medium: webpMedium, small: webpSmall });
  if (rfqThumbsWebpEnabled()) {
    if (webpMedium !== "thumb_400_abc.webp" || webpSmall !== "thumb_100_abc.webp") {
      throw new Error("WebP thumb filename builder failed");
    }
  }

  console.info("\n--- Phase 1: sharp buffers ---");
  const thumbs = await generateRfqThumbnailBuffers(TINY_JPEG);
  if (!thumbs?.medium?.length || !thumbs?.small?.length) {
    throw new Error("Thumbnail generation failed");
  }
  console.info("thumb_400 bytes:", thumbs.medium.length);
  console.info("thumb_100 bytes:", thumbs.small.length);

  console.info("\n--- Phase B: dual derive candidates ---");
  const sampleOriginal =
    "https://rfq-img.example.com/rfq/chat/2026/05/abc.jpg";
  const candidates = deriveRfqThumbnailCandidates(sampleOriginal);
  console.info("candidates:", candidates);
  if (candidates.medium.webp !== "https://rfq-img.example.com/rfq/chat/2026/05/thumb_400_abc.webp") {
    throw new Error("WebP medium candidate failed");
  }
  if (candidates.medium.jpg !== "https://rfq-img.example.com/rfq/chat/2026/05/thumb_400_abc.jpg") {
    throw new Error("JPEG medium candidate failed");
  }
  if (candidates.small.webp !== "https://rfq-img.example.com/rfq/chat/2026/05/thumb_100_abc.webp") {
    throw new Error("WebP small candidate failed");
  }
  if (candidates.small.jpg !== "https://rfq-img.example.com/rfq/chat/2026/05/thumb_100_abc.jpg") {
    throw new Error("JPEG small candidate failed");
  }

  const derived = deriveRfqThumbnailUrls(sampleOriginal);
  console.info("derived (WebP preferred):", derived);
  if (!derived.medium?.endsWith("thumb_400_abc.webp")) {
    throw new Error("preferred derive medium must be WebP");
  }
  if (!derived.small?.endsWith("thumb_100_abc.webp")) {
    throw new Error("preferred derive small must be WebP");
  }

  const localOriginal = "/uploads/rfq/abc.jpg";
  const localCandidates = deriveRfqThumbnailCandidates(localOriginal);
  console.info("local candidates:", localCandidates);
  const localDerived = deriveRfqThumbnailUrls(localOriginal);
  console.info("local derived:", localDerived);

  console.info("\n--- Phase 1+2: upload pipeline ---");
  const saved = await saveRfqImageBuffer(TINY_JPEG, { category: "chat" });
  const payload = buildRfqImageUploadResponse(saved);
  console.info("API payload:", JSON.stringify(payload, null, 2));

  if (!payload.url) throw new Error("missing url in payload");
  if (!payload.thumbnails?.small || !payload.thumbnails?.medium) {
    console.warn("WARN: thumbnails missing in payload (RFQ_THUMBNAILS_ENABLED off?)");
  }

  const fname = filenameFromMediaUrl(payload.url);
  if (saved.r2_key) {
    const mediumKey = buildRfqThumbPath(saved.r2_key, RFQ_THUMB_VARIANT.MEDIUM);
    const smallKey = buildRfqThumbPath(saved.r2_key, RFQ_THUMB_VARIANT.SMALL);
    console.info("R2 keys:", { original: saved.r2_key, mediumKey, smallKey });
    if (rfqThumbsWebpEnabled()) {
      if (!mediumKey.endsWith(".webp") || !smallKey.endsWith(".webp")) {
        throw new Error("R2 thumb keys must use .webp extension");
      }
      if (payload.thumbnails?.medium && !payload.thumbnails.medium.endsWith(".webp")) {
        throw new Error("API thumb medium URL must use .webp");
      }
    }
  }

  if (argFlag("--fetch") && payload.url.startsWith("http")) {
    console.info("\n--- Phase 7: public fetch ---");
    for (const [label, url] of [
      ["original", payload.url],
      ["medium", payload.thumbnails?.medium],
      ["small", payload.thumbnails?.small],
    ]) {
      if (!url) continue;
      const r = await fetchOk(url);
      console.info(`${label}:`, url, r);
      if (!r.ok) console.warn(`WARN: ${label} not publicly accessible yet`);
      if (
        rfqThumbsWebpEnabled() &&
        (label === "medium" || label === "small") &&
        r.ok &&
        r.contentType &&
        !r.contentType.includes("webp")
      ) {
        console.warn(`WARN: ${label} Content-Type expected image/webp, got ${r.contentType}`);
      }
      if (label === "original" && r.ok && r.contentType && !r.contentType.includes("jpeg")) {
        console.warn(`WARN: original Content-Type expected image/jpeg, got ${r.contentType}`);
      }
    }
  }

  console.info("\n--- Phase 6C.2: read-time canonicalization ---");
  const legacyLocal = "/uploads/rfq/abc.jpg";
  const r2Candidates = buildPossibleRfqR2Urls("abc.jpg");
  if (!r2Candidates.length && rfqR2Configured()) {
    throw new Error("expected R2 candidates when RFQ R2 configured");
  }
  if (r2Candidates.length) {
    console.info("first candidate:", r2Candidates[0]);
    const canonical = canonicalizeRfqMediaUrl(legacyLocal);
    if (canonical === legacyLocal) {
      throw new Error("canonicalize should rewrite legacy local path when R2 base configured");
    }
    if (!canonical.includes("/rfq/chat/") && !canonical.includes("/rfq/request/")) {
      throw new Error("canonical URL must use rfq/chat or rfq/request layout");
    }
    const derivedFromCanonical = deriveRfqThumbnailUrls(canonical);
    if (!derivedFromCanonical.small?.includes("thumb_100_")) {
      throw new Error("derived thumbs must follow canonical R2 prefix");
    }
    if (derivedFromCanonical.small?.includes("/uploads/rfq/")) {
      throw new Error("derived thumbs must not use legacy /uploads/rfq prefix");
    }
  } else {
    console.info("SKIP canonical rewrite — RFQ_R2_PUBLIC_BASE_URL not configured");
    if (canonicalizeRfqMediaUrl(legacyLocal) !== legacyLocal) {
      throw new Error("canonicalize must preserve legacy URL when R2 base missing");
    }
  }

  const apexLegacy = "https://otofine.com/uploads/rfq/abc.jpg";
  if (rfqR2Configured() && r2Candidates.length) {
    const apexCanonical = canonicalizeRfqMediaUrl(apexLegacy);
    if (apexCanonical === apexLegacy) {
      throw new Error("canonicalize should rewrite apex legacy path");
    }
  }

  console.info("\n--- Backward compatibility ---");
  const legacyPayload = buildRfqImageUploadResponse({ url: "/uploads/rfq/old.jpg" });
  console.info("legacy-only response:", legacyPayload);
  if (legacyPayload.url !== "/uploads/rfq/old.jpg") {
    throw new Error("legacy url broken");
  }
  if (!legacyPayload.thumbnails.medium?.endsWith("thumb_400_old.webp")) {
    throw new Error("legacy derive must prefer WebP medium");
  }
  if (!legacyPayload.thumbnails.small?.endsWith("thumb_100_old.webp")) {
    throw new Error("legacy derive must prefer WebP small");
  }
  const legacyCandidates = deriveRfqThumbnailCandidates("/uploads/rfq/old.jpg");
  if (!legacyCandidates.medium.jpg?.endsWith("thumb_400_old.jpg")) {
    throw new Error("legacy JPEG medium candidate missing");
  }

  console.info("\nAll thumbnail checks passed.");
}

main().catch((err) => {
  console.error("\nVERIFY FAILED:", err?.message || err);
  process.exit(1);
});
