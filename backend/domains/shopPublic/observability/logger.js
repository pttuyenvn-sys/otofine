/**
 * Structured, line-oriented `[shopsite]` logger.
 *
 * Output shape (single line, easy to grep):
 *   [shopsite] event=<event> key1=val1 key2="quoted val" ms=<dur>
 *
 * Why not pino/winston:
 *   - Single-process PM2 already pipes stdout to log files, structured
 *     enough for grep + jq via a 5-line awk pipeline if needed.
 *   - Avoids pulling another transitive dep tree into the hot path.
 *   - Keeps the field set explicit — nothing creeps in.
 *
 * Sensitive data policy: NEVER log full bodies, never JWTs, never raw
 * headers. Slug, shop id, IP first octet, durations only.
 */

const SENSITIVE_KEYS = new Set([
  "password", "token", "jwt", "authorization", "secret",
  "cookie", "set-cookie", "apikey", "api_key",
]);

function fmt(value) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const s = String(value);
  if (s.length === 0) return '""';
  // Quote when needed (whitespace or = or ").
  if (/[\s="]/.test(s)) {
    const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped.length > 200 ? escaped.slice(0, 197) + "..." : escaped}"`;
  }
  return s.length > 200 ? s.slice(0, 197) + "..." : s;
}

/**
 * Anonymize an IP: keep enough info to spot patterns (first two octets
 * for IPv4, first 4 hex groups for IPv6) without retaining a
 * personally-identifiable address.
 */
export function anonymizeIp(ip) {
  if (!ip) return null;
  const s = String(ip).trim();
  if (!s) return null;
  if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  }
  if (s.includes(":")) {
    const parts = s.split(":").filter(Boolean);
    return parts.slice(0, 4).join(":") + "::xxxx";
  }
  return "anon";
}

function emit(level, event, fields = {}) {
  const parts = [`event=${event}`];
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) continue;
    parts.push(`${k}=${fmt(v)}`);
  }
  const line = `[shopsite] ${parts.join(" ")}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const shopsiteLog = {
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields),
};

/** Convenience: wrap an async fn and time it; emits `dur_ms`. */
export async function withTiming(label, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    shopsiteLog.info(label, { ok: true, dur_ms: Date.now() - t });
    return r;
  } catch (err) {
    shopsiteLog.error(label, { ok: false, dur_ms: Date.now() - t, msg: err?.message || "err" });
    throw err;
  }
}
