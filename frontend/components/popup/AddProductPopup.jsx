"use client";

import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useEffect, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { createPortal } from "react-dom";
import "./ProductPopup.css";

/**
 * AddProductPopup
 *
 * Used as both the "Thêm mới" and "Sửa / Xem ảnh" entry point. Same
 * upload pipeline, same API endpoints, same FormData payload — the
 * mobile UX pass only rebalances layout and adds an explicit mobile
 * single-column flow with a sticky save bar.
 *
 * Layout strategy:
 *   - Desktop (>= lg): the legacy 2-column grid is preserved via
 *     `.FormGrid` in ProductPopup.css (LeftCol fields/cars/descriptions,
 *     RightCol save + image gallery). No change.
 *   - Mobile (< lg): `.FormGrid` collapses to a single column via the
 *     media-query block at the bottom of ProductPopup.css. Inside the
 *     single column we use Tailwind `order-*` and `hidden lg:flex`
 *     utilities to:
 *       1. Show "Ảnh sản phẩm" FIRST (before fields), because the
 *          image picker is the highest-priority action on mobile.
 *       2. Collapse the per-vehicle "Chi tiết kỹ thuật" (dong_co /
 *          hop_so / so_cau / kieu_dang / cc) into an expandable panel
 *          per CarRow so the row stays tappable.
 *       3. Hide the desktop "Cập nhật" button inside RightCol (the
 *          new mobile sticky save bar replaces it).
 *       4. Move the description field group below the rest so the
 *          rich editor doesn't dominate above-the-fold space.
 */

const initialCarRow = () => ({
  brand: "",
  carModelId: "",
  year_from: "",
  year_to: "",
  dong_co: "",
  hop_so: "",
  so_cau: "",
  kieu_dang: "",
  cc: "",
});

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

  const [images, setImages] = useState([]);
  const [cars, setCars] = useState([]);
  const [existingImages, setExistingImages] = useState([]);

  const [deletedImages, setDeletedImages] = useState([]);

  const [attrOptions, setAttrOptions] = useState([]);

  const [submitting, setSubmitting] = useState(false);

  // Per-row "Chi tiết kỹ thuật" expand state. Only used on mobile —
  // desktop renders all selects inline thanks to the grid layout.
  const [openDetails, setOpenDetails] = useState({});

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

  const [carRows, setCarRows] = useState([initialCarRow()]);

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

    setCarRows(rows.length ? rows : [initialCarRow()]);

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

  // Lock body scroll while the full-screen sheet is open so the
  // background page doesn't move around under it on iOS Safari.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
    setCarRows([...carRows, initialCarRow()]);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!partNumber || !partName) {
      alert("Vui lòng nhập Mã & Tên phụ tùng");
      return;
    }

    let cars;
    try {
      cars = carRows
        .map((r) => {
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

    try {
      setSubmitting(true);
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

        onClose();
      }
    } catch (err) {
      console.log("ERROR:", err.response?.data);
      alert(err.response?.data?.message || "Lỗi khi thêm sản phẩm");
    } finally {
      setSubmitting(false);
    }
  };

  function toggleDetails(idx) {
    setOpenDetails((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  return createPortal(
    <div className="AddProductOverlay">
      <div className="AddProductForm">
        <div className="PopupHeader">
          <h2>{product ? "Sửa sản phẩm" : "Thêm sản phẩm"}</h2>
          <div className="PopupHeaderActions">
            <button type="button" className="btnClose" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>

        <div className="FormGrid">
          {/* ----------------------------------------------------------
              LEFT column — order on desktop:
                1. Basic info (Row2 + Row3)
                2. Vehicle compatibility
                3. Short + full descriptions
              On mobile this column flows linearly; the RightCol
              (images) is reordered to appear AFTER the basic info via
              `lg:order-*` utilities below.
              ---------------------------------------------------------- */}
          <div className="LeftCol">
            <section className="ProductFormSection">
              <h3 className="ProductFormSection__title">Thông tin cơ bản</h3>
              <div className="Row2">
                <div>
                  <label>Mã phụ tùng *</label>
                  <input
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                  />
                </div>

                <div>
                  <label>Tên phụ tùng *</label>
                  <input
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                  />
                </div>
              </div>

              <div className="Row3 Row3--money">
                <div>
                  <label>Giá bán</label>
                  <input
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>

                <div>
                  <label>Tồn kho</label>
                  <input
                    inputMode="numeric"
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
              </div>
            </section>

            {/* ------------------------------------------------------
                IMAGES — mobile renders this section here (high
                priority). Desktop hides it because the legacy
                RightCol still owns the gallery.
                ------------------------------------------------------ */}
            <section className="ProductFormSection ProductFormSection--mobileImages lg:hidden">
              <h3 className="ProductFormSection__title">Ảnh sản phẩm</h3>
              <ImagePicker
                images={images}
                existingImages={existingImages}
                onAddImages={(files) => setImages([...images, ...files])}
                onRemoveNewImage={(i) => {
                  const clone = [...images];
                  clone.splice(i, 1);
                  setImages(clone);
                }}
                onRemoveExistingImage={(img, i) => {
                  const clone = [...existingImages];
                  setDeletedImages((prev) => [...prev, img.id]);
                  clone.splice(i, 1);
                  setExistingImages(clone);
                }}
              />
            </section>

            <section className="ProductFormSection">
              <h3 className="ProductFormSection__title">Áp dụng cho xe</h3>

              {carRows.map((r, idx) => (
                <div className="CarCard" key={idx}>
                  <div className="CarCard__header">
                    <span className="CarCard__index">Xe {idx + 1}</span>
                    {carRows.length > 1 && (
                      <button
                        type="button"
                        className="CarCard__remove"
                        aria-label="Xóa xe"
                        onClick={() => {
                          const clone = [...carRows];
                          clone.splice(idx, 1);
                          setCarRows(clone);
                          setModelsByRow((prev) => {
                            const m = [...prev];
                            m.splice(idx, 1);
                            return m;
                          });
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="CarCard__main">
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
                  </div>

                  {/*
                    "Chi tiết kỹ thuật" — on desktop the grid keeps
                    all 5 secondary selects inline as part of the row;
                    on mobile the row would explode into 9 selects
                    side-by-side, so we hide the secondary selects
                    behind a toggle. Toggle state is per-row to keep
                    interaction local.
                  */}
                  <button
                    type="button"
                    className="CarCard__detailsToggle lg:hidden"
                    aria-expanded={!!openDetails[idx]}
                    onClick={() => toggleDetails(idx)}
                  >
                    {openDetails[idx]
                      ? "− Ẩn chi tiết kỹ thuật"
                      : "+ Chi tiết kỹ thuật (động cơ, hộp số, …)"}
                  </button>

                  <div
                    className={
                      "CarCard__details " +
                      (openDetails[idx] ? "is-open" : "is-collapsed")
                    }
                  >
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
                  </div>
                </div>
              ))}

              <button
                type="button"
                className="btnAddCar"
                onClick={addCarRow}
              >
                + Thêm xe
              </button>
            </section>

            <section className="ProductFormSection">
              <h3 className="ProductFormSection__title">Kích thước &amp; trọng lượng</h3>
              <div className="Row3 Row3--dim">
                <div>
                  <label>Chiều dài (cm)</label>
                  <input
                    inputMode="decimal"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                  />
                </div>

                <div>
                  <label>Chiều rộng (cm)</label>
                  <input
                    inputMode="decimal"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                  />
                </div>

                <div>
                  <label>Chiều cao (cm)</label>
                  <input
                    inputMode="decimal"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                  />
                </div>

                <div>
                  <label>Trọng lượng (gram)</label>
                  <input
                    inputMode="decimal"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="ProductFormSection">
              <h3 className="ProductFormSection__title">Mô tả</h3>
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
            </section>
          </div>

          {/* ----------------------------------------------------------
              RIGHT column — desktop only image gallery + submit. On
              mobile this column is hidden via the media query in
              ProductPopup.css (mobile uses the LeftCol image section
              and the sticky save bar below).
              ---------------------------------------------------------- */}
          <div className="RightCol">
            <div className="RightCol__submit">
              <button
                type="button"
                className="btnSubmit"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? "Đang lưu…"
                  : product
                    ? "Cập nhật"
                    : "Thêm mới"}
              </button>
            </div>

            <h3>Ảnh sản phẩm</h3>

            <ImagePicker
              images={images}
              existingImages={existingImages}
              onAddImages={(files) => setImages([...images, ...files])}
              onRemoveNewImage={(i) => {
                const clone = [...images];
                clone.splice(i, 1);
                setImages(clone);
              }}
              onRemoveExistingImage={(img, i) => {
                const clone = [...existingImages];
                setDeletedImages((prev) => [...prev, img.id]);
                clone.splice(i, 1);
                setExistingImages(clone);
              }}
            />
          </div>
        </div>

        {/* Mobile sticky save bar — anchored above the seller bottom
            nav (which doesn't render on top of the popup because
            this overlay is at z-index 9999999, but we still respect
            safe-area). Desktop uses the inline RightCol button so
            this bar is hidden via the media query. */}
        <div className="MobileSaveBar lg:hidden">
          <button
            type="button"
            className="btnSubmit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? "Đang lưu…"
              : product
                ? "Cập nhật sản phẩm"
                : "Thêm sản phẩm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Image picker — shared by mobile (in LeftCol order-first) and desktop
   (in RightCol). Visually identical, just renders in different DOM
   locations so the responsive layout can prioritise it differently.   */
/* ------------------------------------------------------------------ */
function ImagePicker({
  images,
  existingImages,
  onAddImages,
  onRemoveNewImage,
  onRemoveExistingImage,
}) {
  return (
    <div className="ImagePicker">
      <label className="ImagePicker__input">
        <span className="ImagePicker__inputLabel">+ Thêm ảnh</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) onAddImages(files);
            e.target.value = "";
          }}
        />
      </label>

      <div className="ImagePreview">
        {existingImages.map((img, i) => (
          <div key={"old-" + i} className="ImagePreview__item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url + "?t=" + Date.now()} alt="" />
            <button
              type="button"
              className="ImagePreview__remove"
              aria-label="Xóa ảnh"
              onClick={() => onRemoveExistingImage(img, i)}
            >
              ✕
            </button>
          </div>
        ))}

        {images.map((img, i) => (
          <div key={"new-" + i} className="ImagePreview__item ImagePreview__item--new">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(img)} alt="" />
            <button
              type="button"
              className="ImagePreview__remove"
              aria-label="Xóa ảnh"
              onClick={() => onRemoveNewImage(i)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
