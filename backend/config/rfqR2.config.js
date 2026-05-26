/**
 * RFQ-dedicated R2 settings — separate bucket from product catalog R2.
 *
 * Uses RFQ_R2_* env prefix so R2_BUCKET / R2_KEY_ID (products) are never overwritten.
 */
import dotenv from "dotenv";

dotenv.config({ quiet: true });

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

export const rfqR2Config = {
  /** Master switch — uploads fail closed when false */
  enabled: envBool("RFQ_R2_ENABLED", false),
  endpoint: String(process.env.RFQ_R2_ENDPOINT || process.env.R2_ENDPOINT || "").trim(),
  bucket: String(process.env.RFQ_R2_BUCKET || "otofine-rfq").trim(),
  accessKeyId: String(
    process.env.RFQ_R2_ACCESS_KEY_ID || process.env.R2_KEY_ID || "",
  ).trim(),
  secretAccessKey: String(
    process.env.RFQ_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET || "",
  ).trim(),
  publicBaseUrl: String(process.env.RFQ_R2_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  keyPrefix: String(process.env.RFQ_R2_KEY_PREFIX || "rfq").replace(/^\/+|\/+$/g, ""),
};

export function getRfqR2MissingEnv() {
  const missing = [];

  if (!rfqR2Config.endpoint) {
    missing.push("RFQ_R2_ENDPOINT (or fallback R2_ENDPOINT)");
  }
  if (!rfqR2Config.bucket) {
    missing.push("RFQ_R2_BUCKET");
  }
  if (!rfqR2Config.accessKeyId) {
    missing.push("RFQ_R2_ACCESS_KEY_ID (or fallback R2_KEY_ID)");
  }
  if (!rfqR2Config.secretAccessKey) {
    missing.push("RFQ_R2_SECRET_ACCESS_KEY (or fallback R2_SECRET)");
  }
  if (!rfqR2Config.publicBaseUrl) {
    missing.push("RFQ_R2_PUBLIC_BASE_URL");
  }

  return missing;
}

export function getRfqR2ConfigDiagnostics() {
  const missing = getRfqR2MissingEnv();
  return {
    configured: missing.length === 0,
    missing,
    flags: {
      RFQ_R2_ENABLED: rfqR2Config.enabled,
    },
    resolved: {
      endpoint_set: Boolean(rfqR2Config.endpoint),
      endpoint_source: process.env.RFQ_R2_ENDPOINT
        ? "RFQ_R2_ENDPOINT"
        : process.env.R2_ENDPOINT
          ? "R2_ENDPOINT"
          : null,
      bucket: rfqR2Config.bucket,
      access_key_set: Boolean(rfqR2Config.accessKeyId),
      access_key_source: process.env.RFQ_R2_ACCESS_KEY_ID
        ? "RFQ_R2_ACCESS_KEY_ID"
        : process.env.R2_KEY_ID
          ? "R2_KEY_ID"
          : null,
      secret_set: Boolean(rfqR2Config.secretAccessKey),
      secret_source: process.env.RFQ_R2_SECRET_ACCESS_KEY
        ? "RFQ_R2_SECRET_ACCESS_KEY"
        : process.env.R2_SECRET
          ? "R2_SECRET"
          : null,
      public_base_url: rfqR2Config.publicBaseUrl || null,
      key_prefix: rfqR2Config.keyPrefix,
    },
    ready: rfqR2Ready(),
  };
}

export function rfqR2Configured() {
  return getRfqR2MissingEnv().length === 0;
}

/** R2 upload pipeline active */
export function rfqR2Ready() {
  return rfqR2Config.enabled && rfqR2Configured();
}
