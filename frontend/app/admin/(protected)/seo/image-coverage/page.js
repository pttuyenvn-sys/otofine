"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  exportImageCoverageCsv,
  getImageCoverageReport,
  getShopImageCoverageProducts,
} from "@/lib/adminApi";

const sectionStyle = {
  background: "white",
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  marginBottom: 16,
};

const STATUS_COLORS = {
  GREEN: { bg: "#dcfce7", text: "#166534", label: "Green" },
  YELLOW: { bg: "#fef9c3", text: "#854d0e", label: "Yellow" },
  RED: { bg: "#fee2e2", text: "#991b1b", label: "Red" },
};

function formatPct(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("vi-VN");
  } catch {
    return String(value);
  }
}

export default function ImageCoveragePage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [shopFilter, setShopFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selectedShop, setSelectedShop] = useState(null);
  const [shopProducts, setShopProducts] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const queryParams = useMemo(
    () => ({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(shopFilter ? { shopId: shopFilter } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    }),
    [statusFilter, shopFilter, dateFrom, dateTo],
  );

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getImageCoverageReport(queryParams);
      setReport(res.data || null);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e.message || "Failed to load image coverage");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  async function openShopDetail(shop) {
    setSelectedShop(shop);
    setDetailLoading(true);
    setShopProducts([]);
    try {
      const res = await getShopImageCoverageProducts(shop.shopId, {
        missingOnly: onlyMissing ? "1" : "0",
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });
      setShopProducts(res.data?.products || []);
    } catch (e) {
      console.error(e);
      setShopProducts([]);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedShop(null);
    setShopProducts([]);
  }

  async function handleExport() {
    try {
      setExporting(true);
      const res = await exportImageCoverageCsv({
        ...queryParams,
        ...(onlyMissing ? { missingOnly: "1" } : {}),
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `otofine-missing-images-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const totals = report?.totals || {};
  const sellers = report?.sellers || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Image Coverage</h1>
          <p style={{ margin: 0, opacity: 0.75, maxWidth: 720 }}>
            Monitor public products missing gallery images. Seller-level breakdown for outreach and remediation.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#111827",
            color: "white",
            fontWeight: 700,
            cursor: exporting ? "wait" : "pointer",
          }}
        >
          {exporting ? "Exporting…" : "Export CSV (missing)"}
        </button>
      </div>

      <section style={{ ...sectionStyle, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
        <FilterField label="Coverage status">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="">All</option>
            <option value="GREEN">Green (≥95%)</option>
            <option value="YELLOW">Yellow (90–95%)</option>
            <option value="RED">Red (&lt;90%)</option>
          </select>
        </FilterField>
        <FilterField label="Shop ID">
          <input
            type="text"
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value.trim())}
            placeholder="e.g. 42"
            style={inputStyle}
          />
        </FilterField>
        <FilterField label="Created from">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
        </FilterField>
        <FilterField label="Created to">
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        </FilterField>
        <FilterField label="Detail filter">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            Only missing images
          </label>
        </FilterField>
      </section>

      {loading ? <div>Loading image coverage…</div> : null}
      {error ? <div style={{ color: "#991b1b", marginBottom: 16 }}>{error}</div> : null}

      {!loading && report ? (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <SummaryCard title="Total Products" value={totals.products} />
            <SummaryCard title="With Images" value={totals.withImages} />
            <SummaryCard title="Without Images" value={totals.withoutImages} tone="#991b1b" />
            <SummaryCard title="Coverage %" value={formatPct(totals.imageCoverageRate)} tone="#065f46" />
          </section>

          <section style={sectionStyle}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Shops by image coverage</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={thStyle}>Shop</th>
                    <th style={thStyle}>Products</th>
                    <th style={thStyle}>With Images</th>
                    <th style={thStyle}>Without Images</th>
                    <th style={thStyle}>Coverage %</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.length ? (
                    sellers.map((shop) => (
                      <tr
                        key={shop.shopId}
                        onClick={() => openShopDetail(shop)}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          cursor: "pointer",
                          background: selectedShop?.shopId === shop.shopId ? "#eff6ff" : "transparent",
                        }}
                      >
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700 }}>{shop.shopName || `Shop #${shop.shopId}`}</div>
                          <div style={{ fontSize: 12, opacity: 0.65 }}>ID {shop.shopId} · Seller {shop.sellerId ?? "—"}</div>
                        </td>
                        <td style={tdStyle}>{shop.productCount}</td>
                        <td style={tdStyle}>{shop.withImages}</td>
                        <td style={{ ...tdStyle, fontWeight: shop.withoutImages ? 700 : 400, color: shop.withoutImages ? "#991b1b" : "inherit" }}>
                          {shop.withoutImages}
                        </td>
                        <td style={tdStyle}>{formatPct(shop.coverageRate)}</td>
                        <td style={tdStyle}>
                          <StatusBadge status={shop.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: 16, opacity: 0.65 }}>
                        No shops match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {report.generatedAt ? (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
                Generated {formatDate(report.generatedAt)}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {selectedShop ? (
        <section style={{ ...sectionStyle, border: "2px solid #2563eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                {selectedShop.shopName || `Shop #${selectedShop.shopId}`}
              </h2>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                {onlyMissing ? "Products missing images" : "All products"} · {formatPct(selectedShop.coverageRate)} coverage
              </div>
            </div>
            <button type="button" onClick={closeDetail} style={secondaryBtnStyle}>
              Close
            </button>
          </div>

          {detailLoading ? (
            <div>Loading products…</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={thStyle}>Product ID</th>
                    <th style={thStyle}>Product Name</th>
                    <th style={thStyle}>Part Number</th>
                    <th style={thStyle}>Created Date</th>
                    <th style={thStyle}>Seller</th>
                  </tr>
                </thead>
                <tbody>
                  {shopProducts.length ? (
                    shopProducts.map((p) => (
                      <tr key={p.productId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={tdStyle}>{p.productId}</td>
                        <td style={tdStyle}>{p.productName}</td>
                        <td style={tdStyle}>{p.partNumber || "—"}</td>
                        <td style={tdStyle}>{formatDate(p.createdAt)}</td>
                        <td style={tdStyle}>{p.sellerId ?? "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: 16, opacity: 0.65 }}>
                        {onlyMissing ? "No missing-image products for this shop." : "No products found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, value, tone }) {
  return (
    <div style={{ background: "white", padding: 16, borderRadius: 12, border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: tone || "#111827" }}>{value != null ? String(value) : "—"}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const key = String(status || "RED").toUpperCase();
  const palette = STATUS_COLORS[key] || STATUS_COLORS.RED;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: palette.bg,
        color: palette.text,
      }}
    >
      {palette.label}
    </span>
  );
}

function FilterField({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  width: "100%",
};

const thStyle = { padding: "10px 8px", fontWeight: 800 };
const tdStyle = { padding: "10px 8px", verticalAlign: "top" };

const secondaryBtnStyle = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "white",
  fontWeight: 700,
  cursor: "pointer",
};
