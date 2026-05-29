/** Seller product governance — lifecycle + visibility labels (mirrors backend). */

export const LIFECYCLE_TABS = [
  { key: "all", label: "Tất cả" },
  { key: "published", label: "Đang bán" },
  { key: "pending_review", label: "Chờ duyệt" },
  { key: "rejected", label: "Bị từ chối" },
  { key: "hidden", label: "Đã ẩn" },
  { key: "archived", label: "Lưu trữ" },
];

export const LIFECYCLE_META = {
  pending_review: { label: "Chờ duyệt", color: "#92400e", bg: "#fef3c7", border: "#fde68a" },
  published: { label: "Đang bán", color: "#166534", bg: "#dcfce7", border: "#bbf7d0" },
  rejected: { label: "Bị từ chối", color: "#991b1b", bg: "#fee2e2", border: "#fecaca" },
  hidden: { label: "Đã ẩn", color: "#374151", bg: "#e5e7eb", border: "#d1d5db" },
  archived: { label: "Lưu trữ", color: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
  deleted: { label: "Đã xóa", color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
  out_of_stock: { label: "Hết hàng", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  draft: { label: "Nháp", color: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
};

export const VISIBILITY_META = {
  public: { label: "Hiển thị công khai", color: "#166534", bg: "#ecfdf5", border: "#bbf7d0" },
  hidden: { label: "Không hiển thị", color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
};

export function getLifecycleMeta(product) {
  if (product?.lifecycleMeta) return product.lifecycleMeta;
  const key = product?.sellerLifecycle || "draft";
  return LIFECYCLE_META[key] || LIFECYCLE_META.draft;
}

export function getVisibilityMeta(product) {
  if (product?.visibilityMeta) return product.visibilityMeta;
  const key = product?.visibility || "hidden";
  return VISIBILITY_META[key] || VISIBILITY_META.hidden;
}

export function formatRejectTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("vi-VN");
  } catch {
    return String(value);
  }
}
