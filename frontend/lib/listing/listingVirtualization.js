/** Enable client windowing only when a page has enough cards to matter. */
export const LISTING_VIRTUAL_MIN_ITEMS = 24;

/** Visible window ± overscan (target 4–8). */
export const LISTING_VIRTUAL_OVERSCAN = 6;

/** Estimated row height for home marketplace list cards (px). */
export const LISTING_VIRTUAL_LIST_ROW_PX = 132;

/** Gap between home list rows — matches `.of-product-list { gap: 10px }`. */
export const LISTING_VIRTUAL_LIST_GAP_PX = 10;

/** Estimated storefront grid row height (square thumb + meta). */
export const LISTING_VIRTUAL_GRID_ROW_PX = 228;

/** Gap between storefront grid rows (tailwind gap-2/3). */
export const LISTING_VIRTUAL_GRID_GAP_PX = 12;
