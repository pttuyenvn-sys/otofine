/**
 * Origin public cho canonical / OG (không có dấu / cuối).
 */
export function getSiteUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(
    /\/+$/,
    "",
  );
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export function absoluteUrl(pathname = "/") {
  const base = getSiteUrl();
  if (!pathname || pathname === "/") return base;
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${p}`;
}
