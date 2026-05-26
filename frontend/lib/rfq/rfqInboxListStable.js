/** Stable inbox list merge/snapshot — render-only; does not change API sort param. */

export function normalizeInboxTs(v) {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v;
  try {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  } catch {
    /* fall through */
  }
  try {
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return String(v);
    return d.toISOString();
  } catch {
    return String(v);
  }
}

export function inboxRowFingerprint(row) {
  if (!row) return "";
  return [
    row.id,
    normalizeInboxTs(row.updated_at),
    row.status ?? "",
    row.rfq_status ?? "",
    normalizeInboxTs(row.first_viewed_at),
    row.message_unread_count ?? 0,
    row.last_message_type ?? "",
    row.last_message_text ?? "",
    row.last_message_sender_type ?? "",
    row.has_submitted_quote ?? "",
    row.last_message_preview ?? "",
    row.needs_shop_response ?? "",
  ].join(":");
}

function fingerprintMultiset(rows) {
  return rows
    .map(inboxRowFingerprint)
    .sort()
    .join("|");
}

export function multisetFingerprintsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return fingerprintMultiset(a) === fingerprintMultiset(b);
}

/** Deterministic tie-break when activity timestamps match. */
export function compareInboxActivity(a, b) {
  const ta = Date.parse(normalizeInboxTs(a?.updated_at)) || 0;
  const tb = Date.parse(normalizeInboxTs(b?.updated_at)) || 0;
  if (tb !== ta) return tb - ta;
  return Number(b?.id ?? 0) - Number(a?.id ?? 0);
}

export function sortInboxRowsByActivity(rows) {
  return [...rows].sort(compareInboxActivity);
}

/**
 * Merge polled rows: preserve object refs + list order when data unchanged.
 * Reorder only when row fingerprints actually change (real activity change).
 */
export function mergeInboxRows(prevRows, incomingRows) {
  const prev = prevRows || [];
  const incoming = incomingRows || [];
  if (!incoming.length) return [];
  if (!prev.length) return incoming;

  const prevById = new Map(prev.map((r) => [Number(r.id), r]));

  const mergeOne = (inc) => {
    const old = prevById.get(Number(inc.id));
    if (old && inboxRowFingerprint(old) === inboxRowFingerprint(inc)) return old;
    return inc;
  };

  const mergedIncoming = incoming.map(mergeOne);
  const prevIds = prev.map((r) => Number(r.id)).join(",");
  const incomingIds = incoming.map((r) => Number(r.id)).join(",");

  if (multisetFingerprintsEqual(prev, incoming)) {
    if (prevIds !== incomingIds) {
      const byId = new Map(mergedIncoming.map((r) => [Number(r.id), r]));
      const stableOrder = prev.filter((r) => byId.has(Number(r.id))).map((r) => byId.get(Number(r.id)));
      if (stableOrder.every((r, i) => r === prev[i])) return prev;
      return stableOrder;
    }
    if (mergedIncoming.every((r, i) => r === prev[i])) return prev;
    return mergedIncoming;
  }

  return mergedIncoming;
}

export function inboxListsIdentical(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function buildInboxSnapshot(rows, unreadCount, messageUnreadTotal = 0) {
  const canonical = [...rows]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((r) => `${r.id}=${inboxRowFingerprint(r)}`)
    .join("|");
  return `${unreadCount}:${messageUnreadTotal}#${canonical}`;
}

export function mergeInboxLoadMore(prevRows, newRows) {
  const prev = prevRows || [];
  const incoming = newRows || [];
  if (!incoming.length) return prev;

  const prevById = new Map(prev.map((r) => [Number(r.id), r]));
  const mergedNew = incoming.map((inc) => {
    const old = prevById.get(Number(inc.id));
    if (old && inboxRowFingerprint(old) === inboxRowFingerprint(inc)) return old;
    return inc;
  });

  const seen = new Set(prev.map((r) => Number(r.id)));
  const appended = mergedNew.filter((r) => {
    const id = Number(r.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return appended.length ? [...prev, ...appended] : prev;
}
