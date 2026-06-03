"use client";

import RfqLazyImage from "@/components/rfq/RfqLazyImage";
import { RFQ_MEDIA_VARIANT } from "@/lib/rfq/rfqMediaUrl";

const PHASE_LABEL = {
  quoted: { label: "Đã có báo giá", tone: "quoted" },
  engaged: { label: "Đang trao đổi", tone: "engaged" },
  dispatched: { label: "Đã gửi shop", tone: "dispatched" },
  pending: { label: "Chờ phản hồi", tone: "pending" },
};

function formatRelativeTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Vừa xong";
    if (mins < 60) return `${mins} phút`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} ngày`;
    return d.toLocaleDateString("vi-VN");
  } catch {
    return "";
  }
}

function vehicleLabel(vehicle) {
  if (!vehicle) return "";
  return [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" · ");
}

export default function BuyerHistoryCard({ item, onOpen, opening }) {
  const phase = PHASE_LABEL[item.buyerPhase] || PHASE_LABEL.pending;
  const vehicle = vehicleLabel(item.vehicle);
  const preview = item.latestMessagePreview;
  const time = formatRelativeTime(item.latestMessageAt || item.updatedAt);
  const unread = Number(item.unreadCount || 0);

  return (
    <article className={`rfq-shop-buyer-list__row rfq-history-card ${unread ? "rfq-shop-buyer-list__row--unread" : ""}`}>
      <div className="rfq-history-card__main">
        <div className="rfq-inbox-row__head">
          <span className="rfq-inbox-row__part">{item.partDescription || "Yêu cầu báo giá"}</span>
          <span className="rfq-inbox-row__head-meta">
            <span className={`rfq-inbox-row__pill rfq-inbox-row__pill--${phase.tone}`}>{phase.label}</span>
            {time ? <span className="rfq-inbox-row__time">{time}</span> : null}
          </span>
        </div>

        {vehicle ? <span className="rfq-inbox-row__vehicle">{vehicle}</span> : null}

        {preview ? (
          <div className="rfq-inbox-row__preview">
            {preview.who ? <span className="rfq-inbox-row__preview-who">{preview.who}:</span> : null}
            <span className="rfq-inbox-row__preview-text">{preview.text}</span>
          </div>
        ) : (
          <p className="rfq-history-card__meta muted">
            {item.shopCount > 0 ? `${item.shopCount} shop` : "Chưa có shop"}
            {item.quoteCount > 0 ? ` · ${item.quoteCount} báo giá` : ""}
          </p>
        )}

        <div className="rfq-inbox-row__foot">
          {unread > 0 ? (
            <span className="rfq-inbox-row__count">{unread > 99 ? "99+" : unread}</span>
          ) : (
            <span className="rfq-inbox-row__foot-spacer" aria-hidden />
          )}
        </div>
      </div>

      {item.image ? (
        <div className="rfq-history-card__thumb" aria-hidden>
          <RfqLazyImage
            originalUrl={item.image}
            variant={RFQ_MEDIA_VARIANT.SMALL}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : (
        <div className="rfq-history-card__thumb rfq-history-card__thumb--empty" aria-hidden>
          <span className="rfq-history-card__thumb--empty-icon">📷</span>
          <span className="rfq-history-card__thumb--empty-text">Chưa có ảnh</span>
        </div>
      )}

      <button
        type="button"
        className="rfq-history-card__open"
        onClick={() => onOpen?.(item)}
        disabled={opening}
      >
        <span>{opening ? "Đang mở…" : "Xem chat & báo giá"}</span>
        {!opening ? (
          <svg className="rfq-history-card__open-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        ) : null}
      </button>
    </article>
  );
}
