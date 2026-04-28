import { cache } from "react";
import { API_BASE } from "@/lib/config";

/**
 * Part-knowledge SEO engine data from Express `GET /api/seo-page/:slug`.
 * Cached per request (metadata + page share one fetch).
 */
export const loadPartSeoPage = cache(async (slug) => {
  const s = String(slug ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;

  const base = String(API_BASE || "").replace(/\/$/, "");
  const url = `${base}/seo-page/${encodeURIComponent(s)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.route?.id || !data?.part?.id) return null;
    return data;
  } catch {
    return null;
  }
});
