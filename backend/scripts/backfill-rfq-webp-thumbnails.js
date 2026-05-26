#!/usr/bin/env node
/**
 * Backfill WebP RFQ thumbnails from existing original JPEGs on R2.
 *
 * Idempotent — safe to interrupt and rerun. Skips existing WebP objects.
 * Does NOT modify DB, originals, or legacy JPEG thumbs.
 *
 * Usage:
 *   node scripts/backfill-rfq-webp-thumbnails.js --dry-run
 *   node scripts/backfill-rfq-webp-thumbnails.js --concurrency 8
 *   node scripts/backfill-rfq-webp-thumbnails.js --category chat --limit 100
 *   node scripts/backfill-rfq-webp-thumbnails.js --prefix rfq/chat/2026/05/
 *
 * Requires RFQ R2 credentials (RFQ_R2_* or fallback R2_*). Sets RFQ_R2_ENABLED for uploads.
 */
import dotenv from "dotenv";
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  rfqR2Config,
  rfqR2Configured,
  getRfqR2MissingEnv,
} from "../config/rfqR2.config.js";
import {
  buildRfqWebpThumbPath,
  buildRfqLegacyJpegThumbPath,
  generateRfqWebpThumbnailBuffers,
  RFQ_THUMB_VARIANT,
} from "../modules/rfq/utils/rfqImageThumbnails.js";

dotenv.config();

const WEBP_CONTENT_TYPE = "image/webp";
const SCAN_CATEGORIES = ["chat", "request"];
const DEFAULT_CONCURRENCY = 8;

const stats = {
  processed: 0,
  generated: 0,
  skipped: 0,
  failed: 0,
  thumbsUploaded: 0,
  bytesUploaded: 0,
  legacyJpegThumbBytes: 0,
  webpThumbBytes: 0,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    dryRun: args.includes("--dry-run"),
    concurrency: DEFAULT_CONCURRENCY,
    limit: Infinity,
    category: null,
    prefix: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--concurrency" && args[i + 1]) {
      out.concurrency = Math.max(1, Math.min(20, Number(args[i + 1]) || DEFAULT_CONCURRENCY));
      i += 1;
    } else if (a === "--limit" && args[i + 1]) {
      out.limit = Math.max(1, Number(args[i + 1]) || Infinity);
      i += 1;
    } else if (a === "--category" && args[i + 1]) {
      out.category = String(args[i + 1]).trim();
      i += 1;
    } else if (a === "--prefix" && args[i + 1]) {
      out.prefix = String(args[i + 1]).replace(/^\/+/, "");
      i += 1;
    }
  }

  return out;
}

function getR2Client() {
  if (!rfqR2Configured()) {
    throw new Error(`RFQ R2 not configured — missing: ${getRfqR2MissingEnv().join(", ")}`);
  }
  return new S3Client({
    region: "auto",
    endpoint: rfqR2Config.endpoint,
    credentials: {
      accessKeyId: rfqR2Config.accessKeyId,
      secretAccessKey: rfqR2Config.secretAccessKey,
    },
  });
}

function scanPrefixes(opts) {
  if (opts.prefix) return [opts.prefix.replace(/\/+$/, "") + "/"];
  const base = rfqR2Config.keyPrefix;
  const cats = opts.category ? [opts.category] : SCAN_CATEGORIES;
  return cats.map((c) => `${base}/${c}/`);
}

function isOriginalImageKey(key) {
  const name = String(key || "").split("/").pop()?.toLowerCase() || "";
  if (!name || name.startsWith("thumb_")) return false;
  return /\.jpe?g$/i.test(name);
}

async function listAllKeys(client, prefix) {
  const keys = [];
  let token;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: rfqR2Config.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function headObject(client, key) {
  try {
    const res = await client.send(
      new HeadObjectCommand({ Bucket: rfqR2Config.bucket, Key: key }),
    );
    return {
      exists: true,
      contentType: res.ContentType || null,
      contentLength: Number(res.ContentLength || 0),
    };
  } catch (err) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return { exists: false, contentType: null, contentLength: 0 };
    }
    throw err;
  }
}

async function getObjectBuffer(client, key) {
  const res = await client.send(
    new GetObjectCommand({ Bucket: rfqR2Config.bucket, Key: key }),
  );
  const chunks = [];
  for await (const chunk of res.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function putWebpThumb(client, key, buffer, dryRun) {
  if (dryRun) {
    return { key, byteSize: buffer.length, dryRun: true };
  }

  await client.send(
    new PutObjectCommand({
      Bucket: rfqR2Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: WEBP_CONTENT_TYPE,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const verify = await headObject(client, key);
  if (!verify.exists || !String(verify.contentType || "").includes("webp")) {
    throw new Error(`Content-Type verify failed for ${key}: ${verify.contentType}`);
  }

  return { key, byteSize: buffer.length, contentType: verify.contentType };
}

async function processOriginal(client, originalKey, opts) {
  stats.processed += 1;

  const mediumKey = buildRfqWebpThumbPath(originalKey, RFQ_THUMB_VARIANT.MEDIUM);
  const smallKey = buildRfqWebpThumbPath(originalKey, RFQ_THUMB_VARIANT.SMALL);

  const [mediumHead, smallHead] = await Promise.all([
    headObject(client, mediumKey),
    headObject(client, smallKey),
  ]);

  const needMedium = !mediumHead.exists;
  const needSmall = !smallHead.exists;

  if (!needMedium && !needSmall) {
    stats.skipped += 1;
    return { status: "skipped", originalKey };
  }

  if (opts.dryRun) {
    stats.generated += 1;
    console.info(
      `[dry-run] would generate ${needMedium ? "medium" : ""}${needMedium && needSmall ? " + " : ""}${needSmall ? "small" : ""} for ${originalKey}`,
    );
    return { status: "dry-run", originalKey, mediumKey, smallKey };
  }

  try {
    const jpegBuf = await getObjectBuffer(client, originalKey);
    const thumbs = await generateRfqWebpThumbnailBuffers(jpegBuf);
    if (!thumbs?.medium?.length || !thumbs?.small?.length) {
      throw new Error("Thumbnail generation returned empty buffers");
    }

    const uploads = [];
    if (needMedium) {
      uploads.push(
        putWebpThumb(client, mediumKey, thumbs.medium, false).then((r) => {
          stats.thumbsUploaded += 1;
          stats.bytesUploaded += r.byteSize;
          stats.webpThumbBytes += r.byteSize;
        }),
      );
    }
    if (needSmall) {
      uploads.push(
        putWebpThumb(client, smallKey, thumbs.small, false).then((r) => {
          stats.thumbsUploaded += 1;
          stats.bytesUploaded += r.byteSize;
          stats.webpThumbBytes += r.byteSize;
        }),
      );
    }

    await Promise.all(uploads);

    // Optional bandwidth estimate vs legacy JPEG thumbs when present
    for (const [variant, needed] of [
      [RFQ_THUMB_VARIANT.MEDIUM, needMedium],
      [RFQ_THUMB_VARIANT.SMALL, needSmall],
    ]) {
      if (!needed) continue;
      const legacyKey = buildRfqLegacyJpegThumbPath(originalKey, variant);
      const legacyHead = await headObject(client, legacyKey);
      if (legacyHead.exists) {
        stats.legacyJpegThumbBytes += legacyHead.contentLength;
      }
    }

    stats.generated += 1;
    console.info(`[ok] ${originalKey} → ${needMedium ? mediumKey : ""}${needMedium && needSmall ? " " : ""}${needSmall ? smallKey : ""}`);
    return { status: "generated", originalKey, mediumKey, smallKey };
  } catch (err) {
    stats.failed += 1;
    console.error(`[fail] ${originalKey}: ${err?.message || err}`);
    return { status: "failed", originalKey, error: String(err?.message || err) };
  }
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const i = idx;
      idx += 1;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

function printSummary(startedAt, opts) {
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const saved =
    stats.legacyJpegThumbBytes > 0 && stats.webpThumbBytes > 0
      ? stats.legacyJpegThumbBytes - stats.webpThumbBytes
      : 0;
  const savedPct =
    stats.legacyJpegThumbBytes > 0
      ? ((saved / stats.legacyJpegThumbBytes) * 100).toFixed(1)
      : null;

  console.info("\n=== Backfill summary ===");
  console.info(`Bucket:        ${rfqR2Config.bucket}`);
  console.info(`Dry run:       ${opts.dryRun}`);
  console.info(`Concurrency:   ${opts.concurrency}`);
  console.info(`Processed:     ${stats.processed}`);
  console.info(`Generated:     ${stats.generated} originals`);
  console.info(`Thumbs uploaded: ${stats.thumbsUploaded}`);
  console.info(`Skipped:       ${stats.skipped} (WebP already present)`);
  console.info(`Failed:        ${stats.failed}`);
  console.info(`Bytes uploaded: ${stats.bytesUploaded.toLocaleString()}`);
  if (stats.legacyJpegThumbBytes > 0) {
    console.info(`Legacy JPEG thumb bytes (matched pairs): ${stats.legacyJpegThumbBytes.toLocaleString()}`);
    console.info(`New WebP thumb bytes (same pairs):       ${stats.webpThumbBytes.toLocaleString()}`);
    console.info(
      `Est. bandwidth savings (thumb layer):  ${saved.toLocaleString()} bytes (${savedPct}% vs legacy JPEG thumbs)`,
    );
  }
  console.info(`Elapsed:       ${elapsedSec}s`);
}

async function main() {
  const opts = parseArgs();
  const startedAt = Date.now();

  if (!rfqR2Configured()) {
    throw new Error(`RFQ R2 not configured — missing: ${getRfqR2MissingEnv().join(", ")}`);
  }

  // Upload path uses PutObject directly — no RFQ_R2_ENABLED gate required for reads,
  // but warn if disabled (credentials still used).
  if (!process.env.RFQ_R2_ENABLED || process.env.RFQ_R2_ENABLED === "false") {
    console.warn("[warn] RFQ_R2_ENABLED is not true — backfill will still write to RFQ bucket using configured credentials.");
  }

  const client = getR2Client();
  const prefixes = scanPrefixes(opts);

  console.info("=== RFQ WebP thumbnail backfill ===");
  console.info(`Bucket: ${rfqR2Config.bucket}`);
  console.info(`Scan prefixes: ${prefixes.join(", ")}`);
  console.info(`Dry run: ${opts.dryRun}, concurrency: ${opts.concurrency}, limit: ${Number.isFinite(opts.limit) ? opts.limit : "none"}`);

  const allKeys = [];
  for (const prefix of prefixes) {
    console.info(`Listing ${prefix}…`);
    const keys = await listAllKeys(client, prefix);
    allKeys.push(...keys.filter(isOriginalImageKey));
  }

  const unique = [...new Set(allKeys)].sort();
  const work = unique.slice(0, opts.limit);

  console.info(`Found ${unique.length} original JPEG(s), processing ${work.length}.`);

  let done = 0;
  await runPool(work, opts.concurrency, async (key) => {
    await processOriginal(client, key, opts);
    done += 1;
    if (done % 50 === 0 || done === work.length) {
      console.info(`Progress: ${done}/${work.length} (generated=${stats.generated}, skipped=${stats.skipped}, failed=${stats.failed})`);
    }
  });

  printSummary(startedAt, opts);

  if (stats.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nBACKFILL FAILED:", err?.message || err);
  process.exit(1);
});
