/** Human-readable submit gate for RFQ create form. */
export const RFQ_SUBMIT_BLOCK_LABELS = {
  submitting: "Đang gửi yêu cầu…",
  uploading: "Đang tải ảnh — vui lòng đợi xong trước khi tiếp tục.",
  upload_failed: "Có ảnh tải lên thất bại — thử lại hoặc xóa ảnh lỗi.",
  invalid_form: "Kiểm tra SĐT, mô tả và thông tin xe (bấm vào từng mục có lỗi).",
  pending_draft: "Đang tạo yêu cầu nháp — thử lại sau vài giây.",
};

/**
 * @deprecated Prefer evaluateRfqCreateSubmitGate + uploadStatus from useRfqImageUpload
 */
export function getRfqCreateSubmitBlockReason({
  busy,
  validationValid,
  hasUploading,
  hasErrors,
  draftPending,
}) {
  if (busy) return "submitting";
  if (typeof hasUploading === "function" ? hasUploading() : hasUploading) return "uploading";
  if (typeof hasErrors === "function" ? hasErrors() : hasErrors) return "upload_failed";
  if (draftPending) return "pending_draft";
  if (!validationValid) return "invalid_form";
  return null;
}
