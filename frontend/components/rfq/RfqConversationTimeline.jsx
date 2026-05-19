"use client";

/**
 * RFQ conversation timeline (rfq_messages) — quote/system/text events.
 *
 * - rfq_quotes / dispatch remain source of truth for quotes and routing.
 * - dispatchId is the canonical room anchor.
 * - Text send via composer + poll (no websocket / unread yet).
 */

import { useEffect, useRef } from "react";
import {
  RFQ_LINE_TYPE_LABEL,
  conversationHasQuoteMessages,
  formatConversationTime,
  formatQuoteMoney,
  isNearScrollBottom,
} from "@/lib/rfq/rfqConversationMessages";
import RfqSafeMessageText from "@/components/rfq/RfqSafeMessageText";

export default function RfqConversationTimeline({
  items = [],
  loading = false,
  error = "",
  onRetry,
  emptyTitle = "Chưa có tin nhắn",
  emptyHint = "Lịch sử hội thoại sẽ hiện ở đây khi có báo giá hoặc sự kiện hệ thống.",
  noQuotesHint = null,
  showShopLabel = false,
  viewerRole = null,
  listRef: externalListRef,
  stickToBottomRef,
  className = "",
}) {
  const hasQuote = conversationHasQuoteMessages(items);
  const showNoQuotesNote = noQuotesHint && !hasQuote && !loading && !error && items.length === 0;
  const internalListRef = useRef(null);
  const listRef = externalListRef || internalListRef;

  useEffect(() => {
    const el = listRef.current;
    if (!el || loading) return;
    const stick = stickToBottomRef?.current !== false;
    const nearBottom = isNearScrollBottom(el);
    if (stick || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items, loading, listRef, stickToBottomRef]);

  function onListScroll() {
    if (!stickToBottomRef || !listRef.current) return;
    stickToBottomRef.current = isNearScrollBottom(listRef.current);
  }

  return (
    <section
      className={`rfq-conv-timeline ${className}`.trim()}
      aria-label="Lịch sử hội thoại"
    >
      {loading && (
        <div className="rfq-conv-timeline__loading" aria-busy="true">
          <div className="rfq-skel rfq-conv-skel" />
          <div className="rfq-skel rfq-conv-skel rfq-conv-skel--short" />
          <div className="rfq-skel rfq-conv-skel" />
        </div>
      )}

      {!loading && error && (
        <div className="rfq-conv-timeline__error card">
          <p className="rfq-conv-timeline__error-text">{error}</p>
          {onRetry && (
            <button type="button" className="rfq-btn rfq-btn--ghost rfq-btn--sm" onClick={onRetry}>
              Thử lại
            </button>
          )}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rfq-conv-timeline__empty card">
          <p className="rfq-conv-timeline__empty-title">{emptyTitle}</p>
          <p className="muted rfq-conv-timeline__empty-hint">{emptyHint}</p>
          {showNoQuotesNote && (
            <p className="muted rfq-conv-timeline__empty-hint">{noQuotesHint}</p>
          )}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ol
          className="rfq-conv-timeline__list"
          ref={listRef}
          onScroll={onListScroll}
        >
          {items.map((msg) => (
            <li key={`${msg.dispatchId || ""}-${msg.id}`} className="rfq-conv-timeline__item">
              {msg.message_type === "quote" ? (
                <QuoteTimelineCard msg={msg} showShopLabel={showShopLabel} />
              ) : msg.message_type === "system" ? (
                <SystemTimelineCard msg={msg} showShopLabel={showShopLabel} />
              ) : msg.message_type === "text" ? (
                <TextTimelineCard msg={msg} showShopLabel={showShopLabel} viewerRole={viewerRole} />
              ) : (
                <GenericTimelineCard msg={msg} showShopLabel={showShopLabel} />
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="rfq-conv-timeline__footnote muted">
        Tin nhắn cập nhật định kỳ khi tab đang mở — chưa có realtime. Báo giá chính thức lưu trong RFQ.
      </p>
    </section>
  );
}

function QuoteTimelineCard({ msg, showShopLabel }) {
  const meta = msg.metadata_json || {};
  const lineKey = meta.line_type || "unknown";
  const lineLabel = RFQ_LINE_TYPE_LABEL[lineKey] || lineKey;
  const note = msg.message_text || meta.note || null;

  return (
    <article className="rfq-conv-msg rfq-conv-msg--quote card">
      <div className="rfq-conv-msg__head">
        <span className="rfq-conv-msg__badge">Báo giá</span>
        {showShopLabel && msg.shopLabel && (
          <span className="rfq-conv-msg__shop">{msg.shopLabel}</span>
        )}
      </div>
      <div className="rfq-conv-msg__price">
        {formatQuoteMoney(meta.price_amount, meta.currency)}
      </div>
      {lineLabel && lineLabel !== "unknown" && (
        <span className="rfq-pill rfq-pill--muted rfq-conv-msg__line">{lineLabel}</span>
      )}
      {note && (
        <p className="rfq-conv-msg__text muted">
          <RfqSafeMessageText text={note} />
        </p>
      )}
      <time className="rfq-conv-msg__time" dateTime={msg.created_at}>
        {formatConversationTime(msg.created_at)}
      </time>
    </article>
  );
}

function SystemTimelineCard({ msg, showShopLabel }) {
  return (
    <article className="rfq-conv-msg rfq-conv-msg--system card">
      <div className="rfq-conv-msg__head">
        <span className="rfq-conv-msg__badge rfq-conv-msg__badge--system">Hệ thống</span>
        {showShopLabel && msg.shopLabel && (
          <span className="rfq-conv-msg__shop muted">{msg.shopLabel}</span>
        )}
      </div>
      <p className="rfq-conv-msg__text">
        <RfqSafeMessageText text={msg.message_text || "Sự kiện hệ thống"} />
      </p>
      <time className="rfq-conv-msg__time" dateTime={msg.created_at}>
        {formatConversationTime(msg.created_at)}
      </time>
    </article>
  );
}

function TextTimelineCard({ msg, showShopLabel, viewerRole }) {
  const isOwn =
    viewerRole === "shop"
      ? msg.sender_type === "shop"
      : viewerRole === "buyer"
        ? msg.sender_type === "buyer"
        : false;

  return (
    <article
      className={`rfq-conv-msg rfq-conv-msg--text card ${isOwn ? "rfq-conv-msg--own" : "rfq-conv-msg--peer"}`}
    >
      <div className="rfq-conv-msg__head">
        <span className="rfq-conv-msg__badge rfq-conv-msg__badge--text">
          {isOwn ? "Bạn" : msg.sender_type === "shop" ? "Shop" : "Khách"}
        </span>
        {showShopLabel && msg.shopLabel && !isOwn && (
          <span className="rfq-conv-msg__shop">{msg.shopLabel}</span>
        )}
      </div>
      <p className="rfq-conv-msg__text rfq-conv-msg__text--body">
        <RfqSafeMessageText text={msg.message_text} />
      </p>
      <time className="rfq-conv-msg__time" dateTime={msg.created_at}>
        {formatConversationTime(msg.created_at)}
      </time>
    </article>
  );
}

function GenericTimelineCard({ msg, showShopLabel }) {
  return (
    <article className="rfq-conv-msg card">
      {showShopLabel && msg.shopLabel && (
        <span className="rfq-conv-msg__shop muted">{msg.shopLabel}</span>
      )}
      <p className="rfq-conv-msg__text">
        <RfqSafeMessageText text={msg.message_text || msg.message_type} />
      </p>
      <time className="rfq-conv-msg__time" dateTime={msg.created_at}>
        {formatConversationTime(msg.created_at)}
      </time>
    </article>
  );
}
