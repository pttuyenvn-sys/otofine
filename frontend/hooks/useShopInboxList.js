 "use client";

import { useEffect, useRef, useState } from "react";
import axiosClient from "@/api/axiosClient";
import { API_BASE } from "@/lib/config";
import { buildInboxQueryParams } from "@/lib/rfq/rfqInboxFilters";
import { buildShopLoginUrl, getCurrentShopReturnPath } from "@/lib/auth/safeShopRedirect";
import {
  buildInboxSnapshot,
  inboxListsIdentical,
  mergeInboxLoadMore,
  mergeInboxRows,
} from "@/lib/rfq/rfqInboxListStable";
import { getShopToken } from "@/lib/auth/storage";

/**
 * Shop inbox list + summary — same polling/snapshot stabilization as inbox page.
 */
export function useShopInboxList({
  filter = "all",
  sort = "activity",
  limit = 24,
  vehicleBrand = "",
  vehicleModel = "",
  vehicleYear = "",
  categoryKey = "",
  enabled = true,
} = {}) {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageUnreadTotal, setMessageUnreadTotal] = useState(0);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const lastSnapshotRef = useRef("");
  const itemsRef = useRef([]);

  const loginBlocked =
    typeof msg === "string" &&
    (msg.includes("đăng nhập") || msg.includes("/shop/login"));

  const pollFirstPage = typeof window !== "undefined" && !loginBlocked && offset === 0 && enabled;

  const listParams = (off = 0) =>
    buildInboxQueryParams({
      filter,
      sort,
      limit,
      offset: off,
      brand: vehicleBrand,
      model: vehicleModel,
      year: vehicleYear,
      categoryKey,
    });

  function applySummary(sumRes) {
    const unread = Number(sumRes.data?.unreadCount ?? 0);
    const msgUnread = Number(sumRes.data?.messageUnreadTotal ?? 0);
    setUnreadCount((prev) => (prev === unread ? prev : unread));
    setMessageUnreadTotal((prev) => (prev === msgUnread ? prev : msgUnread));
  }

  function commitItems(next) {
    itemsRef.current = next;
    setItems((prev) => (inboxListsIdentical(prev, next) ? prev : next));
  }

  useEffect(() => {
    if (!enabled) return undefined;
    const token = getShopToken();
    if (!token) {
      lastSnapshotRef.current = "";
      setMsg("Cần đăng nhập shop (/shop/login).");
      setLoading(false);
      itemsRef.current = [];
      setItems([]);
      setUnreadCount(0);
      setHasMore(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setMsg("");
    setOffset(0);
    itemsRef.current = [];
    setItems([]);
    lastSnapshotRef.current = "";

    (async () => {
      try {
        const [listRes, sumRes] = await Promise.all([
          axiosClient.get("/shop/rfq/inbox", { params: listParams(0) }),
          axiosClient.get("/shop/rfq/inbox/summary"),
        ]);
        if (cancelled) return;
        const rows = listRes.data.items || [];
        const unread = Number(sumRes.data?.unreadCount ?? 0);
        const msgUnread = Number(sumRes.data?.messageUnreadTotal ?? 0);
        lastSnapshotRef.current = buildInboxSnapshot(rows, unread, msgUnread);
        commitItems(rows);
        applySummary(sumRes);
        setHasMore(rows.length >= limit);
      } catch {
        if (!cancelled) setMsg("Không tải inbox — RFQ_MODULE_ENABLED hoặc token shop.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filter, sort, limit, vehicleBrand, vehicleModel, vehicleYear, categoryKey, enabled]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const token = getShopToken();
    if (!token || loginBlocked) return undefined;

    let pollIntervalId = null;

    function stopTimersOnly() {
      if (pollIntervalId != null) {
        window.clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    }

    async function silentFetchFirstPage() {
      if (!pollFirstPage) return;
      try {
        const [listRes, sumRes] = await Promise.all([
          axiosClient.get("/shop/rfq/inbox", { params: listParams(0) }),
          axiosClient.get("/shop/rfq/inbox/summary"),
        ]);
        const rows = listRes.data.items || [];
        const unread = Number(sumRes.data?.unreadCount ?? 0);
        const msgUnread = Number(sumRes.data?.messageUnreadTotal ?? 0);
        const snap = buildInboxSnapshot(rows, unread, msgUnread);
        if (snap === lastSnapshotRef.current) return;
        lastSnapshotRef.current = snap;

        const merged = mergeInboxRows(itemsRef.current, rows);
        commitItems(merged);
        applySummary(sumRes);
        setHasMore((prev) => {
          const next = rows.length >= limit;
          return prev === next ? prev : next;
        });
      } catch {
        /* keep list */
      }
    }

    function startIntervalsIfVisible() {
      stopTimersOnly();
      if (document.visibilityState !== "visible") return;
      if (pollFirstPage) {
        pollIntervalId = window.setInterval(() => {
          void silentFetchFirstPage();
        }, 5000);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") return;
      void silentFetchFirstPage();
      startIntervalsIfVisible();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    startIntervalsIfVisible();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTimersOnly();
    };
  }, [
    filter,
    sort,
    limit,
    pollFirstPage,
    loginBlocked,
    vehicleBrand,
    vehicleModel,
    vehicleYear,
    categoryKey,
    enabled,
  ]);

  function loadMore() {
    const token = getShopToken();
    if (!token) return;
    const next = offset + limit;
    setLoading(true);
    axiosClient
      .get("/shop/rfq/inbox", { params: listParams(next) })
      .then((res) => {
        const rows = res.data.items || [];
        const merged = mergeInboxLoadMore(itemsRef.current, rows);
        commitItems(merged);
        setHasMore(rows.length >= limit);
        setOffset(next);
      })
      .catch(() => setMsg("Không tải thêm."))
      .finally(() => setLoading(false));
  }

  return {
    items,
    loading,
    msg,
    hasMore,
    loadMore,
    unreadCount,
    messageUnreadTotal,
    loginBlocked,
    loginUrl:
      loginBlocked && typeof window !== "undefined"
        ? buildShopLoginUrl(getCurrentShopReturnPath())
        : null,
  };
}
