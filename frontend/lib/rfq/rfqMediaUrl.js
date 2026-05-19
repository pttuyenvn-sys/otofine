import { API_ORIGIN } from "@/lib/config";

/** Resolve RFQ guest image path (/uploads/rfq/…) for preview. */
export function rfqImageSrc(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("http")) return u;
  return `${API_ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`;
}
