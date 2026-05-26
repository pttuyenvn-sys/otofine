const PREFS_KEY = "rfq_buyer_push_prefs_v1";

const DEFAULT_PREFS = {
  messages: true,
  quotes: true,
  reminders: true,
};

export function getBuyerPushPreferences() {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      messages: parsed?.messages !== false,
      quotes: parsed?.quotes !== false,
      reminders: parsed?.reminders !== false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveBuyerPushPreferences(prefs) {
  if (typeof window === "undefined") return;
  const next = {
    messages: prefs?.messages !== false,
    quotes: prefs?.quotes !== false,
    reminders: prefs?.reminders !== false,
  };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
