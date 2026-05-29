"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { bulkModerateProducts } from "@/lib/adminApi";
import {
  fetchModerationDetailCached,
  getCachedModerationDetail,
  invalidateModerationDetail,
  prefetchModerationDetail,
} from "@/lib/moderation/moderationDetailCache";
import { REJECT_REASON_LABELS } from "@/components/moderation/ModerationFilters";
import {
  ModerationDetailContent,
  ModerationDetailSkeleton,
  btnSecondary,
} from "@/components/moderation/ModerationDetailPanels";
import styles from "./ProductReviewDrawer.module.css";

function isTypingTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
}

export default function ProductReviewDrawer({
  open,
  productId,
  queueIds = [],
  onClose,
  onNavigate,
  onModerated,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [toast, setToast] = useState("");
  const abortRef = useRef(null);

  const nav = useMemo(() => {
    const id = Number(productId);
    const ids = (queueIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    const idx = ids.indexOf(id);
    return {
      index: idx,
      prevId: idx > 0 ? ids[idx - 1] : null,
      nextId: idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null,
      total: ids.length,
    };
  }, [productId, queueIds]);

  const loadDetail = useCallback(async (id, { useCache = true } = {}) => {
    const pid = Number(id);
    if (!Number.isFinite(pid) || pid <= 0) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const cached = useCache ? getCachedModerationDetail(pid) : null;
    if (cached) {
      setData(cached);
      setLoading(false);
      setError("");
    } else {
      setLoading(true);
      setError("");
    }

    try {
      const next = await fetchModerationDetailCached(pid, { signal: controller.signal, force: !useCache });
      if (controller.signal.aborted) return;
      setData(next);
      setError("");
    } catch (err) {
      if (controller.signal.aborted || err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
      setError(err?.response?.data?.error || err.message || "Failed to load product");
      if (!cached) setData(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !productId) return undefined;
    loadDetail(productId);
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [open, productId, loadDetail]);

  useEffect(() => {
    if (!open) return;
    if (nav.nextId) prefetchModerationDetail(nav.nextId);
    if (nav.prevId) prefetchModerationDetail(nav.prevId);
  }, [open, nav.nextId, nav.prevId]);

  useEffect(() => {
    if (!open) {
      setRejectOpen(false);
      setRejectReason("");
      setRejectNotes("");
      setToast("");
    }
  }, [open]);

  const goNext = useCallback(() => {
    if (nav.nextId) onNavigate?.(nav.nextId);
    else onClose?.();
  }, [nav.nextId, onNavigate, onClose]);

  const goPrev = useCallback(() => {
    if (nav.prevId) onNavigate?.(nav.prevId);
  }, [nav.prevId, onNavigate]);

  const approve = useCallback(async (andNext = false) => {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    setSaving(true);
    try {
      await bulkModerateProducts({ ids: [pid], action: "approve" });
      invalidateModerationDetail(pid);
      setToast("Approved");
      onModerated?.({ action: "approve", productId: pid });
      if (andNext) goNext();
      else await loadDetail(pid, { useCache: false });
    } catch (e) {
      setToast(e?.response?.data?.error || e.message || "Approve failed");
    } finally {
      setSaving(false);
    }
  }, [productId, goNext, loadDetail, onModerated]);

  const reject = useCallback(async (andNext = false) => {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    if (!rejectReason) {
      setToast("Select a reject reason");
      return;
    }
    setSaving(true);
    try {
      await bulkModerateProducts({
        ids: [pid],
        action: "reject",
        reasonCode: rejectReason,
        note: rejectNotes,
      });
      invalidateModerationDetail(pid);
      setRejectOpen(false);
      setRejectReason("");
      setRejectNotes("");
      setToast("Rejected");
      onModerated?.({ action: "reject", productId: pid });
      if (andNext) goNext();
      else await loadDetail(pid, { useCache: false });
    } catch (e) {
      setToast(e?.response?.data?.error || e.message || "Reject failed");
    } finally {
      setSaving(false);
    }
  }, [productId, rejectReason, rejectNotes, goNext, loadDetail, onModerated]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (isTypingTarget(e.target)) return;
      if (rejectOpen) {
        if (e.key === "Escape") setRejectOpen(false);
        return;
      }
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        approve(true);
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setRejectOpen(true);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, rejectOpen, approve, goNext, goPrev, onClose]);

  if (!open) return null;

  const product = data?.product;

  return (
    <>
      <div
        className={`${styles.drawerOverlay} ${open ? styles.drawerOverlayOpen : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`${styles.drawerPanel} ${open ? styles.drawerPanelOpen : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Product review"
      >
        <div className={styles.drawerHeader}>
          <div style={{ minWidth: 0 }}>
            <h2 className={styles.drawerTitle}>
              {product?.partName || (loading ? "Loading…" : `Product #${productId}`)}
            </h2>
            <div className={styles.drawerMeta}>
              #{productId}
              {product?.partNumber ? ` · ${product.partNumber}` : ""}
              {nav.total > 0 && nav.index >= 0 ? ` · Queue ${nav.index + 1}/${nav.total}` : ""}
            </div>
            <Link
              href={`/admin/products/moderation/${productId}`}
              style={{ fontSize: 11, fontWeight: 700, marginTop: 4, display: "inline-block" }}
            >
              Open full page →
            </Link>
          </div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close review">
            ×
          </button>
        </div>

        <div className={styles.drawerBody}>
          {loading && !data ? <ModerationDetailSkeleton /> : null}
          {error ? (
            <div style={{ color: "#991b1b", padding: 12, fontSize: 13 }}>{error}</div>
          ) : null}
          {data ? (
            <ModerationDetailContent
              data={data}
              compact
              onOpenProduct={(id) => onNavigate?.(id)}
            />
          ) : null}
        </div>

        <div className={styles.drawerFooter}>
          <button type="button" className={styles.footerBtnSecondary} onClick={goPrev} disabled={!nav.prevId || saving}>
            Prev
          </button>
          <button type="button" className={styles.footerBtnApprove} disabled={saving} onClick={() => approve(false)}>
            Approve
          </button>
          <button type="button" className={styles.footerBtnReject} disabled={saving} onClick={() => setRejectOpen(true)}>
            Reject
          </button>
          <button type="button" className={styles.footerBtnSecondary} onClick={goNext} disabled={saving}>
            {nav.nextId ? "Next" : "Close"}
          </button>
          {toast ? <span className={styles.footerToast}>{toast}</span> : null}
        </div>
      </aside>

      {rejectOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 130,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setRejectOpen(false)}
        >
          <div
            style={{ background: "white", borderRadius: 10, padding: 16, width: "100%", maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontWeight: 800, marginBottom: 10, fontSize: 15 }}>Reject product</h3>
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", marginBottom: 8, fontSize: 13 }}
            >
              <option value="">Select reason</option>
              {Object.entries(REJECT_REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              placeholder="Notes (optional)"
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", marginBottom: 10, fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setRejectOpen(false)} style={btnSecondary}>Cancel</button>
              <button type="button" disabled={saving} onClick={() => reject(false)} style={{ ...btnSecondary, background: "#dc2626", color: "#fff", border: "none" }}>
                Reject
              </button>
              <button type="button" disabled={saving} onClick={() => reject(true)} style={{ ...btnSecondary, background: "#991b1b", color: "#fff", border: "none" }}>
                Reject + Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
