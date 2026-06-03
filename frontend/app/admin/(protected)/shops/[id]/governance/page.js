"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getShopGovernance, postShopGovernanceAction } from "@/lib/adminApi";
import { formatAdminApiError } from "@/lib/adminApiErrors";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/AdminLoadState";

const GOVERNANCE_ACTIONS = [
  {
    action: "force_private",
    label: "Force Private",
    description: "Set this shop's public status to private. The storefront will no longer be publicly visible.",
    tone: "#dc2626",
  },
  {
    action: "require_re_review",
    label: "Require Re-review",
    description: "Move all shop products back to pending review and record a moderation event for each affected product.",
    tone: "#d97706",
  },
  {
    action: "suspend_uploads",
    label: "Suspend Uploads",
    description: "Record an admin note that uploads are suspended for this shop (soft action).",
    tone: "#7c3aed",
  },
];

const sectionStyle = {
  background: "white",
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  marginBottom: 12,
};

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "#374151",
};

const textareaStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  resize: "vertical",
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: "#111827",
};

function Card({ title, value }) {
  return (
    <div style={{ background: "white", padding: 16, borderRadius: 12, border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value != null ? String(value) : "-"}</div>
    </div>
  );
}

function GovernanceActionModal({ config, note, setNote, submitting, error, onClose, onConfirm }) {
  if (!config) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 20px 48px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: "#111827" }}>
            Confirm: {config.label}
          </div>
          <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.5 }}>{config.description}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="governance-action-note" style={labelStyle}>
            Moderator note <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <textarea
            id="governance-action-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain why this action is being taken..."
            rows={4}
            disabled={submitting}
            style={textareaStyle}
          />
        </div>

        {error ? (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
              color: "#374151",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || !note.trim()}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: submitting || !note.trim() ? "#fca5a5" : config.tone,
              color: "white",
              cursor: submitting || !note.trim() ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {submitting ? "Processing..." : `Confirm ${config.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineEntry({ entry }) {
  if (!entry) return null;

  const ts = entry.ts || entry.data?.createdAt || entry.data?.created_at;
  const when = ts ? new Date(ts).toLocaleString() : "Unknown time";

  if (entry.type === "note") {
    const note = entry.data || {};
    return (
      <div style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <div style={{ fontWeight: 800, color: "#7c3aed" }}>Internal note</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{when}</div>
        </div>
        <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{note.content}</div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
          By admin #{note.author_id || note.authorId || "-"}
        </div>
      </div>
    );
  }

  const ev = entry.data || {};
  return (
    <div style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontWeight: 800 }}>
          {ev.moderatorEmail || `admin#${ev.moderatorAdminId || "-"}`}
        </div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{when}</div>
      </div>
      <div style={{ marginTop: 4 }}>
        Product #{ev.productId}: {ev.oldStatus || "—"} → {ev.newStatus || "—"}
      </div>
      {ev.rejectReason ? <div style={{ color: "#991b1b", marginTop: 4 }}>Reason: {ev.rejectReason}</div> : null}
      {ev.notes ? <div style={{ marginTop: 4, whiteSpace: "pre-wrap", opacity: 0.85 }}>{ev.notes}</div> : null}
    </div>
  );
}

export default function ShopGovernancePage() {
  const params = useParams();
  const shopId = params?.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [confirmAction, setConfirmAction] = useState(null);
  const [actionIdempotencyKey, setActionIdempotencyKey] = useState("");
  const [noteIdempotencyKey, setNoteIdempotencyKey] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const [internalNote, setInternalNote] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ message, type = "info", duration = 5000 }) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      setLoading(true);
      setError("");
      const res = await getShopGovernance(shopId);
      setData(res.data || {});
    } catch (e) {
      console.error(e);
      setError(formatAdminApiError(e, {
        module: "shop-governance",
        permissionDenied: "You do not have permission to view this shop's governance profile.",
      }));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  function createIdempotencyKey() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `gov-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function openActionModal(actionKey) {
    const config = GOVERNANCE_ACTIONS.find((a) => a.action === actionKey);
    if (!config) return;
    setActionError("");
    setActionNote("");
    setActionIdempotencyKey(createIdempotencyKey());
    setConfirmAction(config);
  }

  function closeActionModal() {
    if (actionSubmitting) return;
    setConfirmAction(null);
    setActionNote("");
    setActionError("");
  }

  async function submitGovernanceAction() {
    if (!confirmAction || !actionNote.trim()) return;

    setActionSubmitting(true);
    setActionError("");

    try {
      const res = await postShopGovernanceAction(shopId, {
        action: confirmAction.action,
        note: actionNote.trim(),
        idempotencyKey: actionIdempotencyKey,
      });

      const extra =
        confirmAction.action === "require_re_review" && res.data?.updated != null
          ? ` (${res.data.updated} products updated)`
          : "";
      const idempotent = res.data?.idempotent ? " (idempotent)" : "";

      addToast({
        message: `${confirmAction.label} completed successfully${extra}${idempotent}`,
        type: "success",
      });
      closeActionModal();
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "Action failed";
      setActionError(msg);
      addToast({ message: msg, type: "error" });
    } finally {
      setActionSubmitting(false);
    }
  }

  async function submitInternalNote(e) {
    e.preventDefault();
    if (!internalNote.trim()) {
      addToast({ message: "Internal note cannot be empty", type: "error" });
      return;
    }

    setNoteSubmitting(true);
    const key = noteIdempotencyKey || createIdempotencyKey();
    if (!noteIdempotencyKey) setNoteIdempotencyKey(key);
    try {
      await postShopGovernanceAction(shopId, {
        action: "add_note",
        note: internalNote.trim(),
        idempotencyKey: key,
      });
      setInternalNote("");
      setNoteIdempotencyKey("");
      addToast({ message: "Internal note added", type: "success" });
      await load();
    } catch (e) {
      addToast({
        message: e?.response?.data?.error || e.message || "Failed to add note",
        type: "error",
      });
    } finally {
      setNoteSubmitting(false);
    }
  }

  if (loading) return <AdminLoadingState message="Loading shop governance..." />;
  if (error) {
    return (
      <AdminErrorState
        title="Shop governance unavailable"
        message={error}
        onRetry={load}
      />
    );
  }

  const { overview, moderation, risk, recentActivity, timeline, internalNotes } = data || {};
  const timelineEntries = (timeline?.length ? timeline : [
    ...(recentActivity || []).map((r) => ({ type: "event", ts: r.createdAt, data: r })),
    ...(internalNotes || []).map((n) => ({ type: "note", ts: n.created_at || n.createdAt, data: n })),
  ]).sort((a, b) => {
    const ta = new Date(a.ts || 0).getTime() || 0;
    const tb = new Date(b.ts || 0).getTime() || 0;
    return tb - ta;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
            {overview?.name || `Shop #${shopId}`}
          </h1>
          <div style={{ opacity: 0.7 }}>Shop Governance Console</div>
        </div>
        <button
          type="button"
          onClick={load}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <Card title="Pending review" value={moderation?.pending} />
        <Card title="Approved" value={moderation?.approved} />
        <Card title="Rejected" value={moderation?.rejected} />
        <Card title="Public status" value={overview?.public_status} />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div>
          <section style={sectionStyle}>
            <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Overview</h2>
            <div>Slug: {overview?.slug || "—"}</div>
            <div>Verified at: {overview?.verified_at ? new Date(overview.verified_at).toLocaleString() : "—"}</div>
            <div>Published at: {overview?.published_at ? new Date(overview.published_at).toLocaleString() : "—"}</div>
            <div>Created: {overview?.createdAt ? new Date(overview.createdAt).toLocaleString() : "—"}</div>
          </section>

          <section style={sectionStyle}>
            <h2 style={{ fontWeight: 800, marginBottom: 12 }}>Governance Actions</h2>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
              Soft governance operations recorded as admin notes. Each action requires a moderator note.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {GOVERNANCE_ACTIONS.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => openActionModal(item.action)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1px solid ${item.tone}`,
                    background: "white",
                    color: item.tone,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={{ fontWeight: 800, marginBottom: 12 }}>Internal Notes</h2>
            <form onSubmit={submitInternalNote}>
              <label htmlFor="internal-note" style={labelStyle}>
                Add internal note <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <textarea
                id="internal-note"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Record an admin-only note for this shop..."
                rows={4}
                disabled={noteSubmitting}
                style={{ ...textareaStyle, marginBottom: 10 }}
              />
              <button
                type="submit"
                disabled={noteSubmitting || !internalNote.trim()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: noteSubmitting || !internalNote.trim() ? "#93c5fd" : "#2563eb",
                  color: "white",
                  fontWeight: 700,
                  cursor: noteSubmitting || !internalNote.trim() ? "not-allowed" : "pointer",
                }}
              >
                {noteSubmitting ? "Saving..." : "Add Internal Note"}
              </button>
            </form>

            <div style={{ marginTop: 16 }}>
              {internalNotes?.length ? (
                internalNotes.map((n) => (
                  <div key={n.id} style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontWeight: 700 }}>By admin #{n.author_id || n.authorId || "-"}</div>
                    <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{n.content}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      {n.created_at || n.createdAt ? new Date(n.created_at || n.createdAt).toLocaleString() : "—"}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.65 }}>No internal notes yet.</div>
              )}
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={{ fontWeight: 800, marginBottom: 12 }}>Timeline</h2>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
              Combined moderation events and internal notes ({timelineEntries.length})
            </div>
            {timelineEntries.length ? (
              timelineEntries.map((entry, idx) => (
                <TimelineEntry
                  key={`${entry.type}-${entry.data?.id || entry.data?.productId || idx}`}
                  entry={entry}
                />
              ))
            ) : (
              <div style={{ opacity: 0.65 }}>No timeline activity yet.</div>
            )}
          </section>
        </div>

        <aside>
          <section style={sectionStyle}>
            <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Risk</h2>
            <div>Critical: {risk?.critical ?? 0}</div>
            <div>High: {risk?.high ?? 0}</div>
            <div>Medium: {risk?.medium ?? 0}</div>
            <div>Low: {risk?.low ?? 0}</div>
          </section>

          <section style={sectionStyle}>
            <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Recent Activity</h2>
            {recentActivity?.length ? (
              recentActivity.slice(0, 10).map((ev) => (
                <div key={ev.id} style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontWeight: 700 }}>
                    {ev.moderatorEmail || `admin#${ev.moderatorAdminId || "-"}`}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13 }}>
                    {new Date(ev.createdAt).toLocaleString()} — {ev.oldStatus} → {ev.newStatus} — #{ev.productId}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ opacity: 0.65 }}>No recent moderation events.</div>
            )}
          </section>
        </aside>
      </div>

      <GovernanceActionModal
        config={confirmAction}
        note={actionNote}
        setNote={setActionNote}
        submitting={actionSubmitting}
        error={actionError}
        onClose={closeActionModal}
        onConfirm={submitGovernanceAction}
      />

      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 200,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.type === "error" ? "#991b1b" : t.type === "success" ? "#065f46" : "#111827",
              color: "white",
              padding: "10px 12px",
              borderRadius: 8,
              minWidth: 240,
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
