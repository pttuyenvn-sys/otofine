"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buyerConversationHeaders,
  fetchConversationMessages,
  fetchConversationUnreadSummary,
  sendConversationTextMessage,
  shopConversationHeaders,
} from "@/lib/rfq/rfqConversationApi";
import {
  mergeConversationItems,
  mergeSortedMessages,
} from "@/lib/rfq/rfqConversationMessages";
import { RFQ_CONVERSATION_POLL_MS } from "@/lib/rfq/rfqConversationConstants";
import {
  useBuyerConversationMarkRead,
  useShopConversationMarkRead,
} from "@/hooks/useRfqConversationMarkRead";

/**
 * Shop thread: single dispatchId. Polls while tab visible (no websocket yet).
 */
export function useShopConversationMessages(dispatchId, refreshKey = 0) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const headers = useMemo(() => shopConversationHeaders(), []);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!dispatchId) return;
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const data = await fetchConversationMessages(dispatchId, {
          headers,
          limit: 100,
        });
        const incoming = (data?.items || []).map((m) => ({ ...m, dispatchId }));
        setItems((prev) => (silent ? mergeSortedMessages(prev, incoming) : incoming));
        if (typeof data?.unread_count === "number") {
          setUnreadCount(data.unread_count);
        }
      } catch {
        if (!silent) {
          setError("Không tải được lịch sử hội thoại — thử lại.");
          setItems([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [dispatchId, headers],
  );

  useEffect(() => {
    stickToBottomRef.current = true;
    void load({ silent: false });
  }, [load, refreshKey]);

  useEffect(() => {
    if (!dispatchId) return undefined;

    let pollId = null;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void load({ silent: true });
    };

    const onVisibility = () => {
      if (pollId) {
        window.clearInterval(pollId);
        pollId = null;
      }
      if (document.visibilityState === "visible") {
        void load({ silent: true });
        pollId = window.setInterval(tick, RFQ_CONVERSATION_POLL_MS);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") {
      pollId = window.setInterval(tick, RFQ_CONVERSATION_POLL_MS);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pollId) window.clearInterval(pollId);
    };
  }, [dispatchId, load]);

  useShopConversationMarkRead({
    dispatchId,
    items,
    loading,
    listRef,
    stickToBottomRef,
    headers,
    enabled: Boolean(dispatchId),
    onMarked: (data) => {
      if (typeof data?.unread_count === "number") {
        setUnreadCount(data.unread_count);
      }
    },
  });

  const sendText = useCallback(
    async (text) => {
      const res = await sendConversationTextMessage(dispatchId, text, { headers });
      const msg = res?.message
        ? { ...res.message, dispatchId: Number(dispatchId) }
        : null;
      if (msg) {
        stickToBottomRef.current = true;
        setItems((prev) => mergeSortedMessages(prev, [msg]));
      } else {
        stickToBottomRef.current = true;
        await load({ silent: true });
      }
    },
    [dispatchId, load, headers],
  );

  return {
    items,
    loading,
    error,
    unreadCount,
    reload: () => load({ silent: false }),
    sendText,
    listRef,
    stickToBottomRef,
  };
}

/**
 * Buyer: merged timelines from quoted dispatches. Poll refreshes all threads.
 */
export function useBuyerConversationMessages(viewerToken, quotes, refreshKey = 0) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unreadByDispatch, setUnreadByDispatch] = useState({});
  const abortRef = useRef(false);
  const listRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const headers = useMemo(() => buyerConversationHeaders(viewerToken), [viewerToken]);

  const dispatchIds = useMemoDispatchIds(quotes);

  const shopNameByDispatchId = useCallback(() => {
    const map = {};
    for (const q of quotes || []) {
      if (q.dispatchId != null && q.shopName) {
        map[q.dispatchId] = q.shopName;
      }
    }
    return map;
  }, [quotes]);

  const applyUnreadFromPages = useCallback((pages) => {
    setUnreadByDispatch((prev) => {
      const next = { ...prev };
      for (const p of pages) {
        const d = Number(p.dispatch_id);
        if (Number.isFinite(d) && typeof p.unread_count === "number") {
          next[d] = p.unread_count;
        }
      }
      return next;
    });
  }, []);

  const loadUnreadSummary = useCallback(async () => {
    if (!viewerToken || !dispatchIds.length) {
      setUnreadByDispatch({});
      return;
    }
    try {
      const data = await fetchConversationUnreadSummary(dispatchIds, { headers });
      const next = {};
      for (const row of data?.items || []) {
        next[Number(row.dispatch_id)] = Number(row.unread_count || 0);
      }
      setUnreadByDispatch(next);
    } catch {
      /* keep prior counts */
    }
  }, [viewerToken, dispatchIds, headers]);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!viewerToken || !dispatchIds.length) {
        setItems([]);
        if (!silent) setLoading(false);
        setError("");
        setUnreadByDispatch({});
        return;
      }
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const names = shopNameByDispatchId();
        const pages = await Promise.all(
          dispatchIds.map((id) =>
            fetchConversationMessages(id, {
              headers,
              limit: 100,
            }).catch(() => ({ items: [], dispatch_id: id, unread_count: 0 })),
          ),
        );
        if (abortRef.current) return;
        const merged = mergeConversationItems(pages, { shopNameByDispatchId: names });
        setItems((prev) => (silent ? mergeSortedMessages(prev, merged) : merged));
        applyUnreadFromPages(pages);
      } catch {
        if (!abortRef.current && !silent) {
          setError("Không tải được lịch sử — thử lại.");
          setItems([]);
        }
      } finally {
        if (!abortRef.current && !silent) setLoading(false);
      }
    },
    [viewerToken, dispatchIds, shopNameByDispatchId, headers, applyUnreadFromPages],
  );

  useEffect(() => {
    abortRef.current = false;
    stickToBottomRef.current = true;
    void loadUnreadSummary();
    void load({ silent: false });
    return () => {
      abortRef.current = true;
    };
  }, [load, loadUnreadSummary, refreshKey]);

  useEffect(() => {
    if (!viewerToken || !dispatchIds.length) return undefined;

    let pollId = null;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void load({ silent: true });
    };

    const onVisibility = () => {
      if (pollId) {
        window.clearInterval(pollId);
        pollId = null;
      }
      if (document.visibilityState === "visible") {
        void load({ silent: true });
        pollId = window.setInterval(tick, RFQ_CONVERSATION_POLL_MS);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") {
      pollId = window.setInterval(tick, RFQ_CONVERSATION_POLL_MS);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pollId) window.clearInterval(pollId);
    };
  }, [viewerToken, dispatchIds, load]);

  useBuyerConversationMarkRead({
    viewerToken,
    items,
    loading,
    listRef,
    stickToBottomRef,
    headers,
    enabled: Boolean(viewerToken),
    onMarked: (results) => {
      if (!Array.isArray(results)) return;
      setUnreadByDispatch((prev) => {
        const next = { ...prev };
        for (const { dispatchId: d, data } of results) {
          if (typeof data?.unread_count === "number") {
            next[d] = data.unread_count;
          }
        }
        return next;
      });
    },
  });

  const sendText = useCallback(
    async (dispatchId, text) => {
      const res = await sendConversationTextMessage(dispatchId, text, { headers });
      const msg = res?.message
        ? { ...res.message, dispatchId: Number(dispatchId) }
        : null;
      if (msg) {
        const names = shopNameByDispatchId();
        if (names[dispatchId]) msg.shopLabel = names[dispatchId];
        stickToBottomRef.current = true;
        setItems((prev) => mergeSortedMessages(prev, [msg]));
      } else {
        stickToBottomRef.current = true;
        await load({ silent: true });
      }
    },
    [viewerToken, load, shopNameByDispatchId, headers],
  );

  const totalUnread = Object.values(unreadByDispatch).reduce((s, n) => s + Number(n || 0), 0);

  return {
    items,
    loading,
    error,
    unreadByDispatch,
    totalUnread,
    reload: () => load({ silent: false }),
    sendText,
    dispatchIds,
    listRef,
    stickToBottomRef,
  };
}

function useMemoDispatchIds(quotes) {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    const set = new Set();
    for (const q of quotes || []) {
      const id = Number(q.dispatchId);
      if (Number.isFinite(id) && id > 0) set.add(id);
    }
    setIds([...set]);
  }, [quotes]);
  return ids;
}
