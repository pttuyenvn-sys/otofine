"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { bulkModerateProducts } from "@/lib/adminApi";
import { REJECT_REASON_LABELS } from "@/components/moderation/ModerationFilters";
import {
  ModerationDetailContent,
  btnSecondary,
} from "@/components/moderation/ModerationDetailPanels";
import {
  fetchModerationDetailCached,
  invalidateModerationDetail,
  prefetchModerationDetail,
} from "@/lib/moderation/moderationDetailCache";

const QUEUE_STORAGE_KEY = "moderationQueueOrder";

const btnPrimary = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

export default function ProductModerationDetail() {
  const params = useParams();
  const router = useRouter();
  const productId = Number(params?.id);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [toast, setToast] = useState("");

  const queueIds = useMemo(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(QUEUE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n)) : [];
    } catch {
      return [];
    }
  }, [productId]);

  const nav = useMemo(() => {
    const idx = queueIds.indexOf(productId);
    return {
      index: idx,
      prevId: idx > 0 ? queueIds[idx - 1] : null,
      nextId: idx >= 0 && idx < queueIds.length - 1 ? queueIds[idx + 1] : null,
      total: queueIds.length,
    };
  }, [queueIds, productId]);

  const load = useCallback(async () => {
    if (!Number.isFinite(productId) || productId <= 0) return;
    try {
      setLoading(true);
      setError("");
      const next = await fetchModerationDetailCached(productId);
      setData(next);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to load product");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (nav.nextId) prefetchModerationDetail(nav.nextId);
    if (nav.prevId) prefetchModerationDetail(nav.prevId);
  }, [nav.nextId, nav.prevId]);

  const goNext = useCallback(() => {
    if (nav.nextId) router.push(`/admin/products/moderation/${nav.nextId}`);
    else router.push("/admin/products/moderation");
  }, [nav.nextId, router]);

  const goPrev = useCallback(() => {
    if (nav.prevId) router.push(`/admin/products/moderation/${nav.prevId}`);
  }, [nav.prevId, router]);

  const approve = useCallback(async (andNext = false) => {
    setSaving(true);
    try {
      await bulkModerateProducts({ ids: [productId], action: "approve" });
      invalidateModerationDetail(productId);
      setToast("Approved");
      if (andNext) goNext();
      else await load();
    } catch (e) {
      setToast(e?.response?.data?.error || e.message || "Approve failed");
    } finally {
      setSaving(false);
    }
  }, [productId, goNext, load]);

  const reject = useCallback(async (andNext = false) => {
    if (!rejectReason) {
      setToast("Select a reject reason");
      return;
    }
    setSaving(true);
    try {
      await bulkModerateProducts({
        ids: [productId],
        action: "reject",
        reasonCode: rejectReason,
        note: rejectNotes,
      });
      invalidateModerationDetail(productId);
      setRejectOpen(false);
      setRejectReason("");
      setRejectNotes("");
      setToast("Rejected");
      if (andNext) goNext();
      else await load();
    } catch (e) {
      setToast(e?.response?.data?.error || e.message || "Reject failed");
    } finally {
      setSaving(false);
    }
  }, [productId, rejectReason, rejectNotes, goNext, load]);

  useEffect(() => {
    function onKey(e) {
      const tag = String(e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      if (rejectOpen) return;
      if (e.key === "a" || e.key === "A") approve(true);
      if (e.key === "r" || e.key === "R") setRejectOpen(true);
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") router.push("/admin/products/moderation");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approve, goNext, goPrev, rejectOpen, router]);

  if (loading) return <div>Loading moderation detail...</div>;
  if (error) return <div style={{ color: "#991b1b" }}>{error}</div>;
  if (!data) return <div>Product not found.</div>;

  const { product, shop } = data;

  return (
    <div style={{ paddingBottom: 96 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <Link href="/admin/products/moderation" style={{ fontSize: 13, fontWeight: 700 }}>← Back to queue</Link>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{product.partName || `Product #${product.id}`}</h1>
          <div style={{ opacity: 0.75 }}>
            #{product.id} · {shop?.name || `Shop #${shop?.id}`}
            {nav.total > 0 ? ` · Queue ${nav.index + 1}/${nav.total}` : ""}
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, textAlign: "right" }}>
          Shortcuts: A approve+next · R reject · ←/→ navigate · Esc queue
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <ModerationDetailContent data={data} />
      </div>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(255,255,255,0.96)",
          borderTop: "1px solid #e5e7eb",
          padding: "12px 24px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          zIndex: 40,
          backdropFilter: "blur(6px)",
        }}
      >
        <button type="button" onClick={goPrev} disabled={!nav.prevId} style={btnSecondary}>‹ Prev</button>
        <button type="button" disabled={saving} onClick={() => approve(false)} style={{ ...btnPrimary, background: "#059669" }}>Approve</button>
        <button type="button" disabled={saving} onClick={() => approve(true)} style={{ ...btnPrimary, background: "#047857" }}>Approve + Next</button>
        <button type="button" disabled={saving} onClick={() => setRejectOpen(true)} style={{ ...btnPrimary, background: "#dc2626" }}>Reject</button>
        <button type="button" onClick={goNext} style={btnSecondary}>{nav.nextId ? "Next ›" : "Back to queue"}</button>
        {toast ? <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700 }}>{toast}</div> : null}
      </div>

      {rejectOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "white", borderRadius: 12, padding: 20, width: "100%", maxWidth: 520 }}>
            <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Reject product</h3>
            <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 10 }}>
              <option value="">Select reason</option>
              {Object.entries(REJECT_REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={3} placeholder="Notes (optional)" style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setRejectOpen(false)} style={btnSecondary}>Cancel</button>
              <button type="button" disabled={saving} onClick={() => reject(false)} style={{ ...btnPrimary, background: "#dc2626" }}>Reject</button>
              <button type="button" disabled={saving} onClick={() => reject(true)} style={{ ...btnPrimary, background: "#991b1b" }}>Reject + Next</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
