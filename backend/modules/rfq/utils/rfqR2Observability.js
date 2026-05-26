/**
 * RFQ R2 observability — primary upload metrics + startup diagnostics.
 */
import {
  rfqR2Config,
  rfqR2Configured,
  rfqR2Ready,
  getRfqR2ConfigDiagnostics,
  getRfqR2MissingEnv,
} from "../../../config/rfqR2.config.js";
import { rfqCounterInc, getRfqCountersSnapshot } from "../services/rfqObservability.service.js";
import { rfqLog } from "./rfqLogger.js";

export const RFQ_R2_COUNTER = {
  UPLOADS_TOTAL: "rfq_r2_uploads_total",
  PRIMARY_UPLOADED: "rfq_r2_primary_uploaded",
  PRIMARY_FAILED: "rfq_r2_primary_failed",
};

export function rfqR2DebugEnabled() {
  const raw = process.env.RFQ_R2_DEBUG ?? process.env.RFQ_DEBUG_UPLOAD;
  if (raw == null || raw === "") return false;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

export function logRfqR2StartupConfig() {
  const diagnostics = getRfqR2ConfigDiagnostics();
  const missing = getRfqR2MissingEnv();
  const ready = rfqR2Ready();

  const lines = [
    `RFQ R2 enabled: ${rfqR2Config.enabled}`,
    `RFQ R2 configured: ${rfqR2Configured()}`,
    `RFQ R2 ready: ${ready}`,
    `RFQ R2 bucket: ${rfqR2Config.bucket}`,
    `RFQ R2 public base: ${rfqR2Config.publicBaseUrl || "(unset)"}`,
  ];
  for (const line of lines) {
    console.info(`[RFQ R2] ${line}`);
  }

  if (missing.length) {
    for (const envName of missing) {
      console.warn(`[RFQ R2] missing env: ${envName}`);
    }
    if (rfqR2Config.enabled) {
      console.warn("[RFQ R2] enabled but config incomplete — uploads will fail with 503");
    }
  }

  rfqLog.info("rfq.r2.startup", {
    enabled: rfqR2Config.enabled,
    configured: rfqR2Configured(),
    ready,
    bucket: rfqR2Config.bucket,
    public_base_url: rfqR2Config.publicBaseUrl || null,
    key_prefix: rfqR2Config.keyPrefix,
    debug: rfqR2DebugEnabled(),
    missing_env: missing,
    resolved_sources: diagnostics.resolved,
  });
}

export function getRfqR2MetricsSnapshot() {
  const all = getRfqCountersSnapshot();
  return {
    at: all.at,
    uploads_total: all[RFQ_R2_COUNTER.UPLOADS_TOTAL] || 0,
    primary_uploaded: all[RFQ_R2_COUNTER.PRIMARY_UPLOADED] || 0,
    primary_failed: all[RFQ_R2_COUNTER.PRIMARY_FAILED] || 0,
    ready: rfqR2Ready(),
    configured: rfqR2Configured(),
    missing_env: getRfqR2MissingEnv(),
  };
}

export function recordRfqPrimaryUploaded(fields = {}) {
  rfqCounterInc(RFQ_R2_COUNTER.UPLOADS_TOTAL);
  rfqCounterInc(RFQ_R2_COUNTER.PRIMARY_UPLOADED);
  rfqLog.info("rfq.r2.primary.uploaded", fields);
  if (rfqR2DebugEnabled()) {
    rfqLog.info("rfq.r2.debug.primary.success", fields);
  }
}

export function recordRfqPrimaryFailed(fields = {}) {
  rfqCounterInc(RFQ_R2_COUNTER.PRIMARY_FAILED);
  rfqLog.warn("rfq.r2.primary.failed", fields);
  if (rfqR2DebugEnabled()) {
    rfqLog.warn("rfq.r2.debug.primary.failed", fields);
  }
}
