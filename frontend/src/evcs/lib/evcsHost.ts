/**
 * EVCS host routing — edge-safe (no fs, no DB).
 *
 * Public URLs on tramsacvinfast.otofine.com rewrite to internal /evcs/*
 * so marketplace app/page.js keeps apex `/` without conflict.
 */

/** Internal Next.js path prefix — not exposed in browser on EVCS host. */
export const EVCS_INTERNAL_PREFIX = "/evcs";

/**
 * Public path → internal rewrite target.
 * Browser URL stays on the public path (NextResponse.rewrite).
 */
export const EVCS_ROUTE_MAP: Record<string, string> = {
  "/": `${EVCS_INTERNAL_PREFIX}`,
  "/giai-phap": `${EVCS_INTERNAL_PREFIX}/giai-phap`,
  "/trung-tam-dau-tu": `${EVCS_INTERNAL_PREFIX}/trung-tam-dau-tu`,
  "/hoc-vien-ev": `${EVCS_INTERNAL_PREFIX}/hoc-vien-ev`,
  "/du-an": `${EVCS_INTERNAL_PREFIX}/du-an`,
  "/lien-he": `${EVCS_INTERNAL_PREFIX}/lien-he`,
  "/ban-do-tram-sac": `${EVCS_INTERNAL_PREFIX}/ban-do-tram-sac`,
};

export function stripPort(host: string): string {
  if (!host) return "";
  const idx = host.indexOf(":");
  return (idx === -1 ? host : host.slice(0, idx)).toLowerCase().trim();
}

export function getEvcsSiteHost(): string {
  return (
    process.env.EVCS_SITE_HOST || "tramsacvinfast.otofine.com"
  ).toLowerCase();
}

function isEvcsDevEnabled(): boolean {
  const raw = String(process.env.EVCS_DEV_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * True when request should receive EVCS rewrites.
 */
export function isEvcsHost(host: string): boolean {
  const h = stripPort(host);
  if (h === getEvcsSiteHost()) return true;
  if (isEvcsDevEnabled() && DEV_HOSTS.has(h)) return true;
  return false;
}

/**
 * Normalize pathname for route lookup (no trailing slash except root).
 */
export function normalizeEvcsPublicPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/$/, "") || "/";
}

/**
 * Resolve internal rewrite path for a public EVCS URL.
 * @returns internal path or null if not an EVCS public route
 */
export function resolveEvcsInternalPath(pathname: string): string | null {
  const key = normalizeEvcsPublicPath(pathname);
  return EVCS_ROUTE_MAP[key] ?? null;
}

/** Paths that must never be rewritten (passthrough on EVCS host). */
export function isEvcsPassthroughPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/assets/")
  );
}

/**
 * Active-state helper: compare browser pathname to nav href.
 */
export function isEvcsNavActive(
  browserPath: string,
  href: string,
): boolean {
  const current = normalizeEvcsPublicPath(browserPath);
  const target = normalizeEvcsPublicPath(href);
  return current === target;
}
