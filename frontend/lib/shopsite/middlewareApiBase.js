/**
 * Edge-safe API base for middleware shop probes.
 */
export function resolveMiddlewareApiBase() {
  const internal = String(
    process.env.API_INTERNAL_ORIGIN || process.env.API_PROXY_TARGET || "",
  )
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api\/?$/i, "");
  if (internal) return `${internal}/api`;

  const pub = String(process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (pub) return (/\/api$/i.test(pub) ? pub : `${pub}/api`);

  return "https://otofine.com/api";
}
