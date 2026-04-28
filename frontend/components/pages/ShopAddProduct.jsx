"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addProduct } from "../../api/productApi";
import { getBrands, getModelsByBrand } from "../../api/carApi";
import "./ShopAddProduct.css"; // tái sử dụng CSS

export default function ShopAddProduct() {
  const router = useRouter();

  const [partNumber, setPartNumber] = useState("");
  const [partName, setPartName] = useState("");
  const [origin, setOrigin] = useState("");
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");

  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");

  const [brands, setBrands] = useState([]);
  const [modelsByRow, setModelsByRow] = useState([]);

  const [carRows, setCarRows] = useState([
    { brand: "", carModelId: "", year_from: "", year_to: "" },
  ]);

  /* ======================
     LOAD BRANDS
  ====================== */
  useEffect(() => {
    getBrands().then((res) => {
      setBrands(res.data);
    });
  }, []);

  /* ======================
     LOAD MODELS BY BRAND
  ====================== */
  const loadModels = async (idx, brand) => {
    const res = await getModelsByBrand(brand);
    const clone = [...modelsByRow];
    clone[idx] = res.data; // [{id, ten_xe}]
    setModelsByRow(clone);
  };

  const years = [];
  for (let y = new Date().getFullYear(); y >= 1995; y--) years.push(y);

  const addCarRow = () => {
    setCarRows([
      ...carRows,
      { brand: "", carModelId: "", year_from: "", year_to: "" },
    ]);
  };

  /* ======================
     SUBMIT
  ====================== */
  const handleSubmit = async () => {
    if (!partNumber || !partName) {
      alert("Vui lòng nhập Mã & Tên phụ tùng");
      return;
    }

    let cars;
    try {
      cars = carRows.map((r) => {
        if (!r.carModelId || !r.year_from || !r.year_to) {
          throw new Error("Thiếu thông tin xe");
        }
        if (+r.year_from > +r.year_to) {
          throw new Error("Năm không hợp lệ");
        }

        return {
          carModelId: Number(r.carModelId),
          year_from: Number(r.year_from),
          year_to: Number(r.year_to),
        };
      });
    } catch (e) {
      alert(e.message);
      return;
    }

    const payload = {
      partNumber,
      partName,
      origin,
      stock: Number(stock || 0),
      price: Number(price || 0),
      weight: Number(weight || 0),
      length: Number(length || 0),
      width: Number(width || 0),
      height: Number(height || 0),
      shortDescription,
      description,
      cars,
    };

    try {
      await addProduct(payload);
      alert("Thêm sản phẩm thành công");
      router.push("/shop/products");
    } catch (err) {
      console.error(err);

      const message = err?.response?.data?.message;

      alert(
        message === "Mã sản phẩm đã tồn tại"
          ? message
          : "Lỗi khi thêm sản phẩm",
      );
    }
  };

  return (
    <div className="PopupForm" style={{ maxWidth: 900, margin: "24px auto" }}>
      <h2>Thêm sản phẩm</h2>

      <label>Mã phụ tùng</label>
      <input
        value={partNumber}
        onChange={(e) => setPartNumber(e.target.value)}
      />

      <label>Tên phụ tùng</label>
      <input value={partName} onChange={(e) => setPartName(e.target.value)} />

      <label>Xuất xứ</label>
      <input value={origin} onChange={(e) => setOrigin(e.target.value)} />

      <h3>Áp dụng cho xe</h3>

      {carRows.map((r, idx) => (
        <div className="CarRow" key={idx}>
          <select
            value={r.brand}
            onChange={(e) => {
              const clone = [...carRows];
              clone[idx] = {
                ...clone[idx],
                brand: e.target.value,
                carModelId: "",
              };
              setCarRows(clone);
              loadModels(idx, e.target.value);
            }}
          >
            <option value="">-- Hãng xe --</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            value={r.carModelId}
            onChange={(e) => {
              const clone = [...carRows];
              clone[idx].carModelId = e.target.value;
              setCarRows(clone);
            }}
          >
            <option value="">-- Mẫu xe --</option>
            {(modelsByRow[idx] || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.ten_xe}
              </option>
            ))}
          </select>

          <select
            value={r.year_from}
            onChange={(e) => {
              const clone = [...carRows];
              clone[idx].year_from = e.target.value;
              setCarRows(clone);
            }}
          >
            <option value="">Từ năm</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={r.year_to}
            onChange={(e) => {
              const clone = [...carRows];
              clone[idx].year_to = e.target.value;
              setCarRows(clone);
            }}
          >
            <option value="">Đến năm</option>
            {years.map((y) => (
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

      <label>Tồn kho</label>
      <input value={stock} onChange={(e) => setStock(e.target.value)} />

      <label>Giá bán</label>
      <input value={price} onChange={(e) => setPrice(e.target.value)} />

      <label>Mô tả ngắn</label>
      <textarea
        value={shortDescription}
        onChange={(e) => setShortDescription(e.target.value)}
      />

      <label>Mô tả chi tiết</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="ActionRow">
        <button type="button" className="btnSubmit" onClick={handleSubmit}>
          Thêm mới
        </button>
        <button
          type="button"
          className="btnClose"
          onClick={() => router.push("/shop/products")}
        >
          Quay lại
        </button>
      </div>
    </div>
  );
}
