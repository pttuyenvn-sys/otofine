"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { API_BASE } from "@/lib/config";
import ShopInboxVehicleFilters from "@/components/rfq/ShopInboxVehicleFilters";
import {
  SHOP_INBOX_STATUS_FILTERS,
  buildInboxQueryParams,
} from "@/lib/rfq/rfqInboxFilters";

function normalizeTs(v) {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v;
  try {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  } catch {
    /* fall through */
  }
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  } catch {
    /* ignore */
  }
  return String(v);
}

function buildInboxSnapshot(rows, unreadCount) {
  const ids = rows.map((r) => r.id).join(",");
  const body = rows
    .map((r) => {
      const u = normalizeTs(r.updated_at);
      return `${r.id}:${r.status ?? ""}:${r.rfq_status ?? ""}:${u}:${normalizeTs(r.first_viewed_at)}:${normalizeTs(r.respond_by)}`;
    })
    .join("|");
  return `${unreadCount}#${ids}#${body}`;
}

function formatSla(respondBy, rfqExpiresAt, _tick) {
  void _tick;
  const endMs = respondBy
    ? new Date(respondBy).getTime()
    : rfqExpiresAt
      ? new Date(rfqExpiresAt).getTime()
      : NaN;
  if (!Number.isFinite(endMs)) return null;
  const ms = endMs - Date.now();
  if (ms <= 0) return { label: "Hết hạn", variant: "late" };

  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const totalHour = Math.floor(totalMin / 60);

  let label;
  if (totalHour >= 48) {
    label = `${Math.floor(totalHour / 24)} ngày`;
  } else if (totalHour >= 1) {
    label = `${totalHour}h ${min}m ${sec}s`;
  } else if (totalMin >= 1) {
    label = `${min} phút ${sec}s`;
  } else {
    label = `${sec} giây`;
  }

  const variant = ms < 3600000 ? "soon" : "ok";
  return { label, variant };
}

export default function RfqSellerInboxPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("sla");
  const [offset, setOffset] = useState(0);
  const [limit] = useState(24);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageUnreadTotal, setMessageUnreadTotal] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [quotedCount, setQuotedCount] = useState(0);
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [slaTick, setSlaTick] = useState(0);

  const lastSnapshotRef = useRef("");
  const itemsLenRef = useRef(0);
  itemsLenRef.current = items.length;

  const loginBlocked =
    typeof msg === "string" &&
    (msg.includes("đăng nhập") || msg.includes("/shop/login"));

  const pollFirstPage = typeof window !== "undefined" && !loginBlocked && offset === 0;

  const listParams = () =>
    buildInboxQueryParams({
      filter,
      sort,
      limit,
      offset: 0,
      brand: vehicleBrand,
      model: vehicleModel,
      year: vehicleYear,
      categoryKey,
    });

  function applySummary(sumRes) {
    setUnreadCount(Number(sumRes.data?.unreadCount ?? 0));
    setMessageUnreadTotal(Number(sumRes.data?.messageUnreadTotal ?? 0));
    setWaitingCount(Number(sumRes.data?.waitingCount ?? 0));
    setQuotedCount(Number(sumRes.data?.quotedCount ?? 0));
  }

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      lastSnapshotRef.current = "";
      setMsg("Cần đăng nhập shop (/shop/login).");
      setLoading(false);
      setItems([]);
      setUnreadCount(0);
      setWaitingCount(0);
      setQuotedCount(0);
      setHasMore(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setMsg("");
    setOffset(0);
    setItems([]);
    lastSnapshotRef.current = "";

    (async () => {
      try {
        const [listRes, sumRes] = await Promise.all([
          axios.get(`${API_BASE}/shop/rfq/inbox`, {
            headers: { Authorization: `Bearer ${token}` },
            params: listParams(),
          }),
          axios.get(`${API_BASE}/shop/rfq/inbox/summary`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (cancelled) return;
        const rows = listRes.data.items || [];
        const unread = Number(sumRes.data?.unreadCount ?? 0);
        const snap = buildInboxSnapshot(rows, unread);
        lastSnapshotRef.current = snap;
        setItems(rows);
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
  }, [filter, sort, limit, vehicleBrand, vehicleModel, vehicleYear, categoryKey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const token = localStorage.getItem("token");
    if (!token || loginBlocked) return undefined;

    let pollIntervalId = null;
    let slaTickIntervalId = null;

    function stopTimersOnly() {
      if (pollIntervalId != null) {
        window.clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (slaTickIntervalId != null) {
        window.clearInterval(slaTickIntervalId);
        slaTickIntervalId = null;
      }
    }

    async function silentFetchFirstPage() {
      if (!pollFirstPage) return;
      try {
        const [listRes, sumRes] = await Promise.all([
          axios.get(`${API_BASE}/shop/rfq/inbox`, {
            headers: { Authorization: `Bearer ${token}` },
            params: listParams(),
          }),
          axios.get(`${API_BASE}/shop/rfq/inbox/summary`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const rows = listRes.data.items || [];
        const unread = Number(sumRes.data?.unreadCount ?? 0);
        const snap = buildInboxSnapshot(rows, unread);
        if (snap === lastSnapshotRef.current) return;
        lastSnapshotRef.current = snap;
        setItems(rows);
        applySummary(sumRes);
        setHasMore(rows.length >= limit);
      } catch {
        /* keep list */
      }
    }

    function startIntervalsIfVisible() {
      stopTimersOnly();
      if (document.visibilityState !== "visible") return;

      slaTickIntervalId = window.setInterval(() => {
        if (itemsLenRef.current <= 0) return;
        setSlaTick((t) => t + 1);
      }, 1000);

      if (pollFirstPage) {
        pollIntervalId = window.setInterval(() => {
          void silentFetchFirstPage();
        }, 5000);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        return;
      }
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
  ]);

  function loadMore() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    const next = offset + limit;
    setLoading(true);
    axios
      .get(`${API_BASE}/shop/rfq/inbox`, {
        headers: { Authorization: `Bearer ${token}` },
        params: buildInboxQueryParams({
          filter,
          sort,
          limit,
          offset: next,
          brand: vehicleBrand,
          model: vehicleModel,
          year: vehicleYear,
          categoryKey,
        }),
      })
      .then((res) => {
        const rows = res.data.items || [];
        setItems((prev) => [...prev, ...rows]);
        setHasMore(rows.length >= limit);
        setOffset(next);
      })
      .catch(() => setMsg("Không tải thêm."))
      .finally(() => setLoading(false));
  }

  return (
    <div className="rfq-seller-wide rfq-inbox-page">
      <header className="rfq-inbox-header">
        <div>
          <h1 className="rfq-inbox-title">RFQ · Inbox</h1>
          <p className="muted rfq-inbox-sub">
            Lọc theo xe chuẩn hóa — giúp shop phản hồi nhanh trước khi có hội thoại.
          </p>
        </div>
        <div className="rfq-inbox-badges" aria-label="Tổng quan inbox">
          {unreadCount > 0 ? (
            <span className="rfq-unread-badge">
              {unreadCount > 99 ? "99+" : unreadCount} RFQ mới
            </span>
          ) : (
            <span className="rfq-unread-badge rfq-unread-badge--muted">Đã xem hết RFQ</span>
          )}
          {messageUnreadTotal > 0 ? (
            <span className="rfq-unread-badge rfq-unread-badge--chat">
              {messageUnreadTotal > 99 ? "99+" : messageUnreadTotal} tin nhắn
            </span>
          ) : null}
          {waitingCount > 0 ? (
            <span className="rfq-pill rfq-pill--waiting">{waitingCount} chờ báo giá</span>
          ) : null}
          {quotedCount > 0 ? (
            <span className="rfq-pill rfq-pill--quoted">{quotedCount} đã báo giá</span>
          ) : null}
        </div>
      </header>

      <div className="rfq-toolbar rfq-toolbar--sticky">
        <div className="rfq-chip-row">
          {SHOP_INBOX_STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`rfq-chip ${filter === f.id ? "rfq-chip--active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ShopInboxVehicleFilters
          brand={vehicleBrand}
          model={vehicleModel}
          year={vehicleYear}
          categoryKey={categoryKey}
          onChange={({ brand, model, year, categoryKey: ck }) => {
            setVehicleBrand(brand || "");
            setVehicleModel(model || "");
            setVehicleYear(year || "");
            setCategoryKey(ck || "");
          }}
        />
        <div className="rfq-sort-row">
          <label className="rfq-sort-label">
            Sắp xếp
            <select className="rfq-sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="sla">Theo SLA (khẩn → nhẹ)</option>
              <option value="recent">Mới nhất</option>
            </select>
          </label>
        </div>
      </div>

      {msg && <p className="rfq-banner-error">{msg}</p>}

      {loading && !items.length ? (
        <ul className="rfq-inbox-list" aria-busy="true" aria-label="Đang tải">
          {[1, 2, 3].map((i) => (
            <li key={i} className="rfq-inbox-card rfq-inbox-card--skeleton">
              <div className="rfq-skel rfq-skel--title" />
              <div className="rfq-skel rfq-skel--line" />
              <div className="rfq-skel rfq-skel--line rfq-skel--short" />
              <div className="rfq-skel rfq-skel--actions" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="rfq-inbox-list">
          {items.map((d) => {
            const unread = d.is_unread ?? !d.first_viewed_at;
            const chatUnread = Number(d.message_unread_count ?? 0);
            const sla = formatSla(d.respond_by, d.rfq_expires_at, slaTick);
            const quoted =
              d.has_submitted_quote || d.status === "quoted";
            const waiting = d.needs_shop_response ?? (!quoted && unread === false);
            const urgent =
              sla && (sla.variant === "soon" || sla.variant === "late") && !quoted;
            const vehicleLabel = d.vehicle_label || "";
            return (
              <li
                key={d.id}
                className={`rfq-inbox-card ${unread ? "rfq-inbox-card--unread" : ""} ${urgent ? "rfq-inbox-card--urgent" : ""}`}
              >
                <div className="rfq-inbox-card-top">
                  <Link href={`/rfq/shop/${d.id}#rq-quote`} className="rfq-inbox-title-link">
                    #{d.public_id?.slice(0, 8) || d.id}
                    {unread && <span className="rfq-dot" aria-hidden />}
                  </Link>
                  <div className="rfq-inbox-meta">
                    {sla && (
                      <span className={`rfq-sla rfq-sla--${sla.variant}`} title="SLA gợi ý">
                        {sla.variant === "late" ? "⚠ " : sla.variant === "soon" ? "▶ " : ""}
                        {sla.label}
                      </span>
                    )}
                    {quoted && <span className="rfq-pill rfq-pill--quoted">Đã báo giá</span>}
                    {!quoted && waiting && (
                      <span className="rfq-pill rfq-pill--waiting">Chờ báo giá</span>
                    )}
                    {!quoted && unread && (
                      <span className="rfq-pill rfq-pill--new">Chưa đọc</span>
                    )}
                    {chatUnread > 0 && (
                      <span className="rfq-pill rfq-pill--chat-unread">
                        {chatUnread > 9 ? "9+" : chatUnread} tin nhắn
                      </span>
                    )}
                    {!quoted && !unread && !waiting && d.first_viewed_at && (
                      <span className="rfq-pill rfq-pill--seen">Đã xem</span>
                    )}
                  </div>
                </div>
                {vehicleLabel ? (
                  <p className="rfq-inbox-vehicle muted">🚗 {vehicleLabel}</p>
                ) : null}
                <p className="rfq-inbox-snippet">
                  {(d.part_description || "").slice(0, 160)}
                  {(d.part_description || "").length > 160 ? "…" : ""}
                </p>
                <div className="rfq-inbox-actions">
                  <Link
                    href={`/rfq/shop/${d.id}#rq-quote`}
                    className="rfq-btn rfq-btn--primary rfq-btn--sm rfq-btn--touch-main"
                  >
                    Báo giá ngay
                  </Link>
                  <Link href={`/rfq/shop/${d.id}`} className="rfq-btn rfq-btn--ghost rfq-btn--sm rfq-btn--touch">
                    Chi tiết
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !items.length && !msg && (
        <div className="rfq-inbox-empty card">
          <p className="rfq-inbox-empty-title">Không có RFQ ở bộ lọc này</p>
          <p className="muted rfq-inbox-empty-text">
            Thử đổi trạng thái hoặc xóa bộ lọc xe.
          </p>
        </div>
      )}

      {hasMore && (
        <div className="rfq-load-more-wrap">
          <button type="button" className="rfq-btn rfq-btn--secondary" disabled={loading} onClick={() => loadMore()}>
            {loading ? "Đang tải…" : "Tải thêm"}
          </button>
        </div>
      )}

      <p className="muted rfq-footer-links">
        <Link href="/shop/settings">Cài đặt shop · Zalo</Link>
      </p>
    </div>
  );
}