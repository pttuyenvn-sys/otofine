export const SHOP_INBOX_STATUS_FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "unread", label: "Chưa đọc" },
  { id: "waiting", label: "Chờ báo giá" },
  { id: "quoted", label: "Đã báo giá" },
  { id: "expired", label: "Hết hạn / trễ" },
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
