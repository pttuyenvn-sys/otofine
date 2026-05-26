"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import RfqConversationTimeline from "@/components/rfq/RfqConversationTimeline";
import RfqMessageComposer from "@/components/rfq/RfqMessageComposer";
import RfqBuyerChatHeader from "@/components/rfq/RfqBuyerChatHeader";
import RfqBuyerShopDrawer, {
  RfqBuyerShopList,
  buildShopActivityMap,
} from "@/components/rfq/RfqBuyerShopDrawer";
import { buyerConversationHeaders } from "@/lib/rfq/rfqConversationApi";
import { filterThreadItemsStable } from "@/lib/rfq/rfqBuyerDataStable";
import { getThreadEmptyState } from "@/lib/rfq/rfqBuyerEngagement";
import { useRfqRenderTrace } from "@/lib/rfq/rfqRenderDebug";

function RfqBuyerChatPanel({
  data,
  messageDispatchOptions,
  messageDispatchId,
  onSelectDispatch,
  quotesByDispatch,
  unreadByDispatch,
  totalUnread,
  timelineItems,
  timelineLoading,
  timelineError,
  reloadTimeline,
  sendMessage,
  timelineListRef,
  timelineStickRef,
  hasConversationRooms = false,
  dispatchCount = 0,
  canSend,
  viewerToken,
  composerClassName = "",
  chatShellClassName = "",
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useRfqRenderTrace("RfqBuyerChatPanel", {
    dispatchId: messageDispatchId,
    items: timelineItems?.length,
    loading: timelineLoading,
  });

  const threadCacheRef = useRef({ source: null, dispatchId: null, filtered: [] });
  const activeThreadItems = messageDispatchId
    ? filterThreadItemsStable(
        timelineItems,
        messageDispatchId,
        threadCacheRef.current,
      )
    : [];
  threadCacheRef.current.source = timelineItems;
  threadCacheRef.current.dispatchId = messageDispatchId;
  threadCacheRef.current.filtered = activeThreadItems;

  const conversationHeaders = useMemo(
    () => buyerConversationHeaders(viewerToken),
    [viewerToken],
  );

  const shopCount = messageDispatchOptions.length;
  const multiShop = shopCount > 1;

  const activeShopName = useMemo(() => {
    const hit = messageDispatchOptions.find((o) => o.dispatchId === messageDispatchId);
    return hit?.shopName ?? null;
  }, [messageDispatchOptions, messageDispatchId]);

  const activityByDispatch = useMemo(
    () => buildShopActivityMap(timelineItems),
    [timelineItems],
  );

  const placeholder = useMemo(() => {
    if (messageDispatchOptions.length === 1) {
      return `Nhắn ${messageDispatchOptions[0]?.shopName || "shop"}…`;
    }
    return activeShopName ? `Nhắn ${activeShopName}…` : "Nhắn tin…";
  }, [messageDispatchOptions, activeShopName]);

  const threadEmpty = useMemo(
    () =>
      getThreadEmptyState({
        hasDispatches: hasConversationRooms || dispatchCount > 0,
        activeDispatchId: messageDispatchId,
        activeThreadItems,
        timelineLoading,
      }),
    [
      hasConversationRooms,
      dispatchCount,
      messageDispatchId,
      activeThreadItems,
      timelineLoading,
    ],
  );

  const handleSend = useCallback(
    (text, opts) => sendMessage(messageDispatchId, text, opts),
    [sendMessage, messageDispatchId],
  );

  const handleOpenDrawer = useCallback(() => setDrawerOpen(true), []);
  const handleCloseDrawer = useCallback(() => setDrawerOpen(false), []);

  const mobileTriggerLabel = useMemo(() => {
    const name = activeShopName || "Shop";
    if (totalUnread > 0) {
      return `${name} (${totalUnread} mới)`;
    }
    return `${name} (${shopCount})`;
  }, [activeShopName, totalUnread, shopCount]);

  return (
    <section
      className={`rfq-buyer-chat rfq-chat-shell rfq-chat-shell--primary ${chatShellClassName}`.trim()}
      aria-label="Chat"
    >
      <div className="rfq-buyer-layout">
        {multiShop ? (
          <aside className="rfq-buyer-shop-sidebar rfq-desktop-only" aria-label="Shop">
            <header className="rfq-buyer-shop-sidebar__head">
              <h2 className="rfq-buyer-shop-sidebar__title">Shop</h2>
              <span className="rfq-buyer-shop-sidebar__count">{shopCount}</span>
            </header>
            <RfqBuyerShopList
              shops={messageDispatchOptions}
              activeDispatchId={messageDispatchId}
              onSelect={onSelectDispatch}
              unreadByDispatch={unreadByDispatch}
              quotesByDispatch={quotesByDispatch}
              activityByDispatch={activityByDispatch}
              variant="sidebar"
            />
          </aside>
        ) : null}

        <div className="rfq-buyer-chat-column">
          <RfqBuyerChatHeader
            data={data}
            totalUnread={multiShop ? 0 : totalUnread}
            activeShopName={multiShop ? null : activeShopName}
            compact
          />

          {multiShop ? (
            <button
              type="button"
              className="rfq-shop-drawer-trigger rfq-mobile-only"
              onClick={handleOpenDrawer}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
            >
              <span className="rfq-shop-drawer-trigger__icon" aria-hidden>
                ☰
              </span>
              <span className="rfq-shop-drawer-trigger__label">{mobileTriggerLabel}</span>
              {totalUnread > 0 ? (
                <span className="rfq-shop-drawer-trigger__badge">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              ) : null}
            </button>
          ) : null}

          <RfqConversationTimeline
            items={activeThreadItems}
            loading={timelineLoading}
            error={timelineError}
            onRetry={reloadTimeline}
            showShopLabel={!multiShop}
            viewerRole="buyer"
            listRef={timelineListRef}
            stickToBottomRef={timelineStickRef}
            emptyTitle={threadEmpty.emptyTitle}
            emptyHint=""
            hideFootnote
            hideRequestImageSeed
          />
          <RfqMessageComposer
            sticky
            className={composerClassName}
            disabled={!canSend || !threadEmpty.showComposer}
            dispatchId={messageDispatchId}
            conversationHeaders={conversationHeaders}
            placeholder={placeholder}
            onSend={handleSend}
            hideHints
          />
        </div>
      </div>

      {multiShop ? (
        <RfqBuyerShopDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          shops={messageDispatchOptions}
          activeDispatchId={messageDispatchId}
          onSelectDispatch={onSelectDispatch}
          unreadByDispatch={unreadByDispatch}
          quotesByDispatch={quotesByDispatch}
          timelineItems={timelineItems}
        />
      ) : null}
    </section>
  );
}

export default memo(RfqBuyerChatPanel, (prev, next) => {
  return (
    prev.data === next.data &&
    prev.messageDispatchOptions === next.messageDispatchOptions &&
    prev.messageDispatchId === next.messageDispatchId &&
    prev.quotesByDispatch === next.quotesByDispatch &&
    prev.unreadByDispatch === next.unreadByDispatch &&
    prev.totalUnread === next.totalUnread &&
    prev.timelineItems === next.timelineItems &&
    prev.timelineLoading === next.timelineLoading &&
    prev.timelineError === next.timelineError &&
    prev.reloadTimeline === next.reloadTimeline &&
    prev.sendMessage === next.sendMessage &&
    prev.timelineListRef === next.timelineListRef &&
    prev.timelineStickRef === next.timelineStickRef &&
    prev.hasConversationRooms === next.hasConversationRooms &&
    prev.dispatchCount === next.dispatchCount &&
    prev.canSend === next.canSend &&
    prev.viewerToken === next.viewerToken &&
    prev.composerClassName === next.composerClassName &&
    prev.chatShellClassName === next.chatShellClassName &&
    prev.onSelectDispatch === next.onSelectDispatch
  );
});
