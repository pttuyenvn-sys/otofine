/**
 * SEARCH-INDEX-POPUP-RUNTIME-01 — popup preview reads index documents (default off).
 */

export function isSearchPopupIndexEnabled() {
  const raw = String(process.env.SEARCH_POPUP_INDEX ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
