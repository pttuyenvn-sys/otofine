"use client";

import { useEffect, useRef } from "react";
import { markConversationRead } from "@/lib/rfq/rfqConversationApi";
import { RFQ_READ_DEBOUNCE_MS } from "@/lib/rfq/rfqConversationConstants";
import { messageStableKey } from "@/lib/rfq/rfqConversationMessages";
import {
  pickReadMapForBuyer,
  pickReadMessageId,
} from "@/lib/rfq/rfqConversationRead";

function itemsTailSignature(items) {
  if (!items?.length) return "0";
  const tail = items[items.length - 1];
  return `${items.length}:${messageStableKey(tail)}`;
}

/**
 * Debounced mark-read when timeline is visible and user is caught up.
 * Polling remains transport — websocket deferred.
 */
export function useShopConversationMarkRead({
  dispatchId,
  items,
  loading,
  listRef,
  stickToBottomRef,
  headers,
  enabled = true,
  onMarked,
}) {
  const timerRef = useRef(null);
  const lastSentIdRef = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const tailSignature = itemsTailSignature(items);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!enabled || !dispatchId || loading || document.visibilityState !== "visible") {
      return undefined;
    }

    const messageId = pickReadMessageId(
      itemsRef.current,
      listRef?.current,
      stickToBottomRef?.current === true,
    );
    if (messageId == null || messageId <= lastSentIdRef.current) {
      return undefined;
    }

    timerRef.current = setTimeout(() => {
      void markConversationRead(dispatchId, { messageId }, { headers })
        .then((data) => {
          lastSentIdRef.current = Math.max(lastSentIdRef.current, messageId);
          onMarked?.(data);
        })
        .catch(() => {});
    }, RFQ_READ_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dispatchId, tailSignature, loading, enabled, headers, listRef, stickToBottomRef, onMarked]);
}

export function useBuyerConversationMarkRead({
  viewerToken,
  items,
  loading,
  listRef,
  stickToBottomRef,
  headers,
  enabled = true,
  onMarked,
}) {
  const timerRef = useRef(null);
  const lastSentByDispatchRef = useRef({});
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const tailSignature = itemsTailSignature(items);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!enabled || !viewerToken || loading || document.visibilityState !== "visible") {
      return undefined;
    }

    const readMap = pickReadMapForBuyer(itemsRef.current, listRef?.current, stickToBottomRef);
    const entries = Object.entries(readMap).filter(([d, id]) => {
      const prev = lastSentByDispatchRef.current[d] || 0;
      return id > prev;
    });
    if (!entries.length) return undefined;

    timerRef.current = setTimeout(() => {
      void Promise.all(
        entries.map(([dispatchId, messageId]) =>
          markConversationRead(Number(dispatchId), { messageId }, { headers }).then((data) => {
            lastSentByDispatchRef.current[dispatchId] = messageId;
            return { dispatchId: Number(dispatchId), data };
          }),
        ),
      )
        .then((results) => onMarked?.(results))
        .catch(() => {});
    }, RFQ_READ_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [viewerToken, tailSignature, loading, enabled, headers, listRef, stickToBottomRef, onMarked]);
}
