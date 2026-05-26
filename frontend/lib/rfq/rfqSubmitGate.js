import { RFQ_SUBMIT_BLOCK_LABELS } from "@/lib/rfq/rfqSubmitBlockReason";

/**
 * Single source of truth for RFQ create submit gating (button + handler).
 */
export function evaluateRfqCreateSubmitGate({
  busy,
  validation,
  uploadStatus,
  draftPending,
}) {
  const errors = validation?.errors || {};
  const blockers = [];

  if (busy) blockers.push({ code: "submitting", label: RFQ_SUBMIT_BLOCK_LABELS.submitting });
  if (uploadStatus?.hasUploading) {
    blockers.push({ code: "uploading", label: RFQ_SUBMIT_BLOCK_LABELS.uploading });
  }
  if (uploadStatus?.hasErrors) {
    blockers.push({ code: "upload_failed", label: RFQ_SUBMIT_BLOCK_LABELS.upload_failed });
  }
  if (draftPending) {
    blockers.push({ code: "pending_draft", label: RFQ_SUBMIT_BLOCK_LABELS.pending_draft });
  }
  if (!validation?.valid) {
    blockers.push({ code: "invalid_form", label: RFQ_SUBMIT_BLOCK_LABELS.invalid_form });
  }

  const primary = blockers[0] || null;

  return {
    canSubmit: blockers.length === 0,
    primaryBlocker: primary,
    blockers,
    errors,
    normalized: validation?.valid ? validation.normalized : null,
  };
}

export function logRfqCreateSubmitDebug(label, payload) {
  if (typeof window === "undefined") return;
  const on =
    window.sessionStorage?.getItem("rfq_debug_submit") === "1" ||
    process.env.NODE_ENV !== "production";
  if (!on) return;
  console.info(`[rfq-create-submit] ${label}`, payload);
}
