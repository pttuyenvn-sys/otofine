"use client";

import React, { useEffect, useState } from "react";
import axiosClient from "../../api/axiosClient";
import "./ProductPopup.css";

export default function EditProductPopup({ product, onClose, onUpdated }) {
  /* =========================
     STATE – KHỞI TẠO RỖNG
  ========================= */
  const [partNumber, setPartNumber] = useState("");
  const [partName, setPartName] = useState("");
  const [origin, setOrigin] = useState("");
  const [stock, setStock] = useState(0);
  const [price, setPrice] = useState(0);
  const [weight, setWeight] = useState(0);
  const [length, setLength] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [shortDesc, setShortDesc] = useState("");
  const [fullDesc, setFullDesc] = useState("");

  const [carRows, setCarRows] = useState([]);
  const [companyList, setCompanyList] = useState([]);
  const [modelList, setModelList] = useState([]);

  /* =========================
     YEAR OPTIONS
  ========================= */
  const yearOptions = [];
  for (let y = new Date().getFullYear(); y >= 1996; y--) {
    yearOptions.push(y);
  }

  /* =========================
     FILL DATA KHI NHẤN SỬA
  ========================= */
  useEffect(() => {
    if (!product) return;

    setPartNumber(product.partNumber || "");
    setPartName(product.partName || "");
    setOrigin(product.origin || "");
    setStock(product.stock ?? 0);
    setPrice(product.price ?? 0);
    setWeight(product.weight ?? 0);
    setLength(product.length ?? 0);
    setWidth(product.width ?? 0);
    setHeight(product.height ?? 0);
    setShortDesc(product.shortDescription || "");
    setFullDesc(product.fullDescription || "");
  }, [product]);

  /* =========================
   LOAD DANH SÁCH HÃNG XE
========================= */
  useEffect(() => {
    axiosClient
      .get("/car/brands")
      .then((res) => {
        console.log("COMPANY LIST:", res.data);
        setCompanyList(res.data || []);
      })
      .catch((err) => {
        console.error("LOAD company list ERROR:", err);
        setCompanyList([]);
      });
  }, []);

  /* =========================
     LOAD HÃNG + XE ÁP DỤNG
  ========================= */
  useEffect(() => {
    if (!product?.id) return;

    axiosClient
      .get(`/products/car-info/${product.id}`)
      .then((res) => {
        console.log("CAR-INFO RESPONSE:", res.data);
        const rows = (res.data || []).map((r) => ({
          company: r.company || "",
          model: r.model || "",
          fromYear: r.yearStart ? String(r.yearStart) : "",
          toYear: r.yearEnd ? String(r.yearEnd) : "",
        }));

        setCarRows(rows);

        // ⚠️ TẠO MẢNG RIÊNG CHO TỪNG ROW
        setModelList(rows.map(() => []));

        // Load model theo từng hãng
        rows.forEach((row, idx) => {
          if (!row.company) return;

          axiosClient
            .get("/car/models", { params: { brand: row.company } })
            .then((rm) => {
              setModelList((prev) => {
                const copy = [...prev];
                copy[idx] = rm.data || [];
                return copy;
              });
            });
        });
      })
      .catch((err) => {
        console.error("LOAD car-info ERROR:", err);
        setCarRows([]);
        setModelList([]);
      });
  }, [product]);

  /* =========================
     ADD CAR ROW
  ========================= */
  const addCarRow = () => {
    setCarRows((prev) => [
      ...prev,
      { company: "", model: "", fromYear: "", toYear: "" },
    ]);
    setModelList((prev) => [...prev, []]);
  };

  /* =========================
     UPDATE PRODUCT
  ========================= */
  const handleUpdate = async () => {
    const validCars = carRows
      .filter(
        (c) =>
          c.company &&
          c.model &&
          c.fromYear &&
          c.toYear &&
          Number(c.toYear) >= Number(c.fromYear)
      )
      .map((c) => ({
        company: c.company,
        model: c.model,
        yearStart: Number(c.fromYear),
        yearEnd: Number(c.toYear),
      }));

    const payload = {
      PartNumber: partNumber,
      PartName: partName,
      Origin: origin,
      Stock: Number(stock),
      Price: Number(price),
      Weight: Number(weight),
      Length: Number(length),
      Width: Number(width),
      Height: Number(height),
      ShortDescription: shortDesc,
      FullDescription: fullDesc,
      Cars: validCars,
    };

    try {
      await axiosClient.put(`/products/${product.ProductID}`, payload);
      alert("Cập nhật thành công!");
      onUpdated && onUpdated();
      onClose && onClose();
    } catch (err) {
      console.error("UPDATE ERROR:", err);
      alert("Lỗi cập nhật sản phẩm!");
    }
  };

  /* =========================
     JSX
  ========================= */
  return (
    <div className="PopupOverlay">
      <div className="PopupForm">
        <h2>Sửa sản phẩm</h2>

        <label>Mã phụ tùng</label>
        <input
          value={partNumber}
          onChange={(e) => setPartNumber(e.target.value)}
        />

        <label>Tên phụ tùng</label>
        <input value={partName} onChange={(e) => setPartName(e.target.value)} />

        <label>Xuất xứ</label>
        <input value={origin} onChange={(e) => setOrigin(e.target.value)} />

        <h3>Xe áp dụng</h3>

        {carRows.map((row, idx) => (
          <div className="CarRow" key={idx}>
            <select
              value={row.company}
              onChange={(e) => {
                const val = e.target.value;
                setCarRows((prev) => {
                  const copy = [...prev];
                  copy[idx] = {
                    company: val,
                    model: "",
                    fromYear: "",
                    toYear: "",
                  };
                  return copy;
                });

                axiosClient
                  .get("/car/models", { params: { brand: val } })
                  .then((rm) => {
                    setModelList((prev) => {
                      const copy = [...prev];
                      copy[idx] = rm.data || [];
                      return copy;
                    });
                  });
              }}
            >
              <option value="">-- Hãng xe --</option>
              {companyList.map((c) => (
                <option key={c.id ?? c} value={c.name ?? c}>
                  {c.name ?? c}
                </option>
              ))}
            </select>

            <select
              value={row.model}
              onChange={(e) => {
                const val = e.target.value;
                setCarRows((prev) => {
                  const copy = [...prev];
                  copy[idx].model = val;
                  return copy;
                });
              }}
            >
              <option value="">-- Tên xe --</option>
              {(modelList[idx] || []).map((m) => (
                <option key={m.id ?? m} value={m.name ?? m}>
                  {m.name ?? m}
                </option>
              ))}
            </select>

            <select
              value={row.fromYear}
              onChange={(e) => {
                const val = e.target.value;
                setCarRows((prev) => {
                  const copy = [...prev];
                  copy[idx].fromYear = val;
                  return copy;
                });
              }}
            >
              <option value="">Từ năm</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <select
              value={row.toYear}
              onChange={(e) => {
                const val = e.target.value;
                setCarRows((prev) => {
                  const copy = [...prev];
                  copy[idx].toYear = val;
                  return copy;
                });
              }}
            >
              <option value="">Đến năm</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        ))}

        <button type="button" className="btnAddCar" onClick={addCarRow}>
          + Thêm xe
        </button>

        <label>Số lượng tồn</label>
        <input
          type="number"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />

        <label>Giá bán</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />

        <label>Khối lượng (gram)</label>
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />

        <label>Kích thước (cm)</label>
        <div className="Row3">
          <input
            placeholder="Dài"
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
          <input
            placeholder="Rộng"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
          <input
            placeholder="Cao"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </div>

        <label>Mô tả ngắn</label>
        <textarea
          value={shortDesc}
          onChange={(e) => setShortDesc(e.target.value)}
        />

        <label>Mô tả chi tiết</label>
        <textarea
          value={fullDesc}
          onChange={(e) => setFullDesc(e.target.value)}
        />

        <div className="ActionRow">
          <button type="button" className="btnSubmit" onClick={handleUpdate}>
            Cập nhật
          </button>
          <button type="button" className="btnClose" onClick={onClose}>
            Thoát
          </button>
        </div>
      </div>
    </div>
  );
}
