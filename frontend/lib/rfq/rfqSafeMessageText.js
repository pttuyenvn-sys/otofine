/**
 * Safe RFQ message rendering — no HTML injection; http(s) links only.
 */

const URL_RE =
  /https?:\/\/[^\s<>"']+/gi;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Split text into plain + link segments for React rendering. */
export function parseMessageTextSegments(text) {
  const raw = String(text ?? "");
  if (!raw) return [];

  const segments = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match;

  while ((match = re.exec(raw)) !== null) {
    const urlRaw = match[0].replace(/[.,;:!?)]+$/, "");
    const trail = match[0].slice(urlRaw.length);
    const start = match.index;

    if (start > last) {
      segments.push({ type: "text", value: raw.slice(last, start) });
    }

    const safe = sanitizeUrl(urlRaw);
    if (safe) {
      segments.push({ type: "link", href: safe, label: shortenUrl(safe) });
    } else {
      segments.push({ type: "text", value: urlRaw });
    }

    if (trail) segments.push({ type: "text", value: trail });
    last = match.index + match[0].length;
  }

  if (last < raw.length) {
    segments.push({ type: "text", value: raw.slice(last) });
  }

  return segments.length ? segments : [{ type: "text", value: raw }];
}

export function sanitizeUrl(urlRaw) {
  try {
    const u = new URL(urlRaw);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

function shortenUrl(href, max = 48) {
  try {
    const u = new URL(href);
    const label = u.hostname + u.pathname.replace(/\/$/, "");
    if (label.length <= max) return label;
    return `${label.slice(0, max - 1)}…`;
  } catch {
    return href.length > max ? `${href.slice(0, max - 1)}…` : href;
  }
}
