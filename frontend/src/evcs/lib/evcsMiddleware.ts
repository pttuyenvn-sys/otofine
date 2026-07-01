import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  EVCS_INTERNAL_PREFIX,
  isEvcsHost,
  isEvcsPassthroughPath,
  resolveEvcsInternalPath,
} from "@evcs/lib/evcsHost";

function logEvcs(event: string, fields: Record<string, string | undefined>) {
  const parts = [`event=${event}`];
  for (const [k, v] of Object.entries(fields)) {
    if (!v) continue;
    parts.push(`${k}=${v}`);
  }
  console.info(`[evcs] ${parts.join(" ")}`);
}

/**
 * Block direct access to /evcs/* on non-EVCS hosts (apex marketplace).
 */
export function guardEvcsInternalPaths(
  host: string,
  pathname: string,
): NextResponse | null {
  if (!pathname.startsWith(EVCS_INTERNAL_PREFIX)) return null;
  if (isEvcsHost(host)) return null;

  logEvcs("middleware.block-internal", { path: pathname, host });
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "X-Robots-Tag": "noindex, nofollow" },
  });
}

/**
 * Host-aware EVCS rewrite. Runs before shop subdomain logic.
 *
 *   tramsacvinfast.otofine.com/              → /evcs
 *   tramsacvinfast.otofine.com/giai-phap     → /evcs/giai-phap
 */
export function handleEvcsHostRouting(
  host: string,
  request: NextRequest,
): NextResponse | null {
  const { pathname } = request.nextUrl;

  const internalGuard = guardEvcsInternalPaths(host, pathname);
  if (internalGuard) return internalGuard;

  if (!isEvcsHost(host)) return null;

  if (isEvcsPassthroughPath(pathname)) return null;

  const internalPath = resolveEvcsInternalPath(pathname);
  if (!internalPath) {
    logEvcs("middleware.unknown-path", { path: pathname });
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  logEvcs("middleware.rewrite", {
    from: pathname,
    to: internalPath,
  });

  const url = request.nextUrl.clone();
  url.pathname = internalPath;
  const res = NextResponse.rewrite(url);
  res.headers.set("x-evcs-site", "1");
  return res;
}
