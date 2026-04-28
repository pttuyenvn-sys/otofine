"use client";

import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useEffect, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { createPortal } from "react-dom";
import "./ProductPopup.css";

export default function AddProductPopup({ onClose, onSuccess, product }) {
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

  // ✅ NEW
  const [images, setImages] = useState([]);
  const [cars, setCars] = useState([]);
  const [existingImages, setExistingImages] = useState([]);

  const [deletedImages, setDeletedImages] = useState([]);

  const [attrOptions, setAttrOptions] = useState([]);

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline"],
      [{ color: [] }, { background: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link", "image"],
      ["clean"],
    ],
  };

  const [brands, setBrands] = useState([]);
  const [modelsByRow, setModelsByRow] = useState([]);

  const [carRows, setCarRows] = useState([
    {
      brand: "",
      carModelId: "",
      year_from: "",
      year_to: "",
      dong_co: "",
      hop_so: "",
      so_cau: "",
      kieu_dang: "",
      cc: "",
    },
  ]);

  useEffect(() => {
    axiosClient.get("/car/brands").then((res) => {
      setBrands(res.data || []);
    });
  }, []);

  useEffect(() => {
    if (!product) return;

    setPartNumber(product.partNumber || "");
    setPartName(product.partName || "");
    setOrigin(product.origin || "");
    setStock(product.stock || "");
    setPrice(product.price || "");

    setWeight(product.weight || "");
    setLength(product.length || "");
    setWidth(product.width || "");
    setHeight(product.height || "");

    const rows = (product.cars || []).map((c) => ({
      brand: c.brand || "",
      carModelId: c.carModelId || "",
      year_from: c.year_from || "",
      year_to: c.year_to || "",

      dong_co: c.dong_co || "",
      hop_so: c.hop_so || "",
      so_cau: c.so_cau || "",
      kieu_dang: c.kieu_dang || "",
      cc: c.cc || "",
    }));

    setCarRows(rows);

    const loadAttributes = async () => {
      const results = await Promise.all(
        rows.map((row) => {
          if (!row.carModelId) return null;
          return axiosClient.get("/car/attributes", {
            params: { carModelId: row.carModelId },
          });
        }),
      );

      const newOptions = results.map((res) => res?.data || {});
      setAttrOptions(newOptions);
    };

    loadAttributes();

    // 🔥 FIX QUAN TRỌNG: load model theo từng dòng
    rows.forEach((row, idx) => {
      if (row.brand) {
        loadModels(idx, row.brand);
      }
    });

    setExistingImages(product.images || []);
    setShortDescription(product.shortDescription || "");
    setDescription(product.fullDescription || "");

    setImages([]);
    setDeletedImages([]);
  }, [product]);

  const loadModels = async (idx, brand) => {
    const res = await axiosClient.get("/car/models", {
      params: { brand },
    });

    setModelsByRow((prev) => {
      const clone = [...prev];
      clone[idx] = res.data || [];
      return clone;
    });
  };

  const years = [];
  for (let y = new Date().getFullYear(); y >= 1995; y--) years.push(y);

  const addCarRow = () => {
    setCarRows([
      ...carRows,
      { brand: "", carModelId: "", year_from: "", year_to: "" },
    ]);
  };

  const handleSubmit = async () => {
    if (!partNumber || !partName) {
      alert("Vui lòng nhập Mã & Tên phụ tùng");
      return;
    }

    let cars;
    try {
      cars = carRows
        .map((r) => {
          // bỏ qua dòng rỗng
          if (!r.carModelId && !r.year_from && !r.year_to) {
            return null;
          }

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
            dong_co: r.dong_co,
            hop_so: r.hop_so,
            so_cau: r.so_cau,
            kieu_dang: r.kieu_dang,
            cc: r.cc,
          };
        })
        .filter(Boolean);
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
      const formData = new FormData();

      formData.append("partNumber", partNumber);
      formData.append("partName", partName);
      formData.append("origin", origin);
      formData.append("stock", Number(stock || 0));
      formData.append("price", Number(price || 0));
      formData.append("weight", Number(weight || 0));
      formData.append("length", Number(length || 0));
      formData.append("width", Number(width || 0));
      formData.append("height", Number(height || 0));
      formData.append("shortDescription", shortDescription);
      formData.append("description", description);
      formData.append("cars", JSON.stringify(cars));
      formData.append("deletedImages", JSON.stringify(deletedImages));

      images.forEach((img) => {
        formData.append("images", img);
      });

      let res;

      if (product) {
        res = await axiosClient.put(`/products/${product.id}`, formData);
      } else {
        res = await axiosClient.post("/products", formData);
      }

      if (res?.data?.success) {
        window.dispatchEvent(new Event("reload-products"));

        if (product) {
          alert("Cập nhật thành công");
        } else {
          alert("Thêm sản phẩm thành công");
        }

        onClose(); // đóng popup
      }
    } catch (err) {
      console.log("ERROR:", err.response?.data);
      alert(err.response?.data?.message || "Lỗi khi thêm sản phẩm");
    }
  };

  return createPortal(
    <div className="AddProductOverlay">
      <div className="AddProductForm">
        <div className="PopupHeader">
          <h2>Thêm sản phẩm</h2>
          <div style={{ marginTop: 10 }}>
            <button className="btnClose" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>

        <div className="FormGrid">
          {/* LEFT */}
          <div className="LeftCol">
            <div className="Row2">
              <div>
                <label>Mã phụ tùng</label>
                <input
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                />
              </div>

              <div>
                <label>Tên phụ tùng</label>
                <input
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                />
              </div>
            </div>

            <div className="Row3">
              <div>
                <label>Giá bán</label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>

              <div>
                <label>Tồn kho</label>
                <input
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                />
              </div>

              <div>
                <label>Xuất xứ</label>
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                />
              </div>

              <div>
                <label>Chiều dài (cm)</label>
                <input
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                />
              </div>

              <div>
                <label>Chiều rộng (cm)</label>
                <input
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </div>

              <div>
                <label>Chiều cao (cm)</label>
                <input
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>

              <div>
                <label>Trọng lượng (gram)</label>
                <input
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
            </div>

            <h3>Áp dụng cho xe</h3>

            {carRows.map((r, idx) => (
              <div
                className="CarRow"
                key={idx}
                style={{ display: "flex", gap: 8 }}
              >
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
                  onChange={async (e) => {
                    const clone = [...carRows];
                    const carModelId = e.target.value;

                    clone[idx].carModelId = carModelId;
                    setCarRows(clone);

                    // 🔥 load attribute theo xe
                    const res = await axiosClient.get("/car/attributes", {
                      params: { carModelId },
                    });

                    setAttrOptions((prev) => {
                      const copy = [...prev];
                      copy[idx] = res.data;
                      return copy;
                    });
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

                <select
                  value={r.dong_co}
                  onChange={(e) => {
                    const clone = [...carRows];
                    clone[idx].dong_co = e.target.value;
                    setCarRows(clone);
                  }}
                >
                  <option value="">Động cơ</option>
                  {(attrOptions[idx]?.dong_co || []).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                <select
                  value={r.hop_so}
                  onChange={(e) => {
                    const clone = [...carRows];
                    clone[idx].hop_so = e.target.value;
                    setCarRows(clone);
                  }}
                >
                  <option value="">Hộp số</option>
                  {(attrOptions[idx]?.hop_so || []).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                <select
                  value={r.so_cau}
                  onChange={(e) => {
                    const clone = [...carRows];
                    clone[idx].so_cau = e.target.value;
                    setCarRows(clone);
                  }}
                >
                  <option value="">Số cầu</option>
                  {(attrOptions[idx]?.so_cau || []).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                <select
                  value={r.kieu_dang}
                  onChange={(e) => {
                    const clone = [...carRows];
                    clone[idx].kieu_dang = e.target.value;
                    setCarRows(clone);
                  }}
                >
                  <option value="">Kiểu dáng</option>
                  {(attrOptions[idx]?.kieu_dang || []).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                <select
                  value={r.cc}
                  onChange={(e) => {
                    const clone = [...carRows];
                    clone[idx].cc = e.target.value;
                    setCarRows(clone);
                  }}
                >
                  <option value="">CC</option>
                  {(attrOptions[idx]?.cc || []).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  style={{
                    background: "red",
                    color: "#fff",
                    border: "none",
                    padding: "4px 8px",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    const clone = [...carRows];
                    clone.splice(idx, 1);
                    setCarRows(clone);

                    // xoá luôn model tương ứng
                    setModelsByRow((prev) => {
                      const m = [...prev];
                      m.splice(idx, 1);
                      return m;
                    });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            <button className="btnAddCar" onClick={addCarRow}>
              + Thêm xe
            </button>

            {/* MÔ TẢ */}
            <label>Tiêu đề</label>
            <div className="ShortEditor">
              <ReactQuill
                value={shortDescription}
                onChange={setShortDescription}
                modules={modules}
              />
            </div>

            <label>Mô tả chi tiết</label>
            <div className="DescriptionEditor">
              <ReactQuill
                value={description}
                onChange={setDescription}
                modules={modules}
              />
            </div>
          </div>

          {/* RIGHT */}
          <div className="RightCol">
            {/* ACTION */}
            <div style={{ marginBottom: 20 }}>
              <button className="btnSubmit" onClick={handleSubmit}>
                Cập nhật
              </button>
            </div>

            {/* ẢNH */}
            <h3>Ảnh sản phẩm</h3>

            <input
              type="file"
              multiple
              onChange={(e) => setImages([...images, ...e.target.files])}
            />

            <div className="ImagePreview">
              {/* ẢNH CŨ */}
              {existingImages.map((img, i) => (
                <div key={"old-" + i} style={{ position: "relative" }}>
                  <img src={img.url + "?t=" + Date.now()} />

                  <button
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      background: "red",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      const clone = [...existingImages];

                      // lưu id ảnh bị xoá
                      setDeletedImages((prev) => [...prev, img.id]);

                      clone.splice(i, 1);
                      setExistingImages(clone);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* ẢNH MỚI */}
              {images.map((img, i) => (
                <div key={"new-" + i} style={{ position: "relative" }}>
                  <img src={URL.createObjectURL(img)} />

                  <button
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      background: "red",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      const clone = [...images];
                      clone.splice(i, 1);
                      setImages(clone);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
