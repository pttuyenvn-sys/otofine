"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getShops, updateShopStatus, deleteShop } from "../../api/adminApi";
import { getEnforcementCases, reinstateShopOnCase } from "@/lib/adminApi";
import ShopSuspendModal from "@/components/admin/ShopSuspendModal";

export default function AdminShops() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── Governance state (Slice 7) ──────────────────────────────────────────────
  // suspendModal: drives the ShopSuspendModal visibility
  const [suspendModal, setSuspendModal] = useState({ open: false, shopId: null, shopName: "" });
  // reinstating: shopId currently going through the reinstate flow (inline spinner)
  const [reinstating, setReinstating] = useState(null);
  // actionError: surface governance-specific errors above the table
  const [actionError, setActionError] = useState("");
  // ────────────────────────────────────────────────────────────────────────────

  async function load() {
    try {
      setLoading(true);
      const res = await getShops();
      const data = res.data || [];
      // Diagnostic: log first shop's keys and governance field so mismatches are visible.
      if (data.length) {
        console.log("[AdminShops] sample shop keys:", Object.keys(data[0]));
        console.log("[AdminShops] sample governanceShopId:", data[0].governanceShopId, "| accountStatus:", data[0].status, "| shopPublicStatus:", data[0].shopPublicStatus);
      }
      setShops(data);
    } catch (e) {
      console.error("LOAD SHOPS FAIL", e);
      setShops([]);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(id, status) {
    let text = "Bạn chắc chắn muốn thay đổi trạng thái shop?";

    if (status === "active") {
      text = "Mở khóa shop này và cho phép hoạt động trở lại?";
    }

    if (status === "blocked") {
      text = "Khóa shop này?";
    }

    if (!window.confirm(text)) return;

    await updateShopStatus(id, status);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm("XÓA SHOP? Thao tác này không thể hoàn tác!")) return;
    await deleteShop(id);
    load();
  }

  // ── Governance: open the suspend modal ─────────────────────────────────────
  function openSuspendModal(shop) {
    setActionError("");
    // governanceShopId is shops.id (integer) — required by enforcement backend.
    // shop.shopId is a UUID string from shop_accounts and must NOT be used here.
    setSuspendModal({ open: true, shopId: shop.governanceShopId, shopName: shop.name });
  }

  // Called by ShopSuspendModal after a successful (or already-suspended) result
  function handleSuspendSuccess() {
    setSuspendModal({ open: false, shopId: null, shopName: "" });
    load();
  }

  // ── Governance: reinstate a suspended shop ──────────────────────────────────
  async function handleReinstate(shop) {
    if (!window.confirm(`Khôi phục shop "${shop.name}" khỏi đình chỉ?`)) return;

    setActionError("");
    // governanceShopId is shops.id (integer) — required by enforcement backend.
    setReinstating(shop.governanceShopId);

    try {
      // Query ALL cases for this shop — do NOT filter by status=open.
      // Active suspensions may exist under non-open cases (pending_review,
      // resolved, appealed). Using the latest case satisfies audit integrity
      // while remaining robust to workflow state.
      const casesRes = await getEnforcementCases({
        target_type: "shop",
        target_id: shop.governanceShopId,
      });
      const cases = casesRes.data?.cases || [];

      if (cases.length === 0) {
        setActionError(
          `Shop "${shop.name}": Không tìm thấy enforcement case. ` +
            "Vui lòng xử lý tại trang Enforcement Cases.",
        );
        return;
      }

      // Cases are returned ordered by created_at DESC from the API.
      // Use the latest case — its ID is required by the route, not the service.
      const caseId = cases[0].id;

      const result = await reinstateShopOnCase(caseId, {
        shopId: shop.governanceShopId,
        lift_reason: "Admin reinstatement via shop management list",
      });

      // notSuspended: true is a valid 200 response — shop was already reinstated.
      // Sync UI regardless to guarantee consistency.
      if (result.data?.notSuspended) {
        console.info("[reinstate] notSuspended — shop was already out of suspension.");
      }

      load();
    } catch (err) {
      const httpStatus = err?.response?.status;
      if (httpStatus === 404) {
        setActionError(
          "Tính năng quản trị chưa được kích hoạt (ADMIN_MODERATION_ENABLED). Liên hệ quản trị viên hệ thống.",
        );
      } else {
        setActionError(
          err?.response?.data?.error ||
            err.message ||
            `Không thể khôi phục shop "${shop.name}".`,
        );
      }
    } finally {
      setReinstating(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const statusLabel = {
    pending: "Chờ duyệt",
    active: "Đang hoạt động",
    blocked: "Đã khóa",
    suspended: "Đình chỉ (Governance)",
  };

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href="/admin/part-knowledge" prefetch={false}>Otofine Knowledge Engine →</Link>
      </p>
      <h2>Quản lý Shop</h2>

      {loading && <p>Đang tải dữ liệu...</p>}

      {/* Governance action error banner */}
      {actionError && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span style={{ lineHeight: 1.5 }}>{actionError}</span>
          <button
            onClick={() => setActionError("")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 18,
              color: "#991b1b",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Tên</th>
            <th>Email</th>
            <th>Trạng thái</th>
            <th>Hành động</th>
            <th>Governance</th>
          </tr>
        </thead>

        <tbody>
          {shops.length === 0 && !loading && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center" }}>
                Không có shop
              </td>
            </tr>
          )}

          {shops.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.email}</td>
              <td>{statusLabel[s.status] || s.status}</td>
              <td style={{ display: "flex", gap: 8 }}>
                {s.status === "pending" && (
                  <button onClick={() => changeStatus(s.id, "active")}>
                    Duyệt
                  </button>
                )}

                {s.status === "active" && (
                  <button onClick={() => changeStatus(s.id, "blocked")}>
                    Khóa
                  </button>
                )}

                {s.status === "blocked" && (
                  <>
                    <button onClick={() => changeStatus(s.id, "active")}>
                      Mở khóa
                    </button>

                    <button onClick={() => handleDelete(s.id)}>Xóa</button>
                  </>
                )}
              </td>

              {/* ── Governance column (Slice 7) ─────────────────────────── */}
              {/* shopPublicStatus = shops.public_status (governance source of truth).
                  sa.status (login-account field) may stay "active" even when the
                  governance catalog is suspended, so we drive this column from the
                  shops table directly. */}
              <td>
                {s.governanceShopId != null && (
                  s.shopPublicStatus === "suspended" ? (
                    /* Reinstate — shop is governance-suspended */
                    reinstating === s.governanceShopId ? (
                      <span style={{ fontSize: 13, color: "#6b7280" }}>Đang xử lý...</span>
                    ) : (
                      <button
                        onClick={() => handleReinstate(s)}
                        style={{
                          background: "#059669",
                          color: "white",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Khôi phục
                      </button>
                    )
                  ) : (
                    /* Suspend — shop is not governance-suspended (active, pending, blocked) */
                    <button
                      onClick={() => openSuspendModal(s)}
                      style={{
                        background: "#7c3aed",
                        color: "white",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Đình chỉ
                    </button>
                  )
                )}
              </td>
              {/* ────────────────────────────────────────────────────────── */}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Governance: Suspension modal */}
      {suspendModal.open && (
        <ShopSuspendModal
          target={suspendModal}
          onClose={() => setSuspendModal({ open: false, shopId: null, shopName: "" })}
          onSuccess={handleSuspendSuccess}
        />
      )}
    </div>
  );
}
