import { parseVehicleJsonField } from "./rfqVehicleNormalize.js";

function parseImageCount(imagesJson) {
  if (imagesJson == null) return 0;
  try {
    const arr = typeof imagesJson === "string" ? JSON.parse(imagesJson) : imagesJson;
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

export function formatInboxLastMessagePreview(row) {
  const type = row?.last_message_type;
  if (!type) return null;
  const sender = row?.last_message_sender_type === "shop" ? "Shop" : "Khách";
  if (type === "quote") return `${sender}: Đã báo giá`;
  if (type === "image") {
    const cap = String(row?.last_message_text || "").trim();
    return cap ? `${sender}: ${cap.slice(0, 60)}` : `${sender}: Đã gửi ảnh`;
  }
  const text = String(row?.last_message_text || "").trim();
  if (!text) return `${sender}: Tin nhắn`;
  return `${sender}: ${text.length > 72 ? `${text.slice(0, 69)}…` : text}`;
}

/**
 * Additive inbox row fields for shop UI (response contract keeps all original columns).
 */
export function mapInboxDispatchRow(row, messageUnreadCount = 0) {
  const vehicle = parseVehicleJsonField(row.vehicle_json);
  const hasQuote =
    row.status === "quoted" ||
    Number(row.has_submitted_quote || 0) === 1;
  const chatUnread = Number(
    row.message_unread_count ?? messageUnreadCount ?? 0,
  );

  return {
    ...row,
    vehicle_brand: vehicle.brand || null,
    vehicle_model: vehicle.model || null,
    vehicle_year: vehicle.year,
    vehicle_label: vehicle.label || null,
    category_key: row.category_key ?? null,
    has_submitted_quote: hasQuote,
    is_unread: row.first_viewed_at == null,
    message_unread_count: chatUnread,
    has_message_unread: chatUnread > 0,
    needs_shop_response: !hasQuote && !isTerminalDispatch(row, row.rfq_status),
    image_count: parseImageCount(row.images_json),
    last_message_preview: formatInboxLastMessagePreview(row),
    // Sales-intelligence enrichment — see listInboxForShop SELECT.
    // Normalized to plain numbers + ISO timestamps so the seller UI
    // can render badges without re-parsing. Buyer phone itself is
    // never leaked: only counts and times.
    buyer_prior_rfq_count: Number(row.buyer_prior_rfq_count || 0),
    buyer_prior_last_rfq_at: row.buyer_prior_last_rfq_at
      ? new Date(row.buyer_prior_last_rfq_at).toISOString()
      : null,
    buyer_prior_quotes_count: Number(row.buyer_prior_quotes_count || 0),
    buyer_prior_today: Number(row.buyer_prior_today || 0) > 0,
  };
}

function isTerminalDispatch(dispatchRow, rfqStatus) {
  const ds = String(dispatchRow.status || "");
  const rs = String(rfqStatus || "");
  if (["expired", "failed", "skipped"].includes(ds)) return true;
  if (["expired", "cancelled", "closed"].includes(rs)) return true;
  return false;
}
