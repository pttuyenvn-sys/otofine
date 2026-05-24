import { shopsiteLog, anonymizeIp } from "./logger.js";

/**
 * Lightweight bot / scraper detection for the public shopsite.
 *
 * Phase: observability only. We NEVER block; we only log so the ops
 * team can plot dashboards and decide later whether a hard block is
 * justified.
 *
 * Signals we look for:
 *
 *   A. Known scraper User-Agent strings (curl/wget/python-urllib/
 *      scrapy/HTTPie/etc.). Browsers don't ship these.
 *      → log `storefront.bot-suspected reason=ua` on every request.
 *
 *   B. High 404 ratio inside a sliding window (slug enumeration).
 *      → log `storefront.bot-suspected reason=404-scan` when an IP's
 *      404 count crosses `SCAN_404_THRESHOLD` inside `SCAN_WINDOW_MS`.
 *      The signal is per-IP, not per-slug, so a single IP enumerating
 *      "shop1", "shop2", "shop3"… gets flagged after a handful.
 *
 *   C. Sustained crawl rate (any tier).
 *      → log `storefront.bot-suspected reason=hot-rate` when an IP's
 *      total request rate stays over `HOT_RATE_PER_MIN` for two
 *      consecutive windows.
 *
 * Each detector throttles its own log output so a single misbehaving
 * IP can't flood the log file: each (ip, reason) tuple emits at most
 * once per `LOG_COOLDOWN_MS`.
 *
 * Process-local maps. Memory ceiling = `MAX_IPS` (LRU-trimmed).
 */
const SCAN_WINDOW_MS = 60_000;
const SCAN_404_THRESHOLD = 8;
const HOT_RATE_PER_MIN = 240;
const LOG_COOLDOWN_MS = 30_000;
const MAX_IPS = 5_000;

const ipState = new Map();
const lastLogAt = new Map();

const BOT_UA_RE = new RegExp(
  [
    "curl",
    "wget",
    "python-urllib",
    "python-requests",
    "go-http-client",
    "java/",
    "okhttp",
    "scrapy",
    "httpie",
    "node-fetch",
    "axios/",
    "phantomjs",
    "headlesschrome",
    "puppeteer",
    "playwright",
    "ahrefsbot",
    "semrushbot",
    "mj12bot",
    "dotbot",
    "blexbot",
    "petalbot",
    "seznambot",
  ].join("|"),
  "i",
);

const ALLOW_BOT_UA_RE = new RegExp(
  [
    // Search engines we *want* to crawl us once Phase 5.5 indexing
    // flips on. They're observable but never marked as suspicious.
    "googlebot",
    "bingbot",
    "duckduckbot",
    "applebot",
    "yandexbot",
    "facebookexternalhit",
    "twitterbot",
    "linkedinbot",
    "zalo",
    "telegrambot",
    "whatsapp",
    "slackbot",
  ].join("|"),
  "i",
);

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || req.connection?.remoteAddress || "unknown";
}

function ensureState(ip) {
  let s = ipState.get(ip);
  const now = Date.now();
  if (!s || now - s.startedAt > SCAN_WINDOW_MS) {
    s = {
      startedAt: now,
      reqs: 0,
      notFound: 0,
      prevReqs: s?.reqs || 0,
    };
    if (ipState.size > MAX_IPS) trimIpState();
    ipState.set(ip, s);
  }
  return s;
}

function trimIpState() {
  // O(n) LRU trim — drop the oldest 10% by `startedAt`.
  const arr = Array.from(ipState.entries()).sort(
    (a, b) => a[1].startedAt - b[1].startedAt,
  );
  const drop = Math.max(1, Math.floor(arr.length * 0.1));
  for (let i = 0; i < drop; i++) ipState.delete(arr[i][0]);
}

function maybeLog(ip, reason, fields) {
  const key = `${ip}|${reason}`;
  const now = Date.now();
  const last = lastLogAt.get(key) || 0;
  if (now - last < LOG_COOLDOWN_MS) return;
  lastLogAt.set(key, now);
  shopsiteLog.warn("storefront.bot-suspected", {
    reason,
    ip: anonymizeIp(ip),
    ...fields,
  });
}

/**
 * Called by the publicShop controller AFTER each request resolves
 * with a status code. Pure observability — never throws, never
 * blocks the response.
 */
export function recordPublicRequest(req, res) {
  try {
    const ip = clientIp(req);
    const ua = String(req.headers["user-agent"] || "");
    const status = res.statusCode || 0;
    const s = ensureState(ip);
    s.reqs += 1;
    if (status === 404) s.notFound += 1;

    // (A) Known scraper UA, but skip the allow-list (real search bots).
    if (BOT_UA_RE.test(ua) && !ALLOW_BOT_UA_RE.test(ua)) {
      maybeLog(ip, "ua", { ua: ua.slice(0, 80), path: req.path, status });
    }

    // (B) Slug enumeration: many 404s inside a single window.
    if (s.notFound >= SCAN_404_THRESHOLD) {
      maybeLog(ip, "404-scan", {
        not_found: s.notFound,
        reqs: s.reqs,
        window_ms: SCAN_WINDOW_MS,
        path: req.path,
      });
    }

    // (C) Hot rate sustained across two consecutive windows.
    if (s.prevReqs >= HOT_RATE_PER_MIN && s.reqs >= HOT_RATE_PER_MIN) {
      maybeLog(ip, "hot-rate", { reqs: s.reqs, prev_reqs: s.prevReqs, path: req.path });
    }
  } catch (_) {
    // Observability NEVER breaks the response path.
  }
}

/**
 * Snapshot for the cache-debug endpoint.
 */
export function getAbuseStats() {
  const now = Date.now();
  const top = [];
  for (const [ip, s] of ipState) {
    top.push({
      ip: anonymizeIp(ip),
      reqs: s.reqs,
      not_found: s.notFound,
      window_age_ms: now - s.startedAt,
    });
  }
  top.sort((a, b) => b.reqs - a.reqs);
  return {
    window_ms: SCAN_WINDOW_MS,
    threshold_404_scan: SCAN_404_THRESHOLD,
    threshold_hot_rate: HOT_RATE_PER_MIN,
    log_cooldown_ms: LOG_COOLDOWN_MS,
    tracked_ips: ipState.size,
    top: top.slice(0, 20),
  };
}

/** For tests + ops. */
export function _resetAbuseDetector() {
  ipState.clear();
  lastLogAt.clear();
}
