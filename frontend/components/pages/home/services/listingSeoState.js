// Single Listing Identity owner.
//
// Pipeline:
//   ListingState(category, brand, model, year, location)
//     -> buildListingIdentity()
//     -> H1
//     -> URL (via buildListingPathCore)
//     -> SEO metadata/OG

function trimText(value) {
  return String(value || "").trim();
}

function normalizeCategoryName(value) {
  const raw = trimText(value);
  if (!raw) return "";
  const lower = raw.toLocaleLowerCase("vi-VN");
  return lower.charAt(0).toLocaleUpperCase("vi-VN") + lower.slice(1);
}

function normalizeListingState(input = {}) {
  return {
    categoryName: normalizeCategoryName(input.categoryName),
    hasCategory: Boolean(input.hasCategory),
    brand: trimText(input.brand),
    model: trimText(input.model),
    year: trimText(input.year),
    location: trimText(input.location),
  };
}

function buildListingH1(stateInput) {
  const state = normalizeListingState(stateInput);
  const { categoryName, hasCategory, brand, model, year, location } = state;

  if (!hasCategory && !brand && !model && !year && !location) {
    return "Phụ tùng ô tô chính hãng giá tốt";
  }

  if (!hasCategory && !brand && !model && !year && location) {
    return `Phụ tùng ô tô tại ${location}`;
  }

  if (hasCategory && !brand && !model && !year && !location) {
    return `${categoryName} ô tô`;
  }
  if (hasCategory && !brand && !model && !year && location) {
    return `${categoryName} ô tô tại ${location}`;
  }

  const parts = [hasCategory ? categoryName : "Phụ tùng"];
  if (brand) parts.push(brand);
  if (model) parts.push(model);
  if (year) parts.push(year);

  let h1 = parts.filter(Boolean).join(" ");
  if (location) h1 += ` tại ${location}`;
  return h1;
}

function buildListingIdentity(stateInput) {
  const state = normalizeListingState(stateInput);
  return {
    ...state,
    h1: buildListingH1(state),
  };
}

function buildPageTitle(stateInput) {
  return buildListingIdentity(stateInput).h1;
}

// CommonJS export for test runner compatibility
module.exports = {
  buildPageTitle,
  buildListingH1,
  buildListingIdentity,
};
