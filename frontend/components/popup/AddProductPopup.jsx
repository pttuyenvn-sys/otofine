"use client";

/**
 * AddProductPopup
 *
 * Adds, on top of the v2 mobile rebuild:
 *
 *   - Mobile step wizard (5 steps) with progress dots, Previous /
 *     Next chrome, and per-step validation. Desktop renders all
 *     sections inline as before — the wizard is gated by a
 *     `data-step="N"` attribute on `.AddProductForm` which only the
 *     mobile media query reads.
 *
 *   - Draft autosave via `useProductDraftAutosave`. Form state is
 *     mirrored to localStorage every 700 ms (debounced) under a
 *     stable scope (productId for edits, "new" for create). On open
 *     the seller is offered "Khôi phục bản nháp?" if a stored draft
 *     exists. The draft is cleared after a successful save.
 *
 *   - Camera-first image upload — the "Ảnh sản phẩm" step exposes
 *     two large buttons: 📷 Chụp ảnh (uses `<input capture="environment">`)
 *     and 🖼️ Thư viện (regular gallery picker).
 *
 *   - Toast-driven success / error feedback instead of `alert()`.
 *
 * No API / route / schema changes. The submit pipeline is byte-for-
 * byte identical to v2 — the wizard is purely a navigation overlay.
 */

import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { createPortal } from "react-dom";
import "./ProductPopup.css";
import useProductDraftAutosave from "../../hooks/useProductDraftAutosave";
import { sellerToast } from "../ui/SellerToaster";
import AutocompleteInput from "../ui/AutocompleteInput";
import SellerProductRejectBanner from "../products/SellerProductRejectBanner";
import SellerProductTimeline from "../products/SellerProductTimeline";
import { SellerLifecycleBadge } from "../products/SellerProductStatusBadges";
import { flushProductDraft, getCarChipLabel, isCarRowComplete } from "./addProductPopupUi";
import {
  normalizeSellerDraftSnapshot,
  normalizeSellerProductImages,
  sanitizeSellerProductHtml,
  sellerMediaContext,
  normalizeSellerProductImageUrl,
} from "@/lib/media/sellerProductMedia";
import { PRODUCT_IMAGE_PLACEHOLDER } from "@/lib/media/productMediaUrl";
import "../pages/products/Product.css";

/**
 * Suggestion sources for the seller add/edit popup.
 *
 *   partName → `/api/product-categories/search?q=…` returns the
 *              canonical "loại phụ tùng" dictionary
 *              ("Lọc gió động cơ", "Lọc dầu", …). Public endpoint,
 *              no auth needed; failures collapse silently.
 *
 *   origin   → `/api/products/shop/filters` already exists for the
 *              seller's own catalogue distinct values; we
 *              client-side filter the result by the typed prefix
 *              so we don't hammer the backend per keystroke.
 *
 * Both are debounced and cached inside AutocompleteInput itself.
 */
async function fetchPartNameSuggestions(q) {
  if (!q || q.length < 1) return [];
  try {
    const res = await axiosClient.get("/product-categories/search", {
      params: { q },
    });
    const arr = Array.isArray(res.data) ? res.data : [];
    return arr.slice(0, 8).map((c) => ({
      value: c.canonical_name || c.category_name || "",
      label: c.canonical_name || c.category_name || "",
      hint: c.product_count > 0 ? `${c.product_count} SP` : undefined,
    })).filter((it) => it.value);
  } catch {
    return [];
  }
}

let _shopOriginsCache = null;
async function fetchShopOrigins() {
  if (_shopOriginsCache) return _shopOriginsCache;
  try {
    const res = await axiosClient.get("/products/shop/filters");
    const list = Array.isArray(res.data?.origins) ? res.data.origins : [];
    _shopOriginsCache = list;
    return list;
  } catch {
    return [];
  }
}

async function fetchOriginSuggestions(q) {
  const all = await fetchShopOrigins();
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return all.slice(0, 8).map((v) => ({ value: v }));
  return all
    .filter((v) => String(v).toLowerCase().includes(needle))
    .slice(0, 8)
    .map((v) => ({ value: v }));
}

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

const WIZARD_STEPS = [
  { id: 1, label: "Thông tin" },
  { id: 2, label: "Ảnh" },
  { id: 3, label: "Xe" },
  { id: 4, label: "Thông số" },
  { id: 5, label: "Xác nhận" },
];

export default function AddProductPopup({
  onClose,
  onSuccess,
  product,
  onResubmit,
  resubmitting = false,
}) {
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
  const [existingImages, setExistingImages] = useState([]);

  const [deletedImages, setDeletedImages] = useState([]);

  const [attrOptions, setAttrOptions] = useState([]);

  const [submitting, setSubmitting] = useState(false);

  // Per-row "Chi tiết kỹ thuật" expand state. Only used on mobile —
  // desktop renders all selects inline thanks to the grid layout.
  const [openDetails, setOpenDetails] = useState({});

  // Wizard state — mobile only. Desktop renders the full form
  // regardless of `step` because the CSS media query gates step
  // visibility under 1024 px only.
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState("");

  // Draft restore prompt — shown once on mount if a stored draft is
  // found. The user can apply or discard before they touch any field.
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);

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

  const sellerMediaCtx = useMemo(
    () =>
      sellerMediaContext(product, {
        partNumber,
      }),
    [product, partNumber],
  );

  // Snapshot used by the autosave hook. Memoize so its identity only
  // changes when the form state actually changes.
  const draftSnapshot = useMemo(
    () => ({
      partNumber,
      partName,
      origin,
      stock,
      price,
      weight,
      length,
      width,
      height,
      shortDescription,
      description,
      carRows,
      existingImages,
      step,
      // We intentionally don't persist `images` (File objects can't be
      // serialised into localStorage). The seller will need to re-pick
      // any new images after a crash; everything else is recovered.
    }),
    [
      partNumber,
      partName,
      origin,
      stock,
      price,
      weight,
      length,
      width,
      height,
      shortDescription,
      description,
      carRows,
      existingImages,
      step,
    ],
  );

  const { restored, savedAt, clear: clearDraft } = useProductDraftAutosave({
    productId: product?.id || null,
    data: draftSnapshot,
    enabled: true,
  });

  // Offer restore once we've read the draft on mount. We don't apply
  // it implicitly so editing an existing product never overwrites
  // server state behind the seller's back.
  const restorePromptArmed = useRef(false);
  useEffect(() => {
    if (restorePromptArmed.current) return;
    if (restored) {
      restorePromptArmed.current = true;
      // For new-product flow, restore immediately is OK because there's
      // nothing to overwrite; for edits, the seller chooses.
      if (!product) {
        applyDraft(normalizeSellerDraftSnapshot(restored, sellerMediaContext(null, restored)));
      } else {
        setRestorePromptOpen(true);
      }
    }
  }, [restored, product]);

  function applyDraft(d) {
    try {
      const normalized = normalizeSellerDraftSnapshot(d, sellerMediaContext(product, d));
      setPartNumber(normalized.partNumber || "");
      setPartName(normalized.partName || "");
      setOrigin(normalized.origin || "");
      setStock(normalized.stock ?? "");
      setPrice(normalized.price ?? "");
      setWeight(normalized.weight ?? "");
      setLength(normalized.length ?? "");
      setWidth(normalized.width ?? "");
      setHeight(normalized.height ?? "");
      setShortDescription(normalized.shortDescription || "");
      setDescription(normalized.description || "");
      if (Array.isArray(normalized.carRows) && normalized.carRows.length) {
        setCarRows(normalized.carRows);
      }
      if (Array.isArray(normalized.existingImages)) {
        setExistingImages(normalized.existingImages);
      }
      if (normalized.step) setStep(Math.max(1, Math.min(5, Number(normalized.step) || 1)));
      sellerToast.info("Đã khôi phục bản nháp");
    } catch {
      /* ignore malformed drafts */
    }
  }

  useEffect(() => {
    axiosClient.get("/car/brands").then((res) => {
      setBrands(Array.isArray(res.data) ? res.data : []);
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

    const prodCars = Array.isArray(product?.cars) ? product.cars : [];
    const rows = prodCars.map((c) => ({
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

    // Load attributes for rows with carModelId (defensive)
    const loadAttributes = async () => {
      const targets = (rows || []).map((row) => (row && row.carModelId ? row.carModelId : null));
      const results = await Promise.all(
        targets.map((cmId) => {
          if (!cmId) return null;
          return axiosClient.get("/car/attributes", { params: { carModelId: cmId } }).catch(() => null);
        }),
      );
      const newOptions = (results || []).map((res) => (res && res.data ? res.data : {}));
      setAttrOptions(newOptions);
    };
    loadAttributes();

    (rows || []).forEach((row, idx) => {
      if (row && row.brand) {
        loadModels(idx, row.brand);
      }
    });

    setExistingImages(
      normalizeSellerProductImages(
        Array.isArray(product?.images) ? product.images : [],
        sellerMediaContext(product),
      ),
    );
    setShortDescription(
      sanitizeSellerProductHtml(product.shortDescription || "", sellerMediaContext(product)),
    );
    setDescription(
      sanitizeSellerProductHtml(
        product.fullDescription || product.description || "",
        sellerMediaContext(product),
      ),
    );

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

  // Reset transient step-error when the seller advances/retreats.
  useEffect(() => {
    setStepError("");
  }, [step]);

  const loadModels = async (idx, brand) => {
    const res = await axiosClient.get("/car/models", {
      params: { brand },
    });

    setModelsByRow((prev) => {
      const clone = [...prev];
      clone[idx] = Array.isArray(res.data) ? res.data : [];
      return clone;
    });
  };

  const years = [];
  for (let y = new Date().getFullYear(); y >= 1995; y--) years.push(y);

  const addCarRow = () => {
    setCarRows([...carRows, initialCarRow()]);
  };

  function validateStep(s) {
    if (s === 1) {
      if (!partNumber.trim() || !partName.trim()) {
        return "Vui lòng nhập Mã và Tên phụ tùng.";
      }
      if (price && Number.isNaN(Number(price))) return "Giá bán không hợp lệ.";
      if (stock && Number.isNaN(Number(stock))) return "Tồn kho không hợp lệ.";
    }
    if (s === 3) {
      // Only flag PARTIAL rows — fully empty rows are fine, fully
      // filled rows are fine, partial rows mean the seller forgot
      // something.
      for (const r of carRows) {
        const hasAny = r.brand || r.carModelId || r.year_from || r.year_to;
        const hasAll = r.carModelId && r.year_from && r.year_to;
        if (hasAny && !hasAll) {
          return "Có dòng xe đang thiếu thông tin (hãng / mẫu / năm).";
        }
        if (hasAll && Number(r.year_from) > Number(r.year_to)) {
          return "Năm không hợp lệ ở một trong các dòng xe.";
        }
      }
    }
    return "";
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      sellerToast.error(err);
      return;
    }
    setStep((s) => Math.min(5, s + 1));
  }
  function goPrev() {
    setStep((s) => Math.max(1, s - 1));
  }

  const handleSubmit = async () => {
    if (submitting) return;
    if (!partNumber || !partName) {
      sellerToast.error("Vui lòng nhập Mã & Tên phụ tùng");
      setStep(1);
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
      sellerToast.error(e.message);
      setStep(3);
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

      (images || []).forEach((img) => {
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
        sellerToast.success(product ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");
        clearDraft();
        onSuccess?.();
        onClose();
      }
    } catch (err) {
      const msg = err.response?.data?.message || "Lỗi khi lưu sản phẩm";
      sellerToast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  function toggleDetails(idx) {
    setOpenDetails((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  function handleSaveDraft() {
    try {
      flushProductDraft(product?.id || null, draftSnapshot, sellerMediaCtx);
      sellerToast.success("Đã lưu nháp");
    } catch {
      sellerToast.error("Không thể lưu nháp");
    }
  }

  const imageCount = (images || []).length + (existingImages || []).length;

  /** New uploads on edit replace the gallery — mark existing rows for removal. */
  const handleAddImages = (incoming) => {
    const files = Array.from(incoming || []);
    if (!files.length) return;

    if (product && (existingImages || []).length) {
      setDeletedImages((prev) => {
        const next = new Set(prev || []);
        for (const img of existingImages) {
          if (img?.id) next.add(img.id);
        }
        return [...next];
      });
      setExistingImages([]);
    }

    setImages([...(images || []), ...files]);
  };

  return createPortal(
    <div className="AddProductOverlay">
      <div
        className="AddProductForm AddProductForm--editor"
        data-step={step}
        data-mode={WIZARD_STEPS.length >= step ? "wizard" : "full"}
      >
        <header className="PopupHeader PopupHeader--sticky">
          <div className="PopupHeader__main">
            <h2 className="PopupHeader__title">
              {product ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm"}
            </h2>
            {product ? (
              <div className="PopupHeader__badge">
                <SellerLifecycleBadge product={product} />
              </div>
            ) : null}
            {savedAt ? (
              <span className="PopupHeader__draft" aria-live="polite">
                ✓ Đã lưu nháp
              </span>
            ) : null}
          </div>
          <div className="PopupHeaderActions">
            <button type="button" className="btnDraft" onClick={handleSaveDraft}>
              Lưu nháp
            </button>
            <button
              type="button"
              className="btnSubmit btnSubmit--header hidden lg:inline-flex"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Đang lưu…" : product ? "Đăng sản phẩm" : "Đăng sản phẩm"}
            </button>
            <button type="button" className="btnClose" onClick={onClose}>
              Đóng
            </button>
          </div>
        </header>

        <div className="AddProductFormBody">
        {product && product.sellerLifecycle === "rejected" ? (
          <div className="PopupGovernanceAlert">
            <SellerProductRejectBanner
              product={product}
              onResubmit={onResubmit}
              resubmitting={resubmitting}
            />
          </div>
        ) : null}

        {product ? (
          <details className="PopupTimelineFold">
            <summary>Lịch sử kiểm duyệt</summary>
            <SellerProductTimeline
              key={`${product.id}-${product.sellerLifecycle || product.moderationStatus || ""}`}
              productId={product.id}
            />
          </details>
        ) : null}

        {/* Mobile-only wizard progress dots + autosave indicator. The
            legacy desktop layout ignores both — `.WizardProgress` and
            `.WizardDraftIndicator` are `display: none` above the lg
            breakpoint. The dots scroll horizontally on tiny phones so
            we keep the draft indicator on its own row below them
            (never pushed off-screen). */}
        <div className="WizardProgress" aria-label="Tiến độ">
          {WIZARD_STEPS.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setStep(s.id)}
              className={
                "WizardProgress__dot " +
                (step === s.id
                  ? "is-active"
                  : step > s.id
                    ? "is-done"
                    : "")
              }
              aria-current={step === s.id ? "step" : undefined}
            >
              <span className="WizardProgress__dotIndex">{s.id}</span>
              <span className="WizardProgress__dotLabel">{s.label}</span>
            </button>
          ))}
        </div>

        {savedAt && (
          <div className="WizardDraftIndicator" aria-live="polite">
            ✓ Đã lưu nháp
            <span className="WizardDraftIndicator__hint">
              Tự động khôi phục nếu thoát giữa chừng
            </span>
          </div>
        )}

        {restorePromptOpen && (
          <div className="DraftRestoreBanner" role="alert">
            <div className="DraftRestoreBanner__msg">
              Phát hiện bản nháp chưa lưu trước đó.
            </div>
            <div className="DraftRestoreBanner__actions">
              <button
                type="button"
                onClick={() => {
                  setRestorePromptOpen(false);
                  applyDraft(restored);
                }}
              >
                Khôi phục
              </button>
              <button
                type="button"
                className="DraftRestoreBanner__discard"
                onClick={() => {
                  setRestorePromptOpen(false);
                  clearDraft();
                }}
              >
                Bỏ qua
              </button>
            </div>
          </div>
        )}

        {stepError && (
          <div className="WizardStepError" role="alert">
            {stepError}
          </div>
        )}

        <div className="FormGrid">
          <div className="LeftCol">
            <section className="FormCard" data-wizard-step="1">
              <div className="FormCard__head">
                <h3 className="FormCard__title">1. Thông tin cơ bản</h3>
                <p className="FormCard__hint">Mã và tên phụ tùng giúp khách tìm đúng sản phẩm.</p>
              </div>
              <div className="FormCard__body">
                <div className="FieldGrid FieldGrid--2">
                  <div className="Field">
                    <label htmlFor="ap-part-number">Mã phụ tùng *</label>
                    <input
                      id="ap-part-number"
                      value={partNumber}
                      onChange={(e) => setPartNumber(e.target.value)}
                      placeholder="VD: 1234567890"
                    />
                  </div>
                  <div className="Field">
                    <label htmlFor="ap-part-name">Tên phụ tùng *</label>
                    <AutocompleteInput
                      value={partName}
                      onChange={setPartName}
                      fetchSuggestions={fetchPartNameSuggestions}
                      sourceKey="partName"
                      placeholder="VD: Lọc gió động cơ"
                      ariaLabel="Tên phụ tùng"
                    />
                  </div>
                </div>
                <div className="Field">
                  <label htmlFor="ap-origin">Xuất xứ</label>
                  <AutocompleteInput
                    value={origin}
                    onChange={setOrigin}
                    fetchSuggestions={fetchOriginSuggestions}
                    sourceKey="origin"
                    placeholder="VD: OEM, Chính hãng, Aftermarket"
                    ariaLabel="Xuất xứ"
                  />
                </div>
              </div>
            </section>

            <section className="FormCard" data-wizard-step="1">
              <div className="FormCard__head">
                <h3 className="FormCard__title">3. Giá &amp; tồn kho</h3>
                <p className="FormCard__hint">Giá bán và số lượng tồn kho hiện tại.</p>
              </div>
              <div className="FormCard__body">
                <div className="FieldGrid FieldGrid--2">
                  <div className="Field">
                    <label htmlFor="ap-price">Giá bán (₫)</label>
                    <input
                      id="ap-price"
                      inputMode="numeric"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="Field">
                    <label htmlFor="ap-stock">Tồn kho</label>
                    <input
                      id="ap-stock"
                      inputMode="numeric"
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section
              className="FormCard FormCard--mobileImages lg:hidden"
              data-wizard-step="2"
            >
              <div className="FormCard__head">
                <h3 className="FormCard__title">5. Hình ảnh sản phẩm</h3>
                <p className="FormCard__hint">Tối thiểu 3 ảnh rõ nét, nền sáng.</p>
              </div>
              <div className="FormCard__body">
                <ImagePicker
                  cameraFirst
                  panelMode
                  mediaCtx={sellerMediaCtx}
                  images={images}
                  existingImages={existingImages}
                  onAddImages={handleAddImages}
                  onRemoveNewImage={(i) => {
                    const clone = [...(images || [])];
                    clone.splice(i, 1);
                    setImages(clone);
                  }}
                  onRemoveExistingImage={(img, i) => {
                    const clone = [...(existingImages || [])];
                    setDeletedImages((prev) => [...(prev || []), img.id]);
                    clone.splice(i, 1);
                    setExistingImages(clone);
                  }}
                />
              </div>
            </section>

            <section className="FormCard" data-wizard-step="3">
              <div className="FormCard__head">
                <h3 className="FormCard__title">2. Xe áp dụng</h3>
                <p className="FormCard__hint">Chọn xe tương thích — hiển thị dạng thẻ sau khi lưu.</p>
              </div>
              <div className="FormCard__body">
                {carRows.some(isCarRowComplete) ? (
                  <div className="VehicleChipList" aria-label="Xe đã chọn">
                    {carRows.map((r, idx) => {
                      if (!isCarRowComplete(r)) return null;
                      const label = getCarChipLabel(r, modelsByRow[idx] || []);
                      return (
                        <span key={`chip-${idx}`} className="VehicleChip">
                          {label}
                          <button
                            type="button"
                            className="VehicleChip__remove"
                            aria-label={`Xóa ${label}`}
                            onClick={() => {
                              const clone = [...carRows];
                              clone.splice(idx, 1);
                              setCarRows(clone.length ? clone : [initialCarRow()]);
                              setModelsByRow((prev) => {
                                const m = [...prev];
                                m.splice(idx, 1);
                                return m.length ? m : [[]];
                              });
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : null}

              {carRows.map((r, idx) => {
                if (isCarRowComplete(r)) return null;
                return (
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
              );
              })}

              <button
                type="button"
                className="btnAddCar"
                onClick={addCarRow}
              >
                + Thêm xe áp dụng
              </button>
              </div>
            </section>

            <section className="FormCard" data-wizard-step="4">
              <div className="FormCard__head">
                <h3 className="FormCard__title">4. Kích thước &amp; vận chuyển</h3>
                <p className="FormCard__hint">Dùng để tính phí vận chuyển (cm, gram).</p>
              </div>
              <div className="FormCard__body">
                <div className="FieldGrid FieldGrid--4">
                  <div className="Field">
                    <label htmlFor="ap-length">Dài (cm)</label>
                    <input
                      id="ap-length"
                      inputMode="decimal"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="Field">
                    <label htmlFor="ap-width">Rộng (cm)</label>
                    <input
                      id="ap-width"
                      inputMode="decimal"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="Field">
                    <label htmlFor="ap-height">Cao (cm)</label>
                    <input
                      id="ap-height"
                      inputMode="decimal"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="Field">
                    <label htmlFor="ap-weight">Khối lượng (g)</label>
                    <input
                      id="ap-weight"
                      inputMode="decimal"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="FormCard" data-wizard-step="4">
              <div className="FormCard__head">
                <h3 className="FormCard__title">6. Mô tả sản phẩm</h3>
                <p className="FormCard__hint">Mô tả ngắn cho danh sách; mô tả chi tiết thân thiện SEO.</p>
              </div>
              <div className="FormCard__body">
                <div className="Field">
                  <label>Mô tả ngắn</label>
                  <div className="EditorCard ShortEditor">
                    <ReactQuill
                      value={shortDescription}
                      onChange={setShortDescription}
                      modules={modules}
                      placeholder="Tóm tắt 1–2 câu về sản phẩm"
                    />
                  </div>
                </div>
                <div className="Field">
                  <label>Mô tả chi tiết</label>
                  <div className="EditorCard DescriptionEditor">
                    <ReactQuill
                      value={description}
                      onChange={setDescription}
                      modules={modules}
                      placeholder="Thông số, lưu ý lắp đặt, bảo hành…"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Mobile-only "Xác nhận" review step. Hidden on desktop. */}
            <section
              className="ProductFormSection ProductFormSection--review lg:hidden"
              data-wizard-step="5"
            >
              <h3 className="ProductFormSection__title">Xác nhận</h3>
              <ReviewSummary
                partNumber={partNumber}
                partName={partName}
                price={price}
                stock={stock}
                origin={origin}
                carRows={carRows}
                imageCount={(images || []).length + (existingImages || []).length}
                onJump={setStep}
              />
            </section>
          </div>

          <aside className="RightCol RightCol--media">
            <div className="MediaPanel">
              <div className="MediaPanel__head">
                <h3 className="MediaPanel__title">Hình ảnh</h3>
                <span className="MediaPanel__count">{imageCount} ảnh</span>
              </div>
              <ImagePicker
                panelMode
                mediaCtx={sellerMediaCtx}
                images={images}
                existingImages={existingImages}
                onAddImages={handleAddImages}
                onRemoveNewImage={(i) => {
                  const clone = [...(images || [])];
                  clone.splice(i, 1);
                  setImages(clone);
                }}
                onRemoveExistingImage={(img, i) => {
                  const clone = [...(existingImages || [])];
                  setDeletedImages((prev) => [...(prev || []), img.id]);
                  clone.splice(i, 1);
                  setExistingImages(clone);
                }}
              />
              <ul className="MediaPanel__tips">
                <li>Ảnh rõ, nền sáng</li>
                <li>Tối thiểu 3 ảnh</li>
                <li>Không chèn số điện thoại</li>
              </ul>
            </div>
          </aside>
        </div>
        </div>

        {/* Mobile wizard footer: Prev / Next on steps 1-4, "Lưu sản
            phẩm" on step 5. Desktop uses the legacy RightCol button so
            this footer stays hidden via `.lg:hidden`. */}
        <div className="MobileSaveBar lg:hidden">
          {step > 1 ? (
            <button
              type="button"
              className="btnSecondary"
              onClick={goPrev}
              disabled={submitting}
            >
              ‹ Quay lại
            </button>
          ) : (
            <span className="MobileSaveBar__spacer" />
          )}

          {step < 5 ? (
            <button
              type="button"
              className="btnSubmit"
              onClick={goNext}
              disabled={submitting}
            >
              Tiếp tục ›
            </button>
          ) : (
            <button
              type="button"
              className="btnSubmit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? "Đang lưu…"
                : product
                  ? "Đăng sản phẩm"
                  : "Đăng sản phẩm"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Image picker — shared by mobile (in LeftCol order-first) and desktop
   (in RightCol). Visually identical, just renders in different DOM
   locations so the responsive layout can prioritise it differently.
   On mobile (`cameraFirst` prop) it also exposes a separate "Chụp ảnh"
   button that uses `<input capture="environment">` to nudge the device
   to its rear camera. Falls back to the gallery picker on desktop
   browsers that ignore the `capture` attribute.                       */
/* ------------------------------------------------------------------ */
function ImagePicker({
  images,
  existingImages,
  onAddImages,
  onRemoveNewImage,
  onRemoveExistingImage,
  cameraFirst,
  panelMode = false,
  mediaCtx = {},
}) {
  const totalCount = (existingImages || []).length + (images || []).length;
  let previewIndex = 0;

  function previewUrl(raw) {
    const normalized = normalizeSellerProductImageUrl(raw, mediaCtx);
    if (!normalized) return PRODUCT_IMAGE_PLACEHOLDER;
    return `${normalized}?t=${Date.now()}`;
  }

  return (
    <div className={`ImagePicker${panelMode ? " ImagePicker--panel" : ""}`}>
      <div className="ImagePicker__dropzone">
        <div className="ImagePicker__actions">
          {cameraFirst && (
            <label className="ImagePicker__input ImagePicker__input--camera">
              <span className="ImagePicker__inputLabel">📷 Chụp ảnh</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length) onAddImages(files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <label className="ImagePicker__input ImagePicker__input--primary">
            <span className="ImagePicker__inputLabel">
              {cameraFirst ? "🖼️ Thư viện" : "+ Tải ảnh lên"}
            </span>
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
        </div>
        {totalCount === 0 ? (
          <p className="ImagePicker__emptyHint">Kéo thả hoặc bấm để tải ảnh sản phẩm</p>
        ) : null}
      </div>

      {totalCount > 0 ? (
        <div className="ImagePicker__meta">
          <span>{totalCount} ảnh đã chọn</span>
        </div>
      ) : null}

      <div className="ImagePreview">
        {(existingImages || []).map((img, i) => {
          const isPrimary = previewIndex === 0;
          previewIndex += 1;
          return (
          <div key={"old-" + i} className="ImagePreview__item">
            {isPrimary ? <span className="ImagePreview__primary">Ảnh bìa</span> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl(img.url)} alt="" className="ImagePreview__img" />
            <button
              type="button"
              className="ImagePreview__remove"
              aria-label="Xóa ảnh"
              onClick={() => onRemoveExistingImage(img, i)}
            >
              ✕
            </button>
          </div>
        );})}

        {(images || []).map((img, i) => {
          const isPrimary = previewIndex === 0;
          previewIndex += 1;
          return (
          <div key={"new-" + i} className="ImagePreview__item ImagePreview__item--new">
            {isPrimary ? <span className="ImagePreview__primary">Ảnh bìa</span> : null}
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
        );})}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ReviewSummary — read-only summary shown on mobile step 5. Each row
   is tappable; tapping jumps the wizard back to that step so the
   seller can correct without leaving the popup.                       */
/* ------------------------------------------------------------------ */
function ReviewSummary({
  partNumber,
  partName,
  price,
  stock,
  origin,
  carRows,
  imageCount,
  onJump,
}) {
  const filledCarRows = carRows.filter(
    (r) => r.carModelId && r.year_from && r.year_to,
  );

  return (
    <div className="ReviewSummary">
      <button
        type="button"
        className="ReviewSummary__row"
        onClick={() => onJump(1)}
      >
        <span className="ReviewSummary__label">Mã / Tên</span>
        <span className="ReviewSummary__value">
          {partNumber || "—"} · {partName || "(chưa có)"}
        </span>
      </button>
      <button
        type="button"
        className="ReviewSummary__row"
        onClick={() => onJump(1)}
      >
        <span className="ReviewSummary__label">Giá / Tồn</span>
        <span className="ReviewSummary__value">
          {price ? Number(price).toLocaleString("vi-VN") + "₫" : "—"} ·{" "}
          {stock || 0} sp
        </span>
      </button>
      <button
        type="button"
        className="ReviewSummary__row"
        onClick={() => onJump(1)}
      >
        <span className="ReviewSummary__label">Xuất xứ</span>
        <span className="ReviewSummary__value">{origin || "—"}</span>
      </button>
      <button
        type="button"
        className="ReviewSummary__row"
        onClick={() => onJump(2)}
      >
        <span className="ReviewSummary__label">Ảnh</span>
        <span className="ReviewSummary__value">
          {imageCount ? `${imageCount} ảnh` : "Chưa có ảnh"}
        </span>
      </button>
      <button
        type="button"
        className="ReviewSummary__row"
        onClick={() => onJump(3)}
      >
        <span className="ReviewSummary__label">Xe áp dụng</span>
        <span className="ReviewSummary__value">
          {filledCarRows.length
            ? `${filledCarRows.length} xe`
            : "Chưa chọn xe"}
        </span>
      </button>
    </div>
  );
}
