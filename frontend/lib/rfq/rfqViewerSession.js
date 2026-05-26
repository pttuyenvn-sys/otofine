const STORAGE_KEY = "rfq_viewer_sessions_v1";
const MAX_ENTRIES = 24;

function readMap() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

/** Persist verified viewer token for this RFQ public id (same device re-entry). */
export function saveViewerSession(publicId, viewerToken) {
  const pid = String(publicId || "").trim();
  const tok = String(viewerToken || "").trim();
  if (!pid || !tok) return;

  const map = readMap();
  map[pid] = { token: tok, savedAt: Date.now() };
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (map[a]?.savedAt || 0) - (map[b]?.savedAt || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => {
        delete map[k];
      });
  }
  writeMap(map);

  try {
    window.sessionStorage.setItem("rfq_viewer_token", tok);
  } catch {
    /* ignore */
  }
}

export function getStoredViewerToken(publicId) {
  const pid = String(publicId || "").trim();
  if (!pid) return null;
  const row = readMap()[pid];
  const tok = row?.token ? String(row.token).trim() : "";
  return tok || null;
}

export function clearStoredViewerSession(publicId) {
  const pid = String(publicId || "").trim();
  if (!pid) return;
  const map = readMap();
  if (!map[pid]) return;
  delete map[pid];
  writeMap(map);
}
