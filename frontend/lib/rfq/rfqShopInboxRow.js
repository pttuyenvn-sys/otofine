import { normalizeMergedPartDescription } from "./rfqPartDescription.js";

/** Compact inbox row labels — conversation-first, activity sorted by API. */

export function buildInboxRowPart(row) {
  if (!row) return "—";
  const part = normalizeMergedPartDescription(row.part_description);
  if (part) return part;
  return `#${String(row.public_id || row.id || "").slice(0, 8)}`;
}

export function buildInboxRowVehicle(row) {
  if (!row) return null;
  const vehicle =
    row.vehicle_label ||
    [row.vehicle_brand, row.vehicle_model, row.vehicle_year].filter(Boolean).join(" • ");
  return vehicle || null;
}

/** @deprecated use buildInboxRowPart + buildInboxRowVehicle */
export function buildInboxRowPrimaryLabel(row) {
  if (!row) return "—";
  const part = buildInboxRowPart(row);
  const vehicle = buildInboxRowVehicle(row);
  if (part && vehicle && !part.startsWith("#")) return `${part} • ${vehicle}`;
  return part || vehicle || "—";
}

export function buildInboxRowMessagePreview(row) {
  const raw = String(row?.last_message_preview || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(Khách|Shop):\s*(.+)$/);
  if (m) {
    const who = m[1];
    let text = m[2].replace(/^"(.*)"$/, "$1");
    const system = text === "Đã báo giá" || text === "Đã gửi ảnh" || text === "Tin nhắn";
    if (!system && text.length > 64) text = `${text.slice(0, 63)}…`;
    return { who, text, quoted: !system };
  }
  const text = raw.length > 64 ? `${raw.slice(0, 63)}…` : raw;
  return { who: null, text, quoted: false };
}

/** @deprecated use buildInboxRowMessagePreview */
export function buildInboxRowPreview(row) {
  const preview = buildInboxRowMessagePreview(row);
  if (!preview) return null;
  if (preview.who) {
    const whoLabel = preview.who === "Khách" ? "Khách vừa nhắn" : "Bạn vừa nhắn";
    if (preview.quoted) {
      return `${whoLabel}: "${preview.text}"`;
    }
    return `${preview.who}: ${preview.text}`;
  }
  return preview.text;
}

export function buildInboxRowStatusPill(row) {
  const chatUnread = Number(row?.message_unread_count ?? 0);
  const hasQuote = Boolean(row?.has_submitted_quote || row?.status === "quoted");
  if (chatUnread > 0) return { label: "Khách vừa nhắn", tone: "chat" };
  if (hasQuote) return { label: "Đã báo giá", tone: "quoted" };
  if (row?.needs_shop_response) return { label: "Chờ báo giá", tone: "waiting" };
  return null;
}

export function formatInboxRelativeTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const ms = Date.now() - date.getTime();
  if (ms < 45000) return "Vừa xong";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} phút`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Hôm qua";
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày`;
  return date.toLocaleDateString("vi-VN", { day: "numeric", month: "short" });
}

export function inboxRowUnread(row) {
  const chatUnread = Number(row?.message_unread_count ?? 0);
  const rfqUnread = row?.is_unread ?? row?.first_viewed_at == null;
  return chatUnread > 0 || Boolean(rfqUnread);
}

export function inboxRowIsNew(row) {
  return row?.is_unread ?? row?.first_viewed_at == null;
}
