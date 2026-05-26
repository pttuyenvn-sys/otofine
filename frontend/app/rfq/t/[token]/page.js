"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { API_BASE, ZALO_OA_URL } from "@/lib/config";
import { ZaloOaBuyerMobileStickyBar } from "@/components/rfq/ZaloOaCtas";
import RfqBuyerChatPanel from "@/components/rfq/RfqBuyerChatPanel";
// Phase 8.2 — assistive suggestion panel. Self-hides when soft rollout
// is OFF, when the matcher returns nothing, or when the API call fails.
import RfqAssistSuggestions from "@/components/rfq/RfqAssistSuggestions";
import { useBuyerConversationMessages } from "@/hooks/useRfqConversationMessages";
import {
  mergeDispatchOptionsFromDispatches,
  mergeQuotesByDispatch,
  mergeStableSortedQuotes,
  stabilizeRfqByTokenData,
} from "@/lib/rfq/rfqBuyerDataStable";
import {
  parseDeepLinkDispatchId,
  persistDeepLinkDispatchId,
} from "@/lib/rfq/rfqBuyerDeepLink";
import {
  deriveBuyerEngagement,
  pickDefaultDispatchId,
} from "@/lib/rfq/rfqBuyerEngagement";
import { tryRegisterBuyerRfqPush } from "@/lib/rfqPushRegister";
import { useRfqRenderTrace } from "@/lib/rfq/rfqRenderDebug";

/** RFQ detail poll — slower than chat; quotes/status only. */
const RFQ_DETAIL_POLL_MS = 15_000;

/** Terminal states: stop polling (no websocket; GET by-token only). */
function isBuyerPollingTerminated(d) {
  if (!d) return true;
  const st = String(d.status || "");
  if (st === "cancelled" || st === "closed") return true;
  if (st === "expired") return true;
  if (d.expiresAt) {
    const t = new Date(d.expiresAt).getTime();
    if (Number.isFinite(t) && t < Date.now()) return true;
  }
  return false;
}

export default function RfqTokenPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = decodeURIComponent(params.token || "");
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const initialFetchDisposedRef = useRef(false);
  const sortedQuotesRef = useRef([]);
  const dispatchOptionsRef = useRef([]);
  const quotesByDispatchRef = useRef({});

  useRfqRenderTrace("RfqTokenPage", {
    hasData: Boolean(data),
    loading,
  });

  useEffect(() => {
    initialFetchDisposedRef.current = false;
    async function load() {
      setLoading(true);
      setMsg("");
      try {
        const res = await axios.get(`${API_BASE}/rfq/by-token`, {
          headers: { "X-RFQ-Viewer-Token": token },
        });
        if (initialFetchDisposedRef.current) return;
        setData(res.data);
      } catch {
        if (!initialFetchDisposedRef.current) setMsg("Không tải được RFQ — kiểm tra link hoặc liên hệ hỗ trợ.");
      } finally {
        if (!initialFetchDisposedRef.current) setLoading(false);
      }
    }
    if (token) load();
    else setLoading(false);
    return () => {
      initialFetchDisposedRef.current = true;
    };
  }, [token]);

  const engagement = useMemo(() => (data ? deriveBuyerEngagement(data) : null), [data]);

  /** Chừa chỗ sticky OA mobile — không đè lên danh sách báo giá */
  const showOaComfort = Boolean(
    ZALO_OA_URL && data && engagement && !engagement.cancelled && !engagement.expired && !loading && !msg,
  );

  const sortedQuotes = useMemo(() => {
    const next = mergeStableSortedQuotes(sortedQuotesRef.current, data?.quotes);
    sortedQuotesRef.current = next;
    return next;
  }, [data?.quotes]);

  const messageDispatchOptions = useMemo(() => {
    const next = mergeDispatchOptionsFromDispatches(
      dispatchOptionsRef.current,
      data?.dispatches,
      sortedQuotes,
    );
    dispatchOptionsRef.current = next;
    return next;
  }, [data?.dispatches, sortedQuotes]);

  const [messageDispatchId, setMessageDispatchId] = useState(null);
  const deepLinkDispatchId = useMemo(
    () => parseDeepLinkDispatchId(searchParams),
    [searchParams],
  );
  const appliedDeepLinkRef = useRef(null);
  const userPickedTabRef = useRef(false);
  const tabInitCompleteRef = useRef(false);

  useEffect(() => {
    if (deepLinkDispatchId) {
      persistDeepLinkDispatchId(deepLinkDispatchId);
    }
  }, [deepLinkDispatchId]);

  const {
    items: timelineItems,
    loading: timelineLoading,
    error: timelineError,
    reload: reloadTimeline,
    sendMessage,
    unreadByDispatch,
    totalUnread,
    listRef: timelineListRef,
    stickToBottomRef: timelineStickRef,
  } = useBuyerConversationMessages(token, messageDispatchOptions, {
    markReadDispatchId: messageDispatchId,
  });

  useEffect(() => {
    if (!messageDispatchOptions.length) {
      if (!deepLinkDispatchId) {
        setMessageDispatchId(null);
      }
      tabInitCompleteRef.current = false;
      return;
    }

    if (deepLinkDispatchId) {
      const found = messageDispatchOptions.some(
        (o) => Number(o.dispatchId) === deepLinkDispatchId,
      );
      if (found) {
        setMessageDispatchId(deepLinkDispatchId);
        tabInitCompleteRef.current = true;
        return;
      }
    }

    if (!tabInitCompleteRef.current && timelineLoading) {
      return;
    }

    setMessageDispatchId((prev) => {
      if (
        userPickedTabRef.current &&
        prev != null &&
        messageDispatchOptions.some((o) => o.dispatchId === prev)
      ) {
        return prev;
      }

      const next = pickDefaultDispatchId(messageDispatchOptions, {
        unreadByDispatch,
        timelineItems,
        deepLinkDispatchId,
      });

      if (!tabInitCompleteRef.current) {
        tabInitCompleteRef.current = true;
        return next;
      }

      if (prev != null && messageDispatchOptions.some((o) => o.dispatchId === prev)) {
        return prev;
      }
      return next;
    });
  }, [
    messageDispatchOptions,
    deepLinkDispatchId,
    unreadByDispatch,
    timelineItems,
    timelineLoading,
  ]);

  useEffect(() => {
    if (!data?.rfqRequestId || !token) return;
    void tryRegisterBuyerRfqPush(data.rfqRequestId, `/rfq/t/${token}`);
  }, [data?.rfqRequestId, token]);

  useEffect(() => {
    if (!messageDispatchId || !reloadTimeline) return;
    const isDeepLinkTarget =
      deepLinkDispatchId != null && Number(messageDispatchId) === Number(deepLinkDispatchId);
    if (isDeepLinkTarget && appliedDeepLinkRef.current !== messageDispatchId) {
      appliedDeepLinkRef.current = messageDispatchId;
      void reloadTimeline();
    }
  }, [messageDispatchId, deepLinkDispatchId, reloadTimeline]);

  useEffect(() => {
    if (!reloadTimeline) return undefined;

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      const pending = parseDeepLinkDispatchId(searchParams);
      if (pending) {
        persistDeepLinkDispatchId(pending);
        setMessageDispatchId((prev) =>
          Number(prev) === pending ? prev : pending,
        );
      }
      void reloadTimeline();
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [reloadTimeline, searchParams]);

  const quotesByDispatch = useMemo(() => {
    const next = mergeQuotesByDispatch(quotesByDispatchRef.current, sortedQuotes);
    quotesByDispatchRef.current = next;
    return next;
  }, [sortedQuotes]);

  const handleSelectDispatch = useCallback((id) => {
    userPickedTabRef.current = true;
    setMessageDispatchId(id);
  }, []);

  useEffect(() => {
    if (messageDispatchId && timelineStickRef) {
      timelineStickRef.current = true;
    }
  }, [messageDispatchId, timelineStickRef]);

  const canSendBuyerMessage = Boolean(
    messageDispatchId &&
      token &&
      data &&
      !msg &&
      !loading &&
      engagement &&
      !engagement.cancelled &&
      !engagement.expired,
  );

  const pollingActive = Boolean(token && data && !msg && !loading && !isBuyerPollingTerminated(data));

  useEffect(() => {
    if (!pollingActive || !token) return undefined;

    let pollIntervalId = null;

    async function silentFetch() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await axios.get(`${API_BASE}/rfq/by-token`, {
          headers: { "X-RFQ-Viewer-Token": token },
        });
        setData((prev) => stabilizeRfqByTokenData(prev, res.data));
        if (isBuyerPollingTerminated(res.data)) clearTimersOnly();
      } catch {
        /* keep UI stable on transient network errors */
      }
    }

    function clearTimersOnly() {
      if (pollIntervalId != null) {
        window.clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    }

    function startIntervalsIfVisible() {
      clearTimersOnly();
      if (document.visibilityState !== "visible") return;
      pollIntervalId = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void silentFetch();
      }, RFQ_DETAIL_POLL_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearTimersOnly();
        return;
      }
      void silentFetch();
      startIntervalsIfVisible();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    startIntervalsIfVisible();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimersOnly();
    };
  }, [token, pollingActive]);

  return (
    <div className="rfq-buyer-page">
      {loading && (
        <div className="rfq-buyer-inner" aria-busy="true">
          <div className="rfq-skel rfq-skeleton--line" />
          <div className="rfq-skel rfq-skeleton--line rfq-skeleton--short" />
          <div className="rfq-skel rfq-skeleton--card rfq-skel--tall" />
        </div>
      )}

      {!loading && msg && (
        <div className="rfq-buyer-inner">
          <div className="rfq-banner-error rfq-buyer-banner">{msg}</div>
          <p className="muted rfq-buyer-foot">
            <Link href="/">← Về trang chủ</Link>
          </p>
        </div>
      )}

      {!loading && data && engagement && (
        <>
          <div className={`rfq-buyer-inner rfq-buyer-inner--chat-first${showOaComfort ? " rfq-buyer-inner--oa-pad-mobile" : ""}`}>
          {/* Assistive supplier suggestions (Phase 8.2). Renders nothing
              when soft rollout is OFF for this buyer or when there are
              no matches — additive, never blocks the chat below. */}
          {data?.rfqRequestId && (
            <RfqAssistSuggestions
              rfqId={data.rfqRequestId}
              viewerToken={token}
            />
          )}
          <div className="rfq-buyer-chat-viewport">
          <RfqBuyerChatPanel
            data={data}
            messageDispatchOptions={messageDispatchOptions}
            messageDispatchId={messageDispatchId}
            onSelectDispatch={handleSelectDispatch}
            quotesByDispatch={quotesByDispatch}
            unreadByDispatch={unreadByDispatch}
            totalUnread={totalUnread}
            timelineItems={timelineItems}
            timelineLoading={timelineLoading}
            timelineError={timelineError}
            reloadTimeline={reloadTimeline}
            sendMessage={sendMessage}
            timelineListRef={timelineListRef}
            timelineStickRef={timelineStickRef}
            hasConversationRooms={messageDispatchOptions.length > 0}
            dispatchCount={engagement.dispatchCount}
            canSend={canSendBuyerMessage}
            viewerToken={token}
            composerClassName={showOaComfort ? "rfq-msg-composer--above-oa" : ""}
            chatShellClassName={showOaComfort ? "rfq-buyer-chat--oa-pad" : ""}
          />
          </div>
          </div>

          {showOaComfort && <ZaloOaBuyerMobileStickyBar />}
        </>
      )}
    </div>
  );
}
