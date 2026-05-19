import { parseVehicleJsonField } from "./rfqVehicleNormalize.js";

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
  };
}

function isTerminalDispatch(dispatchRow, rfqStatus) {
  const ds = String(dispatchRow.status || "");
  const rs = String(rfqStatus || "");
  if (["expired", "failed", "skipped"].includes(ds)) return true;
  if (["expired", "cancelled", "closed"].includes(rs)) return true;
  return false;
}
