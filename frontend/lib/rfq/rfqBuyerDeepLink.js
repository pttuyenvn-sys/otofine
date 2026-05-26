const SESSION_KEY = "rfq_push_dispatch_id";

/** Parse dispatchId from query string or hash fallback (#dispatch-178). */
export function parseDeepLinkDispatchId(searchParams) {
  if (typeof window === "undefined" && !searchParams) return null;

  const fromQuery = Number(searchParams?.get?.("dispatchId"));
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;

  if (typeof window !== "undefined") {
    const hash = window.location.hash || "";
    const m = hash.match(/^#dispatch-(\d+)$/);
    if (m) {
      const fromHash = Number(m[1]);
      if (Number.isFinite(fromHash) && fromHash > 0) return fromHash;
    }

    try {
      const stored = Number(sessionStorage.getItem(SESSION_KEY));
      if (Number.isFinite(stored) && stored > 0) return stored;
    } catch {
      /* ignore */
    }
  }

  return null;
}

/** Persist deep-link target for mobile clients that drop query params on open. */
export function persistDeepLinkDispatchId(dispatchId) {
  if (typeof window === "undefined") return;
  const id = Number(dispatchId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    sessionStorage.setItem(SESSION_KEY, String(id));
  } catch {
    /* ignore */
  }
}

export function clearPersistedDeepLinkDispatchId() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
