"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGovernanceDashboard, getGovernanceHealth } from "@/lib/adminApi";
import { formatAdminApiError } from "@/lib/adminApiErrors";
import {
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/AdminLoadState";

const sectionStyle = {
  background: "white",
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  marginBottom: 16,
};

const priorityColor = {
  CRITICAL: "#991b1b",
  HIGH: "#c2410c",
  MEDIUM: "#b45309",
  LOW: "#374151",
};

export default function GovernanceDashboardPage() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [healthError, setHealthError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setHealthError("");
      const [dashRes, healthRes] = await Promise.all([
        getGovernanceDashboard(),
        getGovernanceHealth().catch((healthErr) => {
          setHealthError(formatAdminApiError(healthErr, { module: "governance-health" }));
          return { data: null };
        }),
      ]);
      setData(dashRes.data || {});
      setHealth(healthRes.data || null);
    } catch (e) {
      console.error(e);
      setData(null);
      setHealth(null);
      setError(formatAdminApiError(e, { module: "governance" }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <AdminLoadingState message="Loading governance dashboard..." />;
  if (error) {
    return (
      <AdminErrorState
        title="Governance dashboard unavailable"
        message={error}
        onRetry={load}
      />
    );
  }

  const moderation = data.moderation || {};
  const risk = data.risk || {};
  const marketplace = data.marketplace || {};
  const queue = data.queue || {};
  const sessions = data.sessions || {};
  const recent = data.recentActivity || [];
  const criticalShops = data.criticalShops || [];
  const criticalProducts = data.criticalProducts || [];
  const alerts = data.alerts || {};
  const enforcementEvents = data.recentEnforcementEvents || [];

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Governance Dashboard</h1>

      {healthError ? (
        <div
          style={{
            ...sectionStyle,
            background: "#fff7ed",
            borderColor: "#fed7aa",
            color: "#92400e",
            marginBottom: 20,
          }}
        >
          <strong>Health metrics unavailable.</strong> {healthError}
        </div>
      ) : null}

      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/shop-risk" style={{ color: "#2563eb", fontWeight: 700 }}>
          View shop risk scores →
        </Link>
      </div>

      {health ? (
        <section style={{ ...sectionStyle, marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Governance Health</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <HealthCard
              title="Worker"
              value={health.worker?.online ? "Online" : "Offline"}
              tone={health.worker?.online ? "#065f46" : "#991b1b"}
              detail={`${health.worker?.status || "unknown"}${health.worker?.lock?.locked ? " · lock held" : ""}`}
            />
            <HealthCard
              title="Last evaluation"
              value={health.evaluation?.lastRunAt ? new Date(health.evaluation.lastRunAt).toLocaleString() : "—"}
              detail={`${health.evaluation?.productsScanned ?? 0} scanned · ${health.evaluation?.failures ?? 0} failures`}
            />
            <HealthCard
              title="Cache age"
              value={health.cache?.ageMs != null ? `${Math.round(health.cache.ageMs / 1000)}s` : health.cache?.cached ? "fresh" : "empty"}
              detail={health.cache?.cached ? `TTL ${Math.round((health.cache.ttlMs || 0) / 1000)}s` : "not cached"}
            />
            <HealthCard
              title="Slow queries"
              value={health.slowQueries?.count ?? 0}
              detail={`${health.pendingEvaluations ?? 0} pending evaluations`}
            />
          </div>
          {health.worker?.lastError ? (
            <div style={{ marginTop: 10, fontSize: 13, color: "#991b1b" }}>
              Worker note: {health.worker.lastError}
            </div>
          ) : null}
        </section>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <Card title="Pending review" value={moderation.pending} />
        <Card title="Approved today" value={moderation.approvedToday} />
        <Card title="Rejected today" value={moderation.rejectedToday} />
        <Card title="Active sessions" value={sessions.active} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <Card title="Critical risk" value={risk.critical} />
        <Card title="High risk" value={risk.high} />
        <Card title="Public shops" value={marketplace.publicShops} />
        <Card title="Public products" value={marketplace.publicProducts} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={sectionStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Critical Shops</h2>
          {criticalShops.length ? (
            criticalShops.map((shop) => (
              <div key={shop.shopId} style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <Link href={`/admin/shops/${shop.shopId}/governance`} style={{ fontWeight: 800, color: "#111827" }}>
                    {shop.shopName || `Shop #${shop.shopId}`}
                  </Link>
                  <Badge level={shop.priorityLevel} />
                </div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                  Max score {shop.maxRiskScore} · {shop.criticalProducts} critical · {shop.highProducts} high
                </div>
              </div>
            ))
          ) : (
            <div style={{ opacity: 0.65 }}>No critical shops detected.</div>
          )}
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Critical Products</h2>
          {criticalProducts.length ? (
            criticalProducts.map((product) => (
              <div key={product.productId} style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>Product #{product.productId}</div>
                  <Badge level={product.priorityLevel} />
                </div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                  {product.shopName || `Shop #${product.shopId}`} · score {product.riskScore}
                </div>
                {product.flags?.length ? (
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                    Flags: {product.flags.map((f) => f.code).join(", ")}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div style={{ opacity: 0.65 }}>No critical products detected.</div>
          )}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={sectionStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>High-Risk Shop Alerts</h2>
          {(alerts.highRiskShops || []).length ? (
            alerts.highRiskShops.map((shop) => (
              <div key={`alert-shop-${shop.shopId}`} style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>
                <Link href={`/admin/shops/${shop.shopId}/governance`} style={{ fontWeight: 700 }}>
                  {shop.shopName || `Shop #${shop.shopId}`}
                </Link>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  Score {shop.maxRiskScore} · {shop.highOrCriticalProducts} high/critical products
                </div>
              </div>
            ))
          ) : (
            <div style={{ opacity: 0.65 }}>No high-risk shop alerts.</div>
          )}
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>High-Risk Product Alerts</h2>
          {(alerts.highRiskProducts || []).length ? (
            alerts.highRiskProducts.map((product) => (
              <div key={`alert-product-${product.productId}`} style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ fontWeight: 700 }}>Product #{product.productId}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {product.shopName || `Shop #${product.shopId}`} · score {product.riskScore}
                </div>
              </div>
            ))
          ) : (
            <div style={{ opacity: 0.65 }}>No high-risk product alerts.</div>
          )}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Recent Enforcement Events</h2>
        {enforcementEvents.length ? (
          enforcementEvents.map((ev) => (
            <div key={ev.id} style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 800 }}>
                  {ev.eventType === "governance_note" ? "Governance action" : "Moderation event"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : "—"}
                </div>
              </div>
              <div style={{ marginTop: 4 }}>{ev.summary}</div>
              {ev.shopName ? (
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                  Shop: {ev.shopName}
                  {ev.shopId ? (
                    <>
                      {" "}
                      (<Link href={`/admin/shops/${ev.shopId}/governance`}>open</Link>)
                    </>
                  ) : null}
                </div>
              ) : null}
              {ev.actorEmail ? <div style={{ fontSize: 13, opacity: 0.75 }}>By {ev.actorEmail}</div> : null}
              {ev.notes ? <div style={{ marginTop: 4, whiteSpace: "pre-wrap", fontSize: 13 }}>{ev.notes}</div> : null}
            </div>
          ))
        ) : (
          <div style={{ opacity: 0.65 }}>No recent enforcement events.</div>
        )}
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Queue health</h2>
        <div>Pending: {queue.pending}</div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Recent activity</h2>
        <div style={{ marginTop: 8 }}>
          {recent.map((ev) => (
            <div key={ev.id} style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ fontWeight: 800 }}>{ev.moderatorEmail || `admin#${ev.moderatorAdminId || "-"}`}</div>
              <div style={{ marginTop: 4 }}>
                {new Date(ev.createdAt).toLocaleString()} — {ev.oldStatus} → {ev.newStatus} — #{ev.productId}
              </div>
              {ev.rejectReason && <div style={{ color: "#991b1b" }}>Reason: {ev.rejectReason}</div>}
              {ev.notes && <div style={{ whiteSpace: "pre-wrap" }}>{ev.notes}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div style={{ background: "white", padding: 16, borderRadius: 12, border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value != null ? String(value) : "-"}</div>
    </div>
  );
}

function Badge({ level }) {
  const text = String(level || "LOW").toUpperCase();
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: priorityColor[text] || priorityColor.LOW,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      {text}
    </span>
  );
}

function HealthCard({ title, value, detail, tone }) {
  return (
    <div style={{ background: "#f9fafb", padding: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: tone || "#111827" }}>{value}</div>
      {detail ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{detail}</div> : null}
    </div>
  );
}
