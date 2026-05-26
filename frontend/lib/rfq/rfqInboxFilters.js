export const SHOP_INBOX_STATUS_FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "unread", label: "Chưa đọc" },
  { id: "waiting", label: "Chờ báo giá" },
  { id: "quoted", label: "Đã báo giá" },
  // Storefront-seller refine v2: shorten the longest label so the
  // mobile chip row fits two compact rows without truncation.
  { id: "expired", label: "Hết hạn" },
];

export function buildInboxQueryParams({
  filter,
  sort,
  limit,
  offset,
  brand,
  model,
  year,
  categoryKey,
}) {
  const params = { filter, sort, limit, offset };
  if (brand?.trim()) params.brand = brand.trim();
  if (model?.trim()) params.model = model.trim();
  if (year?.trim()) params.year = year.trim();
  if (categoryKey?.trim()) params.categoryKey = categoryKey.trim();
  return params;
}
