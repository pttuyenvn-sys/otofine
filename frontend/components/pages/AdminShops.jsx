"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getShops, updateShopStatus, deleteShop } from "../../api/adminApi";

export default function AdminShops() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await getShops();
      console.log("ADMIN SHOPS:", res.data);
      setShops(res.data || []);
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

  useEffect(() => {
    load();
  }, []);

  const statusLabel = {
    pending: "Chờ duyệt",
    active: "Đang hoạt động",
    blocked: "Đã khóa",
  };

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href="/admin/part-knowledge">Otofine Knowledge Engine →</Link>
      </p>
      <h2>Quản lý Shop</h2>

      {loading && <p>Đang tải dữ liệu...</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Tên</th>
            <th>Email</th>
            <th>Trạng thái</th>
            <th>Hành động</th>
          </tr>
        </thead>

        <tbody>
          {shops.length === 0 && !loading && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center" }}>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
