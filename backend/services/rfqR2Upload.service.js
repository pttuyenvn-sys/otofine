/**
 * RFQ R2 upload service — isolated from product catalog R2.
 */
import crypto from "crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { rfqR2Config, rfqR2Configured, rfqR2Ready } from "../config/rfqR2.config.js";

let _client = null;

function getClient() {
  if (_client) return _client;
  if (!rfqR2Configured()) {
    throw Object.assign(new Error("RFQ_R2_NOT_CONFIGURED"), { status: 503 });
  }
  _client = new S3Client({
    region: "auto",
    endpoint: rfqR2Config.endpoint,
    credentials: {
      accessKeyId: rfqR2Config.accessKeyId,
      secretAccessKey: rfqR2Config.secretAccessKey,
    },
  });
  return _client;
}

export function buildR2Key(filename, opts = {}) {
  const name = String(filename || `${crypto.randomUUID()}.jpg`).replace(/^\/+/, "");
  const prefix = rfqR2Config.keyPrefix;
  const sub = opts.subdir ? String(opts.subdir).replace(/^\/+|\/+$/g, "") : "";
  if (sub) return `${prefix}/${sub}/${name}`;
  return `${prefix}/${name}`;
}

export function buildR2PublicUrl(key) {
  const base = rfqR2Config.publicBaseUrl;
  if (!base) throw Object.assign(new Error("RFQ_R2_PUBLIC_BASE_URL_MISSING"), { status: 503 });
  const cleanKey = String(key || "").replace(/^\/+/, "");
  return `${base}/${cleanKey}`;
}

export async function uploadBufferToR2(buffer, opts = {}) {
  if (!rfqR2Ready()) {
    throw Object.assign(new Error("RFQ_R2_DISABLED"), { status: 503 });
  }
  if (!buffer?.length) {
    throw Object.assign(new Error("MISSING_FILE"), { status: 400 });
  }

  const key = opts.key || buildR2Key(opts.filename, { subdir: opts.subdir });
  const contentType = opts.contentType || "image/jpeg";

  await getClient().send(
    new PutObjectCommand({
      Bucket: rfqR2Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: opts.cacheControl || "public, max-age=31536000, immutable",
    }),
  );

  return {
    key,
    url: buildR2PublicUrl(key),
    byteSize: buffer.length,
  };
}

export async function deleteFromR2(key) {
  if (!rfqR2Ready() || !key) return { ok: false, skipped: true };
  const cleanKey = String(key).replace(/^\/+/, "");
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: rfqR2Config.bucket,
      Key: cleanKey,
    }),
  );
  return { ok: true, key: cleanKey };
}

export function rfqR2ServiceStatus() {
  return {
    enabled: rfqR2Config.enabled,
    configured: rfqR2Configured(),
    ready: rfqR2Ready(),
    bucket: rfqR2Config.bucket,
    endpoint: rfqR2Config.endpoint ? "[set]" : null,
    publicBaseUrl: rfqR2Config.publicBaseUrl || null,
    keyPrefix: rfqR2Config.keyPrefix,
  };
}
