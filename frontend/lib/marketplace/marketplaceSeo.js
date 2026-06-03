export function displayFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

export function rowName(row) {
  return String(row?.canonical_name || row?.category_name || row?.name || row?.brand || row || "").trim();
}

export function buildDbBackedPageTitle(state = {}) {
  const categoryName =
    String(state.categoryName || state.category || "").trim() || "";
  const hasCategory =
    state.hasCategory != null
      ? Boolean(state.hasCategory)
      : Boolean(categoryName);
  const brand = String(state.brand || "").trim();
  const model = String(state.model || "").trim();
  const year = String(state.year || "").trim();
  const loc = String(state.locationName || state.location || "").trim();

  if (!hasCategory && !brand && !model && !year && !loc) {
    return "Phụ tùng ô tô chính hãng giá tốt";
  }

  if (hasCategory && !brand && !model && !year && !loc) {
    return `${categoryName} ô tô`;
  }

  const parts = [hasCategory ? categoryName : "Phụ tùng"];
  if (brand) parts.push(brand);
  if (model) parts.push(model);
  if (year) parts.push(year);

  let title = parts.filter(Boolean).join(" ");
  if (loc) title += ` tại ${loc}`;
  return title;
}
