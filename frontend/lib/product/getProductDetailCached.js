import { cache } from "react";
import { API_BASE } from "@/lib/config";

export const getProductDetailCached = cache(async (rawId) => {
  if (rawId == null || String(rawId).trim() === "") return null;
  const res = await fetch(
    `${API_BASE}/product/${encodeURIComponent(String(rawId))}`,
    { next: { revalidate: 600 } },
  );
  if (!res.ok) return null;
  return res.json();
});
