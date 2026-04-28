"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";

export default function ShopAddressSelector({ value, onChange }) {
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadingWards, setLoadingWards] = useState(false);

  const { provinceId, wardId, detail } = value;

  /* =============================
     Load danh sách Tỉnh / TP
     ============================= */
  useEffect(() => {
    fetch(`${API_BASE}/address/provinces`)
      .then((res) => res.json())
      .then(setProvinces)
      .catch(() => setProvinces([]));
  }, []);

  /* =============================
     Load Phường / Xã theo Tỉnh
     ============================= */
  useEffect(() => {
    if (!provinceId) {
      setWards([]);
      return;
    }

    const selectedProvince = provinces.find(
      (p) => String(p.id) === String(provinceId),
    );

    if (!selectedProvince) {
      setWards([]);
      return;
    }

    setLoadingWards(true);

    fetch(
      `${API_BASE}/address/wards?tinh_tp=${encodeURIComponent(
        selectedProvince.tinh_tp,
      )}`,
    )
      .then((res) => res.json())
      .then(setWards)
      .catch(() => setWards([]))
      .finally(() => setLoadingWards(false));
  }, [provinceId, provinces]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* ===== Tỉnh / TP ===== */}
      <div>
        <label className="font-semibold">Tỉnh / TP</label>
        <select
          className="form-control"
          value={provinceId || ""}
          onChange={(e) =>
            onChange({
              ...value,
              provinceId: e.target.value,
              wardId: "",
            })
          }
        >
          <option value="">Chọn tỉnh</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.tinh_tp}
            </option>
          ))}
        </select>
      </div>

      {/* ===== Phường / Xã ===== */}
      <div>
        <label className="font-semibold">Phường / Xã</label>
        <select
          className="form-control"
          value={wardId || ""}
          disabled={!provinceId || loadingWards}
          onChange={(e) =>
            onChange({
              ...value,
              wardId: e.target.value,
            })
          }
        >
          <option value="">
            {loadingWards ? "Đang tải..." : "Chọn phường/xã"}
          </option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.phuong_xa}
            </option>
          ))}
        </select>
      </div>

      {/* ===== Địa chỉ chi tiết ===== */}
      <div>
        <label className="font-semibold">Địa chỉ chi tiết</label>
        <input
          className="form-control"
          value={detail || ""}
          placeholder="Số nhà, đường..."
          onChange={(e) =>
            onChange({
              ...value,
              detail: e.target.value,
            })
          }
        />
      </div>
    </div>
  );
}
