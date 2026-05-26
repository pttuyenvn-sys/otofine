const STORAGE_KEY = "rfq_history_session_v1";
const LAST_PHONE_KEY = "rfq_history_last_phone";

function readSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveHistorySession({ historyToken, expiresAt, phoneMasked, lastPhone }) {
  if (typeof window === "undefined") return;
  const token = String(historyToken || "").trim();
  if (!token) return;

  const payload = {
    token,
    expiresAt: expiresAt || null,
    phoneMasked: phoneMasked || null,
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    const phone = String(lastPhone || "").trim();
    if (phone) {
      window.localStorage.setItem(LAST_PHONE_KEY, phone);
    }
  } catch {
    /* quota / private mode */
  }
}

/** Last phone used for history login or RFQ create — local autofill only. */
export function getHistoryLastPhone() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LAST_PHONE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveHistoryLastPhone(phone) {
  if (typeof window === "undefined") return;
  const p = String(phone || "").trim();
  if (!p) return;
  try {
    window.localStorage.setItem(LAST_PHONE_KEY, p);
  } catch {
    /* ignore */
  }
}

export function getHistorySession() {
  const row = readSession();
  if (!row?.token) return null;

  if (row.expiresAt) {
    const exp = new Date(row.expiresAt).getTime();
    if (Number.isFinite(exp) && exp <= Date.now()) {
      clearHistorySession();
      return null;
    }
  }

  return row;
}

export function getHistoryToken() {
  return getHistorySession()?.token || null;
}

export function clearHistorySession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function historySessionHeaders() {
  const token = getHistoryToken();
  if (!token) return {};
  return { "X-RFQ-History-Token": token };
}
