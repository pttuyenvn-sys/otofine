"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import {
  RFQ_LINE_TYPE_LABEL,
  conversationHasQuoteMessages,
  enrichMessagesForDisplay,
  formatConversationTime,
  formatConversationTimeShort,
  formatQuoteMoney,
  messageStableKey,
} from "@/lib/rfq/rfqConversationMessages";
import {
  RFQ_SCROLL_BOTTOM_THRESHOLD,
  readNearBottom,
  scrollToEndInstant,
  shouldScrollToEndOnUpdate,
} from "@/lib/rfq/rfqConversationScroll";
import RfqSafeMessageText from "@/components/rfq/RfqSafeMessageText";
import RfqConversationImageGallery from "@/components/rfq/RfqConversationImageGallery";

export default function RfqConversationTimeline({
  items = [],
  loading = false,
  error = "",
  onRetry,
  emptyTitle = "Chưa có tin nhắn",
  emptyHint = "Nhắn tin để trao đổi với shop.",
  noQuotesHint = null,
  showShopLabel = false,
  viewerRole = null,
  listRef: externalListRef,
  stickToBottomRef,
  className = "",
  compact = true,
  hideFootnote = false,
  hideRequestImageSeed = false,
}) {
  const hasQuote = conversationHasQuoteMessages(items);
  const showNoQuotesNote = noQuotesHint && !hasQuote && !loading && !error && items.length === 0;
  const internalListRef = useRef(null);
  const listRef = externalListRef || internalListRef;

  const displayItems = useMemo(() => {
    const enriched = enrichMessagesForDisplay(items);
    if (!hideRequestImageSeed) return enriched;
    return enriched.filter((msg) => msg.metadata_json?.seed !== "rfq_request_images");
  }, [items, hideRequestImageSeed]);

  const tailSignature = displayItems.length
    ? `${displayItems.length}:${messageStableKey(displayItems[displayItems.length - 1])}`
    : "0";

  const prevCountRef = useRef(0);
  const prevLastIdRef = useRef(null);
  const initialScrollDoneRef = useRef(false);
  const pendingRestoreRef = useRef(null);
  const displayItemsRef = useRef(displayItems);
  displayItemsRef.current = displayItems;

  useLayoutEffect(() => {
    const el = listRef.current;
    const rows = displayItemsRef.current;
    if (!el || loading) return;

    const nextCount = rows.length;
    const nextLastId = nextCount ? rows[nextCount - 1].id : null;

    if (!initialScrollDoneRef.current && nextCount > 0) {
      scrollToEndInstant(el);
      initialScrollDoneRef.current = true;
      prevCountRef.current = nextCount;
      prevLastIdRef.current = nextLastId;
      return;
    }

    if (pendingRestoreRef.current != null) {
      el.scrollTop = pendingRestoreRef.current;
      pendingRestoreRef.current = null;
      prevCountRef.current = nextCount;
      prevLastIdRef.current = nextLastId;
      return;
    }

    const nearBottom = readNearBottom(el, RFQ_SCROLL_BOTTOM_THRESHOLD);
    const stick = stickToBottomRef?.current === true;

    if (
      shouldScrollToEndOnUpdate({
        prevCount: prevCountRef.current,
        prevLastId: prevLastIdRef.current,
        nextCount,
        nextLastId,
        stickToBottom: stick,
        nearBottom,
      })
    ) {
      scrollToEndInstant(el);
    }

    prevCountRef.current = nextCount;
    prevLastIdRef.current = nextLastId;
  }, [tailSignature, loading, listRef, stickToBottomRef]);

  function onListScroll() {
    const el = listRef.current;
    if (!el || !stickToBottomRef) return;
    const near = readNearBottom(el, RFQ_SCROLL_BOTTOM_THRESHOLD);
    stickToBottomRef.current = near;
    if (!near) {
      pendingRestoreRef.current = el.scrollTop;
    }
  }

  return (
    <section
      className={`rfq-conv-timeline ${compact ? "rfq-conv-timeline--compact" : ""} ${viewerRole ? `rfq-conv-timeline--viewer-${viewerRole}` : ""} ${className}`.trim()}
      aria-label="Lịch sử hội thoại"
    >
      {loading && (
        <div className="rfq-conv-timeline__loading" aria-busy="true">
          <div className="rfq-skel rfq-conv-skel" />
          <div className="rfq-skel rfq-conv-skel rfq-conv-skel--short" />
        </div>
      )}

      {!loading && error && (
        <div className="rfq-conv-timeline__error">
          <p className="rfq-conv-timeline__error-text">{error}</p>
          {onRetry && (
            <button type="button" className="rfq-btn rfq-btn--ghost rfq-btn--sm" onClick={onRetry}>
              Thử lại
            </button>
          )}
        </div>
      )}

      {!loading && !error && displayItems.length === 0 && (
        <div className="rfq-conv-timeline__empty">
          <p className="rfq-conv-timeline__empty-title">{emptyTitle}</p>
          {emptyHint ? <p className="muted rfq-conv-timeline__empty-hint">{emptyHint}</p> : null}
          {showNoQuotesNote && noQuotesHint ? (
            <p className="muted rfq-conv-timeline__empty-hint">{noQuotesHint}</p>
          ) : null}
        </div>
      )}

      {!loading && !error && displayItems.length > 0 && (
        <ol
          className="rfq-conv-timeline__list"
          ref={listRef}
          onScroll={onListScroll}
        >
          {displayItems.map((msg) => (
            <li
              key={`${msg.dispatchId || ""}-${msg.id}`}
              className={`rfq-conv-timeline__item ${msg.isGroupedWithPrev ? "rfq-conv-timeline__item--grouped" : ""}`}
            >
              {msg.message_type === "quote" ? (
                <QuoteTimelineCard msg={msg} showShopLabel={showShopLabel} showTime={msg.showTime} />
              ) : msg.message_type === "system" ? (
                <SystemTimelineCard msg={msg} showTime={msg.showTime} />
              ) : msg.message_type === "text" ? (
                <TextBubble msg={msg} viewerRole={viewerRole} showShopLabel={showShopLabel} showTime={msg.showTime} />
              ) : msg.message_type === "image" ? (
                <ImageBubble msg={msg} viewerRole={viewerRole} showShopLabel={showShopLabel} showTime={msg.showTime} />
              ) : (
                <GenericBubble msg={msg} showShopLabel={showShopLabel} />
              )}
            </li>
          ))}
        </ol>
      )}

      {!hideFootnote && (
        <p className="rfq-conv-timeline__footnote muted">Cập nhật khi tab mở — cuộn lên để đọc, không tự nhảy.</p>
      )}
    </section>
  );
}

function bubblePropsEqual(a, b) {
  return (
    a.msg === b.msg &&
    a.showShopLabel === b.showShopLabel &&
    a.viewerRole === b.viewerRole &&
    a.showTime === b.showTime
  );
}

const QuoteTimelineCard = memo(function QuoteTimelineCard({ msg, showShopLabel, showTime }) {
  const meta = msg.metadata_json || {};
  const lineKey = meta.line_type || "unknown";
  const lineLabel = RFQ_LINE_TYPE_LABEL[lineKey] || lineKey;
  const note = msg.message_text || meta.note || null;

  return (
    <article className="rfq-conv-msg rfq-conv-msg--quote">
      <div className="rfq-conv-msg__quote-label">Báo giá</div>
      {showShopLabel && msg.shopLabel && (
        <span className="rfq-conv-msg__shop-inline">{msg.shopLabel}</span>
      )}
      <div className="rfq-conv-msg__price">{formatQuoteMoney(meta.price_amount, meta.currency)}</div>
      {lineLabel && lineLabel !== "unknown" && (
        <span className="rfq-conv-msg__line-pill">{lineLabel}</span>
      )}
      {note && (
        <p className="rfq-conv-msg__quote-note">
          <RfqSafeMessageText text={note} />
        </p>
      )}
      {showTime && (
        <time className="rfq-conv-msg__time" dateTime={msg.created_at}>
          {formatConversationTime(msg.created_at)}
        </time>
      )}
    </article>
  );
}, bubblePropsEqual);

const SystemTimelineCard = memo(function SystemTimelineCard({ msg, showTime }) {
  return (
    <article className="rfq-conv-msg rfq-conv-msg--system">
      <p className="rfq-conv-msg__system-text">
        <RfqSafeMessageText text={msg.message_text || "Hệ thống"} />
      </p>
      {showTime && (
        <time className="rfq-conv-msg__time rfq-conv-msg__time--center" dateTime={msg.created_at}>
          {formatConversationTimeShort(msg.created_at)}
        </time>
      )}
    </article>
  );
}, bubblePropsEqual);

const TextBubble = memo(function TextBubble({ msg, viewerRole, showShopLabel, showTime }) {
  const isOwn = resolveIsOwn(msg, viewerRole);

  return (
    <article className={`rfq-bubble rfq-bubble--text ${isOwn ? "rfq-bubble--own" : "rfq-bubble--peer"}`}>
      {!isOwn && showShopLabel && msg.shopLabel && (
        <span className="rfq-bubble__sender">{msg.shopLabel}</span>
      )}
      <p className="rfq-bubble__body">
        <RfqSafeMessageText text={msg.message_text} />
      </p>
      {showTime && (
        <time className="rfq-bubble__time" dateTime={msg.created_at}>
          {formatConversationTimeShort(msg.created_at)}
        </time>
      )}
    </article>
  );
}, bubblePropsEqual);

const ImageBubble = memo(function ImageBubble({ msg, viewerRole, showShopLabel, showTime }) {
  const isOwn = resolveIsOwn(msg, viewerRole);
  const isSeed = msg.metadata_json?.seed === "rfq_request_images";

  return (
    <article className={`rfq-bubble rfq-bubble--image ${isOwn ? "rfq-bubble--own" : "rfq-bubble--peer"}`}>
      {!isOwn && showShopLabel && msg.shopLabel && (
        <span className="rfq-bubble__sender">{msg.shopLabel}</span>
      )}
      {isSeed && <span className="rfq-bubble__tag">Ảnh yêu cầu</span>}
      <RfqConversationImageGallery attachments={msg.attachments} />
      {msg.message_text ? (
        <p className="rfq-bubble__caption">
          <RfqSafeMessageText text={msg.message_text} />
        </p>
      ) : null}
      {showTime && (
        <time className="rfq-bubble__time" dateTime={msg.created_at}>
          {formatConversationTimeShort(msg.created_at)}
        </time>
      )}
    </article>
  );
}, bubblePropsEqual);

const GenericBubble = memo(function GenericBubble({ msg, showShopLabel }) {
  return (
    <article className="rfq-bubble rfq-bubble--peer">
      {showShopLabel && msg.shopLabel && (
        <span className="rfq-bubble__sender">{msg.shopLabel}</span>
      )}
      <p className="rfq-bubble__body">
        <RfqSafeMessageText text={msg.message_text || msg.message_type} />
      </p>
    </article>
  );
}, (a, b) => a.msg === b.msg && a.showShopLabel === b.showShopLabel);

function resolveIsOwn(msg, viewerRole) {
  if (viewerRole === "shop") return msg.sender_type === "shop";
  if (viewerRole === "buyer") return msg.sender_type === "buyer";
  return false;
}
