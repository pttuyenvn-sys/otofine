"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bulkModerateProducts,
  getProductModerationQueue,
  getProductModerationEvents,
  getModerationStats,
  getModerationShops,
  resetModerationStatus,
} from "@/lib/adminApi";
import { useDebouncedValue } from "@/lib/shopsite/useDebouncedValue";
import ModerationQueueTabs from "@/components/moderation/ModerationQueueTabs";
import ModerationFilters, { RISK_LEVELS, REJECT_REASON_LABELS, RISK_FLAG_LABELS } from "@/components/moderation/ModerationFilters";
import ProductReviewDrawer from "@/components/moderation/ProductReviewDrawer";
import AppImage from "@/components/common/AppImage";
import { PRODUCT_IMAGE_VARIANT } from "@/lib/media/productMediaUrl";
import { prefetchModerationDetail } from "@/lib/moderation/moderationDetailCache";
import styles from "./AdminProductModerationQueue.module.css";

const QUEUE_STORAGE_KEY = "moderationQueueOrder";
const MOD_DEBUG = process.env.NODE_ENV === "development";

function readSavedModQueueState() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem("modQueueState") || "{}");
  } catch {
    return {};
  }
}

function modLog(message, meta) {
  if (!MOD_DEBUG) return;
  if (meta !== undefined) console.log(`[moderation] ${message}`, meta);
  else console.log(`[moderation] ${message}`);
}

function paginationRange(page, limit, total) {
  if (!total) return { from: 0, to: 0 };
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return { from, to };
}

function buildPageNumbers(current, totalPages) {
  if (totalPages <= 1) return totalPages ? [1] : [];
  const pages = new Set([1, totalPages, current]);
  for (let i = current - 2; i <= current + 2; i += 1) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

function formatTime(value) {
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString();
  } catch {
    return String(value);
  }
}

function StatusBadge({ status }) {
  const theme = (() => {
    switch (status) {
      case "approved":
        return { bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" };
      case "rejected":
        return { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" };
      case "pending_review":
        return { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" };
      case "hidden":
        return { bg: "#e5e7eb", fg: "#374151", border: "#d1d5db" };
      case "draft":
      default:
        return { bg: "#dbeafe", fg: "#1d4ed8", border: "#bfdbfe" };
    }
  })();

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 6px",
        borderRadius: 999,
        background: theme.bg,
        color: theme.fg,
        border: `1px solid ${theme.border}`,
        fontSize: 9,
        fontWeight: 800,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {status || "-"}
    </span>
  );
}

function PriorityBadge({ level }) {
  const theme = (() => {
    switch ((level || "").toUpperCase()) {
      case "CRITICAL":
        return { bg: "#fee2e2", fg: "#7f1d1d", border: "#fecaca" };
      case "HIGH":
        return { bg: "#fff7ed", fg: "#7c2d12", border: "#fed7aa" };
      case "MEDIUM":
        return { bg: "#fffbeb", fg: "#92400e", border: "#fef3c7" };
      case "LOW":
      default:
        return { bg: "#ecfdf5", fg: "#065f46", border: "#bbf7d0" };
    }
  })();

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 5px",
        borderRadius: 5,
        background: theme.bg,
        color: theme.fg,
        border: `1px solid ${theme.border}`,
        fontSize: 9,
        fontWeight: 800,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        minWidth: 46,
        textAlign: "center",
      }}
    >
      {level || "LOW"}
    </span>
  );
}

function Thumbnail({ url, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!url}
      title={url ? "Preview" : "No image"}
      style={{
        width: 52,
        height: 52,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        overflow: "hidden",
        padding: 0,
        cursor: url ? "pointer" : "not-allowed",
      }}
    >
      {url ? (
        <AppImage
          mode="next"
          src={url}
          variant={PRODUCT_IMAGE_VARIANT.THUMB_100}
          allowOriginalFallback={false}
          width={52}
          height={52}
          sizes="52px"
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{ fontSize: 12, opacity: 0.6 }}>No img</div>
      )}
    </button>
  );
}

function MultiThumbs({ images = [], onClick, compact = false }) {
  const pics = Array.isArray(images) ? images : [];
  const max = compact ? 1 : 4;
  const size = compact ? 28 : 36;
  const visible = pics.slice(0, max);
  const extra = Math.max(0, pics.length - max);
  return (
    <div style={{ display: "flex", gap: compact ? 3 : 6, alignItems: "center" }}>
      {visible.map((u, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onClick && onClick(i)}
          style={{
            width: size,
            height: size,
            borderRadius: compact ? 4 : 6,
            overflow: "hidden",
            padding: 0,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <AppImage
            mode="next"
            src={u}
            variant={PRODUCT_IMAGE_VARIANT.THUMB_100}
            allowOriginalFallback={false}
            width={size}
            height={size}
            sizes={`${size}px`}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </button>
      ))}
      {extra > 0 && (
        <div style={{ width: size, height: size, borderRadius: compact ? 4 : 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#374151", border: "1px solid #e5e7eb", flexShrink: 0 }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

function GalleryModal({ images = [], index = 0, onClose }) {
  const imgs = Array.isArray(images) ? images : [];
  const [i, setI] = useState(() => Math.max(0, Math.min(index || 0, imgs.length - 1)));

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") return onClose?.();
      if (e.key === "ArrowRight") setI((s) => Math.min(s + 1, imgs.length - 1));
      if (e.key === "ArrowLeft") setI((s) => Math.max(s - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imgs.length, onClose]);

  if (!imgs.length) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div style={{ width: "100%", maxWidth: 1000, background: "white", borderRadius: 12, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "relative", background: "#111" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgs[i]} alt="" style={{ width: "100%", height: "80vh", objectFit: "contain", display: "block", background: "#000" }} />
          <button type="button" onClick={() => setI((s) => Math.max(0, s - 1))} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.8)", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer" }}>‹</button>
          <button type="button" onClick={() => setI((s) => Math.min(s + 1, imgs.length - 1))} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.8)", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer" }}>›</button>
          <button type="button" onClick={onClose} style={{ position: "absolute", right: 8, top: 8, background: "transparent", border: "none", fontSize: 20, color: "white", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 8, padding: 8, overflowX: "auto", background: "#fff" }}>
          {imgs.map((u, idx) => (
            <button key={idx} type="button" onClick={() => setI(idx)} style={{ border: i === idx ? "2px solid #059669" : "1px solid #e5e7eb", padding: 0, borderRadius: 6, overflow: "hidden", width: 80, height: 60, flexShrink: 0 }}>
              <AppImage
                mode="next"
                src={u}
                variant={PRODUCT_IMAGE_VARIANT.THUMB_100}
                allowOriginalFallback={false}
                width={80}
                height={60}
                sizes="80px"
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function ImagePreviewModal({ url, title, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 16,
          width: "100%",
          maxWidth: 860,
          boxShadow: "0 20px 48px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>{title || "Preview"}</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, fontWeight: 900 }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: "#f3f4f6",
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }} />
        </div>
      </div>
    </div>
  );
}

export default function AdminProductModerationQueue() {
  const savedInit = useMemo(() => readSavedModQueueState(), []);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  // Filters (Slice 1 requirement)
  const [pendingOnly, setPendingOnly] = useState(() =>
    typeof savedInit.pendingOnly === "boolean" ? savedInit.pendingOnly : true,
  );
  const [missingImage, setMissingImage] = useState(() =>
    typeof savedInit.missingImage === "boolean" ? savedInit.missingImage : false,
  );
  const [missingPrice, setMissingPrice] = useState(() =>
    typeof savedInit.missingPrice === "boolean" ? savedInit.missingPrice : false,
  );
  const [status, setStatus] = useState(() => savedInit.status || "pending_review");
  const [selectedRiskLevels, setSelectedRiskLevels] = useState(() =>
    Array.isArray(savedInit.selectedRiskLevels) ? savedInit.selectedRiskLevels : [],
  );
  const [page, setPage] = useState(() => Number(savedInit.page) || 1);
  const [limit, setLimit] = useState(() => {
    const n = Number(savedInit.limit);
    return [20, 50, 100].includes(n) ? n : 20;
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [shopId, setShopId] = useState(() => (savedInit.shopId != null ? String(savedInit.shopId) : ""));
  const [searchInput, setSearchInput] = useState(() => savedInit.searchInput || "");
  const [shopSearchInput, setShopSearchInput] = useState("");
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(false);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const debouncedShopSearch = useDebouncedValue(shopSearchInput, 300);
  const [drawerProductId, setDrawerProductId] = useState(null);
  const drawerOpen = drawerProductId != null;
  const scrollPreserveRef = useRef(null);
  const filtersMountedRef = useRef(false);

  const abortRef = useRef(null);
  const requestSeqRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  // Selection + bulk actions
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [historyOpenFor, setHistoryOpenFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Thumbnail preview
  const [preview, setPreview] = useState({ open: false, url: "", title: "" });
  const [gallery, setGallery] = useState({ open: false, images: [], index: 0 });
  const [currentReviewId, setCurrentReviewId] = useState(null); // focused product for review card
  const [toasts, setToasts] = useState([]); // { id, message, type, undoCallback }
  const [counters, setCounters] = useState({ pending: 0, approved: 0, rejected: 0, draft: 0 });

  // apply client-side risk-level filtering (non-blocking, additive-only)
  const filteredRows = useMemo(() => {
    if (!selectedRiskLevels || selectedRiskLevels.length === 0) return rows;
    const setLevels = new Set(selectedRiskLevels);
    return rows.filter((r) => setLevels.has((r.priorityLevel || "LOW").toUpperCase()));
  }, [rows, selectedRiskLevels]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(filteredRows.map((r) => r.id)));
    } catch {
      // ignore
    }
  }, [filteredRows]);

  // keyboard handlers / navigation
  useEffect(() => {
    function onKey(e) {
      if (drawerOpen) return;
      const targetTag = (e.target && e.target.tagName) ? String(e.target.tagName).toUpperCase() : "";
      if (targetTag === "INPUT" || targetTag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "Escape") {
        // close modals / review
        setRejectModalOpen(false);
        setPreview({ open: false, url: "", title: "" });
        setGallery({ open: false, images: [], index: 0 });
        setCurrentReviewId(null);
        setSelected(new Set());
      }
      if (e.key === "a" || e.key === "A") {
        // approve when single item selected
        if (selected.size === 1) {
          const id = Array.from(selected)[0];
          approveSingle(id);
        }
      }
      if (e.key === "r" || e.key === "R") {
        if (selected.size === 1) {
          setRejectModalOpen(true);
        }
      }
      if (e.key === "ArrowRight") {
        navigateRelative(1);
      }
      if (e.key === "ArrowLeft") {
        navigateRelative(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, filteredRows, rows, drawerOpen]);

  // add toast helper
  function addToast({ message, type = "info", undoCallback = null, duration = 5000 }) {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const t = { id, message, type, undoCallback };
    setToasts((s) => [...s, t]);
    // auto-dismiss
    setTimeout(() => {
      setToasts((s) => s.filter((x) => x.id !== id));
      // if undo not clicked, clear undo callback reference
    }, duration);
    return id;
  }

  // polling for counters (use new aggregated endpoint)
  useEffect(() => {
    let stopped = false;
    async function fetchStats() {
      try {
        const res = await getModerationStats();
        const d = res?.data || {};
        if (!stopped) setCounters({
          pending: Number(d.pending || 0),
          approved: Number(d.approved || 0),
          rejected: Number(d.rejected || 0),
          draft: Number(d.draft || 0),
          critical: Number(d.critical || 0),
          high: Number(d.high || 0),
          medium: Number(d.medium || 0),
          low: Number(d.low || 0),
        });
      } catch (e) {
        // ignore
      }
    }
    fetchStats();
    const iv = setInterval(fetchStats, 45000);
    return () => { stopped = true; clearInterval(iv); };
  }, []);

  function openReviewDrawer(id) {
    if (!id) return;
    scrollPreserveRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    setDrawerProductId(Number(id));
    setSelected(new Set([Number(id)]));
    setCurrentReviewId(Number(id));
    prefetchModerationDetail(Number(id));
  }

  function closeReviewDrawer() {
    setDrawerProductId(null);
    setCurrentReviewId(null);
    requestAnimationFrame(() => {
      if (scrollPreserveRef.current != null) {
        window.scrollTo({ top: scrollPreserveRef.current, behavior: "instant" in window ? "instant" : "auto" });
      }
    });
  }

  function handleDrawerNavigate(id) {
    const pid = Number(id);
    if (!Number.isFinite(pid) || pid <= 0) return;
    setDrawerProductId(pid);
    setSelected(new Set([pid]));
    setCurrentReviewId(pid);
    prefetchModerationDetail(pid);
  }

  function handleDrawerModerated() {
    fetchQueue({ reason: "drawer-moderated" });
  }

  // scroll active review row into view when drawer navigates
  useEffect(() => {
    if (!drawerProductId) return;
    try {
      const el = document.querySelector(`tr[data-row-id="${drawerProductId}"]`);
      if (el?.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch {
      // ignore
    }
  }, [drawerProductId]);

  function navigateRelative(delta) {
    const list = filteredRows;
    if (!list || list.length === 0) return;
    // find currently selected single id or currentReviewId
    let currentId = currentReviewId;
    if (!currentId && selected.size === 1) currentId = Array.from(selected)[0];
    let idx = list.findIndex((r) => r.id === currentId);
    if (idx === -1) {
      // pick start or end
      idx = delta > 0 ? -1 : 0;
    }
    const nextIdx = Math.max(0, Math.min(list.length - 1, idx + delta));
    const nextId = list[nextIdx]?.id;
    if (nextId) {
      setSelected(new Set([nextId]));
      setCurrentReviewId(nextId);
      // scroll into view minimal: try to find row element by data-id (not present), so skip scrolling
    }
  }

  const queryParams = useMemo(() => {
    const p = { page, limit };
    if (status === "all") {
      p.status = "all";
    } else if (status) {
      p.status = status;
      if (pendingOnly && status === "pending_review") p.pendingOnly = 1;
    }
    if (missingImage) p.missingImage = 1;
    if (missingPrice) p.missingPrice = 1;
    if (shopId) p.shopId = shopId;
    const q = debouncedSearch.trim();
    if (q) p.search = q;
    return p;
  }, [page, limit, status, pendingOnly, missingImage, missingPrice, shopId, debouncedSearch]);

  const range = useMemo(() => paginationRange(page, limit, total), [page, limit, total]);
  const pageNumbers = useMemo(() => buildPageNumbers(page, totalPages), [page, totalPages]);
  const canPrev = page > 1;
  const canNext = totalPages > 0 && page < totalPages;

  function RiskBadgeMini({ flag }) {
    const color = flag.severity === "high" ? "#b91c1c" : flag.severity === "medium" ? "#fb923c" : "#059669";
    const label = (RISK_FLAG_LABELS && RISK_FLAG_LABELS[flag.code]) ? RISK_FLAG_LABELS[flag.code] : flag.code;
    return (
      <span title={flag.code} style={{ background: "#fff1f2", color, border: `1px solid ${color}`, padding: "2px 5px", borderRadius: 4, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
        {label}
      </span>
    );
  }

  const fetchQueue = useCallback(async ({ reason = "manual", resetSelection = false, isPoll = false } = {}) => {
    if (isPoll && fetchInFlightRef.current) {
      modLog("poll skipped, fetch in flight");
      return;
    }

    const prevRequestId = requestSeqRef.current;
    if (abortRef.current) {
      modLog(`request aborted #${prevRequestId}`);
      abortRef.current.abort();
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const controller = new AbortController();
    abortRef.current = controller;
    fetchInFlightRef.current = true;

    modLog(`request started #${requestId}`, { reason, isPoll });

    const showRefresh = hasLoadedOnceRef.current;
    setRefreshing(showRefresh);
    if (!showRefresh) setLoading(true);

    try {
      const res = await getProductModerationQueue(queryParams, { signal: controller.signal });
      if (requestId !== requestSeqRef.current) {
        modLog(`stale response ignored #${requestId}`);
        return;
      }

      const next = res.data?.rows || [];
      const pg = res.data?.pagination || {};
      setRows(next);
      setTotal(Number(pg.total ?? 0));
      setTotalPages(Number(pg.totalPages ?? 0));
      if (resetSelection) setSelected(new Set());
      setError("");
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
      modLog(`request applied #${requestId}`, { count: next.length, reason });
    } catch (err) {
      const canceled =
        controller.signal.aborted ||
        err?.name === "CanceledError" ||
        err?.name === "AbortError" ||
        err?.code === "ERR_CANCELED";
      if (canceled) {
        modLog(`request aborted #${requestId}`);
        return;
      }
      if (requestId !== requestSeqRef.current) {
        modLog(`stale response ignored #${requestId}`);
        return;
      }

      console.error(err);
      const httpStatus = err?.response?.status;
      if (httpStatus === 404) {
        setError("Product moderation is not enabled (ADMIN_MODERATION_ENABLED).");
      } else if (httpStatus === 403) {
        setError("You do not have permission to access the moderation queue.");
      } else {
        setError(err?.response?.data?.error || err.message || "Failed to load moderation queue");
      }
      modLog(`request failed #${requestId}`, { reason });
    } finally {
      if (requestId === requestSeqRef.current) {
        fetchInFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
        abortRef.current = null;
      }
    }
  }, [queryParams]);

  useEffect(() => {
    fetchQueue({ reason: "query-change", resetSelection: true });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchQueue]);

  useEffect(() => {
    if (!filtersMountedRef.current) {
      filtersMountedRef.current = true;
      return;
    }
    setPage(1);
  }, [debouncedSearch, status, shopId, missingImage, missingPrice, pendingOnly, limit]);

  useEffect(() => {
    let cancelled = false;
    async function loadShops() {
      setShopsLoading(true);
      try {
        const res = await getModerationShops({
          search: debouncedShopSearch.trim() || undefined,
          limit: 50,
        });
        if (!cancelled) setShops(res.data?.rows || []);
      } catch {
        if (!cancelled) setShops([]);
      } finally {
        if (!cancelled) setShopsLoading(false);
      }
    }
    loadShops();
    return () => { cancelled = true; };
  }, [debouncedShopSearch]);

  useEffect(() => {
    try {
      sessionStorage.setItem("modQueueState", JSON.stringify({
        status, pendingOnly, missingImage, missingPrice, selectedRiskLevels, page, limit, shopId, searchInput,
      }));
    } catch {}
  }, [status, pendingOnly, missingImage, missingPrice, selectedRiskLevels, page, limit, shopId, searchInput]);

  const allIdsOnPage = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);
  const allSelected = filteredRows.length > 0 && allIdsOnPage.every((id) => selected.has(id));

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) {
      allIdsOnPage.forEach((id) => next.delete(id));
    } else {
      allIdsOnPage.forEach((id) => next.add(id));
    }
    setSelected(next);
  }

  function toggleOne(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  // scroll selected row into view and highlight
  useEffect(() => {
    try {
      if (selected.size === 1) {
        const id = Array.from(selected)[0];
        const el = document.querySelector(`tr[data-row-id="${id}"]`);
        if (el && el.scrollIntoView) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    } catch (e) {
      // ignore
    }
  }, [selected]);

  async function runBulk(action) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === "reject") {
      // open modal to collect reason/notes
      setRejectModalOpen(true);
      return;
    }

    if (!window.confirm(`Apply \"${action}\" to ${ids.length} product(s)?`)) return;

    setSaving(true);
    try {
      await bulkModerateProducts({ ids, action });
      // Update local rows state without reloading full queue.
      const nextStatus = action === "approve" ? "approved" : (action === "reject" ? "rejected" : null);
      if (nextStatus) {
        setRows((prev) => {
          // remove items that no longer match current status filter (conservative: drop changed items)
          const removed = new Set(ids.map((x) => Number(x)));
          return prev.filter((r) => !removed.has(Number(r.id)));
        });
      } else {
        // fallback: reload
        await fetchQueue({ reason: "bulk-fallback", resetSelection: true });
      }
      // if single-id action, focus next
      if (ids.length === 1) {
        const id = ids[0];
        const list = filteredRows;
        const idx = list.findIndex((r) => r.id === id);
        const next = list[idx + 1] || list[idx - 1] || null;
        if (next) {
          setSelected(new Set([next.id]));
          setCurrentReviewId(next.id);
        } else {
          setSelected(new Set());
          setCurrentReviewId(null);
        }
      } else {
        setSelected(new Set());
        setCurrentReviewId(null);
      }
      // show toast with undo
      const undoIds = ids.slice();
      addToast({
        message: `${action === "approve" ? "Approved" : "Rejected"} ${ids.length} product(s)`,
        type: "success",
        undoCallback: async () => {
          try {
            // Re-open review: move back to pending_review using new endpoint
            await resetModerationStatus({ productIds: undoIds, status: "pending_review" });
            await fetchQueue({ reason: "bulk-fallback", resetSelection: true });
            addToast({ message: "Re-opened for review", type: "info" });
          } catch (e) {
            addToast({ message: "Undo failed", type: "error" });
          }
        },
      });
    } catch (err) {
      console.error(err);
      window.alert(err?.response?.data?.error || err.message || "Bulk action failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitReject() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!rejectReason) {
      window.alert("Reject reason is required");
      return;
    }
    setSaving(true);
    try {
      await bulkModerateProducts({ ids, action: "reject", reasonCode: rejectReason, note: rejectNotes });
      // locally update rows (remove rejected items from current view)
      setRows((prev) => {
        const removed = new Set(ids.map((x) => Number(x)));
        return prev.filter((r) => !removed.has(Number(r.id)));
      });
      setRejectModalOpen(false);
      setRejectReason("");
      setRejectNotes("");
      // focus next if single
      if (ids.length === 1) {
        const id = ids[0];
        const list = filteredRows;
        const idx = list.findIndex((r) => r.id === id);
        const next = list[idx + 1] || list[idx - 1] || null;
        if (next) {
          setSelected(new Set([next.id]));
          setCurrentReviewId(next.id);
        } else {
          setSelected(new Set());
          setCurrentReviewId(null);
        }
      } else {
        setSelected(new Set());
        setCurrentReviewId(null);
      }
      // toast with undo
      const undoIds = ids.slice();
      addToast({
        message: `Rejected ${ids.length} product(s)`,
        type: "success",
        undoCallback: async () => {
          try {
            await resetModerationStatus({ productIds: undoIds, status: "pending_review" });
            await fetchQueue({ reason: "bulk-fallback", resetSelection: true });
            addToast({ message: "Re-opened for review", type: "info" });
          } catch (e) {
            addToast({ message: "Undo failed", type: "error" });
          }
        },
      });
    } catch (err) {
      console.error(err);
      window.alert(err?.response?.data?.error || err.message || "Bulk reject failed");
    } finally {
      setSaving(false);
    }
  }

  // helper used by quick preset buttons to submit and focus next
  async function submitRejectPreset(reasonCodes = []) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const reason = reasonCodes[0] || rejectReason;
    setSaving(true);
    try {
      await bulkModerateProducts({ ids, action: "reject", reasonCode: reason, note: rejectNotes });
      setRows((prev) => {
        const removed = new Set(ids.map((x) => Number(x)));
        return prev.filter((r) => !removed.has(Number(r.id)));
      });
      setRejectModalOpen(false);
      setRejectReason("");
      setRejectNotes("");
      if (ids.length === 1) {
        const id = ids[0];
        const list = filteredRows;
        const idx = list.findIndex((r) => r.id === id);
        const next = list[idx + 1] || list[idx - 1] || null;
        if (next) {
          setSelected(new Set([next.id]));
          setCurrentReviewId(next.id);
        } else {
          setSelected(new Set());
          setCurrentReviewId(null);
        }
      } else {
        setSelected(new Set());
        setCurrentReviewId(null);
      }
    } catch (err) {
      console.error(err);
      window.alert(err?.response?.data?.error || err.message || "Bulk reject failed");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(productId) {
    setHistoryOpenFor(productId);
    setHistoryRows([]);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const res = await getProductModerationEvents(productId);
      setHistoryRows(res.data?.rows || []);
    } catch (err) {
      console.error(err);
      setHistoryError(err?.response?.data?.error || err.message || "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }

  // approve single helper used by keyboard and review card
  async function approveSingle(id) {
    if (!id) return;
    setSaving(true);
    try {
      await bulkModerateProducts({ ids: [id], action: "approve" });
      // remove from rows (assume current view was pending)
      setRows((prev) => prev.filter((r) => Number(r.id) !== Number(id)));
      // focus next
      const list = filteredRows;
      const idx = list.findIndex((r) => r.id === id);
      const next = list[idx + 1] || list[idx - 1] || null;
      if (next) {
        setSelected(new Set([next.id]));
        setCurrentReviewId(next.id);
      } else {
        setSelected(new Set());
        setCurrentReviewId(null);
      }
      // toast with undo
      addToast({
        message: `Approved 1 product`,
        type: "success",
        undoCallback: async () => {
          try {
            await resetModerationStatus({ productIds: [id], status: "pending_review" });
            await fetchQueue({ reason: "bulk-fallback", resetSelection: true });
            addToast({ message: "Re-opened for review", type: "info" });
          } catch (e) {
            addToast({ message: "Undo failed", type: "error" });
          }
        },
      });
    } catch (err) {
      console.error(err);
      window.alert(err?.response?.data?.error || err.message || "Approve failed");
    } finally {
      setSaving(false);
    }
  }

  // reject single via review card quick flow (opens modal prefilled or quick reject)
  function openRejectFor(id) {
    if (!id) return;
    setSelected(new Set([id]));
    setRejectModalOpen(true);
  }

  function handleTabChange(nextStatus) {
    setStatus(nextStatus);
    setPendingOnly(nextStatus === "pending_review");
    setPage(1);
  }

  return (
    <div className={styles.page}>
      <div style={{ marginBottom: 10 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Product Governance</h1>
        <div style={{ opacity: 0.65, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
          <span>Browse, filter, and moderate marketplace product listings</span>
          <span>
            Pending: <strong>{counters.pending}</strong> • Approved: <strong>{counters.approved}</strong> • Rejected: <strong>{counters.rejected}</strong> • Draft: <strong>{counters.draft}</strong>
          </span>
        </div>
      </div>

      <div className={styles.headerRow}>
        <div className={styles.tabsRow}>
          <ModerationQueueTabs value={status} onChange={handleTabChange} />
          <button
            type="button"
            onClick={() => {
              fetchQueue({ reason: "manual-refresh", resetSelection: true });
              addToast({ message: "Queue refreshed", type: "info" });
            }}
            disabled={refreshing}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12, fontWeight: 600 }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className={styles.opsToolbar}>
        <div className={styles.toolbarSearch}>
          <input
            type="search"
            className={styles.field}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title or SKU"
            aria-label="Search products"
          />
        </div>

        <div className={styles.toolbarShop}>
          <div className={styles.toolbarShopInner}>
            <input
              type="search"
              className={styles.fieldCompact}
              value={shopSearchInput}
              onChange={(e) => setShopSearchInput(e.target.value)}
              placeholder="Shop…"
              aria-label="Search shops"
              style={{ width: 72, flexShrink: 0 }}
            />
            <select
              className={styles.field}
              value={shopId}
              onChange={(e) => { setShopId(e.target.value); setPage(1); }}
              aria-label="Filter by shop"
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="">{shopsLoading ? "Loading…" : "All shops"}</option>
              {shops.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name || `Shop #${s.id}`}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.toolbarFilters}>
          {status === "pending_review" ? (
            <label className={styles.chkLabel}>
              <input type="checkbox" checked={pendingOnly} onChange={(e) => { setPendingOnly(e.target.checked); setPage(1); }} />
              Pending only
            </label>
          ) : null}
          <label className={styles.chkLabel}>
            <input type="checkbox" checked={missingImage} onChange={(e) => { setMissingImage(e.target.checked); setPage(1); }} />
            No image
          </label>
          <label className={styles.chkLabel}>
            <input type="checkbox" checked={missingPrice} onChange={(e) => { setMissingPrice(e.target.checked); setPage(1); }} />
            No price
          </label>
          <ModerationFilters selectedRisk={selectedRiskLevels} onRiskChange={setSelectedRiskLevels} compact />
        </div>

        <div className={styles.toolbarActions}>
          <span className={styles.selectedCount}>Selected: <strong>{selected.size}</strong></span>
          <span className={styles.shortcuts} title="Keyboard shortcuts">
            [A] Approve · [R] Reject · [→][←] Nav · [Esc] Close
          </span>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={() => runBulk("approve")}
            disabled={saving || selected.size === 0}
            style={{
              background: saving || selected.size === 0 ? "#a7f3d0" : "#059669",
              color: "white",
              cursor: saving || selected.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            Bulk Approve
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={() => runBulk("reject")}
            disabled={saving || selected.size === 0}
            style={{
              background: saving || selected.size === 0 ? "#fecaca" : "#dc2626",
              color: "white",
              cursor: saving || selected.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            Bulk Reject
          </button>
        </div>
      </div>

      <div className={styles.mainLayout}>
        <div className={styles.tableArea}>
          {loading && rows.length === 0 && (
        <div style={{ background: "white", padding: 24, borderRadius: 16 }}>
          Loading moderation queue...
        </div>
          )}

      {refreshing && !loading ? (
        <div style={{ fontSize: 13, color: "#2563eb", marginBottom: 8, fontWeight: 700 }}>
          Refreshing queue...
        </div>
      ) : null}

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 16, borderRadius: 16, marginBottom: 12 }}>
          {error}
        </div>
      )}

          {hasLoadedOnce && !loading && !refreshing && !error && rows.length === 0 && (
            <div style={{ background: "white", padding: 24, borderRadius: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>No products found</div>
              <div style={{ opacity: 0.7, fontSize: 14 }}>Try adjusting filters, search, or check another tab.</div>
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ background: "white", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <table className={styles.compactTable}>
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th style={{ width: 44 }}>Img</th>
                <th style={{ width: 58 }}>Risk</th>
                <th style={{ width: "22%" }}>Title</th>
                <th style={{ width: "14%" }}>Shop</th>
                <th style={{ width: 72 }}>Price</th>
                <th style={{ width: 44 }}>Qty</th>
                <th style={{ width: 110 }}>Created</th>
                <th style={{ width: 88 }}>Status</th>
                <th style={{ width: 168 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((p) => {
                const isChecked = selected.has(p.id);
                const isReviewActive = drawerProductId === p.id;
                return (
                  <tr
                    key={p.id}
                    data-row-id={p.id}
                    className={isReviewActive ? styles.rowReviewActive : undefined}
                    style={{ borderTop: "1px solid #f3f4f6", background: isChecked && !isReviewActive ? "#ecfdf5" : undefined }}
                  >
                    <td>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleOne(p.id)} />
                    </td>
                    <td>
                      <MultiThumbs
                        compact
                        images={p.images || (p.thumbnailUrl ? [p.thumbnailUrl] : [])}
                        onClick={(idx) => {
                          const imgs = p.images || (p.thumbnailUrl ? [p.thumbnailUrl] : []);
                          setGallery({ open: true, images: imgs, index: idx });
                        }}
                      />
                    </td>
                    <td>
                      <PriorityBadge level={p.priorityLevel} />
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "nowrap", overflow: "hidden" }}>
                        <div style={{ fontWeight: 600, color: "#111827", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.partName || "-"}</div>
                        {(p.riskFlags || []).slice(0, 1).map((f, idx) => <RiskBadgeMini key={idx} flag={f} />)}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        #{p.id}{p.partNumber ? ` · ${p.partNumber}` : ""}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.shopName || `shop#${p.shopId}`}</div>
                      <div style={{ fontSize: 10, opacity: 0.6 }}>{p.shopId != null ? `#${p.shopId}` : "-"}</div>
                    </td>
                    <td style={{ fontSize: 11 }}>{p.price != null ? Number(p.price).toLocaleString() : "-"}</td>
                    <td style={{ fontSize: 11 }}>{p.stock != null ? p.stock : "-"}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 10 }}>{formatTime(p.createdAt)}</td>
                    <td>
                      <StatusBadge status={p.moderationStatus} />
                    </td>
                    <td className={styles.actionsCell}>
                      <div className={styles.actionsRow}>
                      <button
                        type="button"
                        className={styles.actionBtnLink}
                        onClick={() => openReviewDrawer(p.id)}
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtnApprove}
                        onClick={() => {
                          setSelected(new Set([p.id]));
                          runBulk("approve");
                        }}
                        disabled={saving}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtnReject}
                        onClick={() => {
                          setSelected(new Set([p.id]));
                          setRejectModalOpen(true);
                        }}
                        disabled={saving}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtnNeutral}
                        onClick={() => openHistory(p.id)}
                        disabled={historyLoading}
                      >
                        History
                      </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderTop: "1px solid #e5e7eb",
              background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              {total > 0
                ? `Showing ${range.from.toLocaleString()}–${range.to.toLocaleString()} of ${total.toLocaleString()} products`
                : "No products on this page"}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <span style={{ opacity: 0.7 }}>Rows</span>
                <select
                  value={String(limit)}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", fontSize: 13 }}
                >
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev || refreshing}
                style={{
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: !canPrev || refreshing ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Prev
              </button>
              {pageNumbers.map((n, idx) => (
                typeof n === "number" ? (
                  <button
                    key={`p-${n}`}
                    type="button"
                    onClick={() => setPage(n)}
                    disabled={refreshing}
                    style={{
                      padding: "5px 9px",
                      borderRadius: 8,
                      border: n === page ? "1px solid #059669" : "1px solid #d1d5db",
                      background: n === page ? "#ecfccb" : "white",
                      cursor: refreshing ? "not-allowed" : "pointer",
                      fontWeight: n === page ? 800 : 600,
                      fontSize: 13,
                      minWidth: 32,
                    }}
                  >
                    {n}
                  </button>
                ) : (
                  <span key={`gap-${idx}`} style={{ opacity: 0.5, fontSize: 13 }}>{n}</span>
                )
              ))}
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext || refreshing}
                style={{
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: !canNext || refreshing ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

        </div>

      </div>

      <ProductReviewDrawer
        open={drawerOpen}
        productId={drawerProductId}
        queueIds={filteredRows.map((r) => r.id)}
        onClose={closeReviewDrawer}
        onNavigate={handleDrawerNavigate}
        onModerated={handleDrawerModerated}
      />

      {gallery.open && (
        <GalleryModal
          images={gallery.images}
          index={gallery.index}
          onClose={() => setGallery({ open: false, images: [], index: 0 })}
        />
      )}

      {/* Toasts */}
      <div style={{ position: "fixed", right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 200 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ background: "#111827", color: "white", padding: "10px 12px", borderRadius: 8, minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}>{t.message}</div>
            {t.undoCallback ? (
              <button type="button" onClick={async () => { try { await t.undoCallback(); } finally { setToasts((s) => s.filter((x) => x.id !== t.id)); } }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>Undo</button>
            ) : null}
          </div>
        ))}
      </div>

      {rejectModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setRejectModalOpen(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 18,
              width: "100%",
              maxWidth: 640,
              boxShadow: "0 20px 48px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Reject products</div>
              <button type="button" onClick={() => setRejectModalOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, fontWeight: 900 }}>×</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Reason (required)</label>
              <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <option value="">-- select reason --</option>
                {Object.keys(REJECT_REASON_LABELS).map((k) => (
                  <option key={k} value={k}>{REJECT_REASON_LABELS[k]}</option>
                ))}
              </select>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {/* Quick presets — one click sets reason and submits */}
                <button type="button" onClick={async () => { setRejectReason("poor_images"); await submitRejectPreset(["poor_images"]); }} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Blurred images</button>
                <button type="button" onClick={async () => { setRejectReason("insufficient_info"); await submitRejectPreset(["insufficient_info"]); }} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Missing description</button>
                <button type="button" onClick={async () => { setRejectReason("wrong_category"); await submitRejectPreset(["wrong_category"]); }} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Wrong category</button>
                <button type="button" onClick={async () => { setRejectReason("spam"); await submitRejectPreset(["spam"]); }} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Spam/Duplicate</button>
                <button type="button" onClick={async () => { setRejectReason("misleading"); await submitRejectPreset(["misleading"]); }} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Suspicious pricing</button>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Notes (optional)</label>
              <textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={4} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setRejectModalOpen(false)} style={{ background: "transparent", border: "1px solid #e5e7eb", padding: "8px 12px", borderRadius: 8 }}>Cancel</button>
              <button type="button" onClick={submitReject} disabled={saving} style={{ background: saving ? "#fecaca" : "#dc2626", color: "white", border: "none", padding: "8px 12px", borderRadius: 8, fontWeight: 800 }}>{saving ? "Rejecting..." : "Reject Products"}</button>
            </div>
          </div>
        </div>
      )}

      {historyOpenFor != null && (
        <div
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            bottom: 0,
            width: 420,
            background: "white",
            borderLeft: "1px solid #e5e7eb",
            zIndex: 90,
            padding: 16,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800 }}>Moderation history — #{historyOpenFor}</div>
            <button type="button" onClick={() => setHistoryOpenFor(null)} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
          {historyLoading && <div>Loading...</div>}
          {historyError && <div style={{ color: "#991b1b" }}>{historyError}</div>}
          {!historyLoading && !historyError && historyRows.length === 0 && <div style={{ opacity: 0.7 }}>No moderation events</div>}
          {!historyLoading && historyRows.map((ev) => (
            <div key={ev.id} style={{ borderTop: "1px solid #f3f4f6", paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{new Date(ev.createdAt).toLocaleString()}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{ev.moderatorEmail || `admin#${ev.moderatorAdminId || "-"}`}</div>
              <div style={{ marginTop: 6 }}>
                <strong>{ev.oldStatus}</strong> → <strong>{ev.newStatus}</strong>
              </div>
              {ev.rejectReason && <div style={{ marginTop: 6, color: "#991b1b" }}>Reason: {ev.rejectReason}</div>}
              {ev.notes && <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{ev.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

