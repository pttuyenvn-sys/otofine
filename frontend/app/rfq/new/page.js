"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { API_BASE } from "@/lib/config";
import VehicleSelector from "@/components/vehicle/VehicleSelector";
import RfqImageUpload from "@/components/rfq/RfqImageUpload";
import { useRfqImageUpload, RFQ_IMAGE_SECTION_KEYS } from "@/hooks/useRfqImageUpload";
import {
  RFQ_MAX_CREATE_IMAGES,
  getUploadRejectMessage,
  validateRfqCreateForm,
} from "@/lib/rfq/rfqCreateValidation";

const EMPTY_VEHICLE = { brand: "", model: "", year: "" };

const FIELD_ORDER = ["phone", "partDescription", "vehicle", "images"];

export default function RfqNewPage() {
  const [phone, setPhone] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [vehicle, setVehicle] = useState(EMPTY_VEHICLE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [uploadReject, setUploadReject] = useState({});

  const phoneRef = useRef(null);
  const descRef = useRef(null);
  const vehicleRef = useRef(null);
  const imagesRef = useRef(null);

  const publicIdRef = useRef(null);
  const draftPromiseRef = useRef(null);

  const fieldRefs = useMemo(
    () => ({
      phone: phoneRef,
      partDescription: descRef,
      vehicle: vehicleRef,
      images: imagesRef,
    }),
    [],
  );

  const ensurePublicId = useCallback(async () => {
    if (publicIdRef.current) return publicIdRef.current;
    if (draftPromiseRef.current) return draftPromiseRef.current;

    const check = validateRfqCreateForm({
      phone,
      partDescription,
      vehicle,
      imageCount: 0,
    });
    if (!check.valid || !check.normalized) {
      throw new Error("NEED_VALID_FORM");
    }

    const { phoneE164, partDescription: desc, vehicle: v } = check.normalized;

    draftPromiseRef.current = axios
      .post(
        `${API_BASE}/rfq/create`,
        {
          phone: phoneE164,
          partDescription: desc,
          vehicle: v,
          imageUrls: [],
        },
        { timeout: 30_000 },
      )
      .then((res) => {
        const pid = res.data?.publicId;
        if (!pid) throw new Error("NO_PUBLIC_ID");
        publicIdRef.current = pid;
        sessionStorage.setItem("rfq_public_id", pid);
        sessionStorage.setItem("rfq_phone", phone.trim());
        if (res.data.devOtpCode) {
          sessionStorage.setItem("rfq_dev_otp", String(res.data.devOtpCode));
        }
        return pid;
      })
      .finally(() => {
        draftPromiseRef.current = null;
      });

    return draftPromiseRef.current;
  }, [phone, partDescription, vehicle]);

  const images = useRfqImageUpload({
    ensurePublicId,
    maxPerSection: 4,
    maxTotal: RFQ_MAX_CREATE_IMAGES,
  });

  const imageCount = useMemo(
    () =>
      RFQ_IMAGE_SECTION_KEYS.reduce(
        (n, k) => n + (images.sections[k]?.length || 0),
        0,
      ),
    [images.sections],
  );

  const validation = useMemo(
    () => validateRfqCreateForm({ phone, partDescription, vehicle, imageCount }),
    [phone, partDescription, vehicle, imageCount],
  );

  const showFieldErrors = submitAttempted || Object.keys(touched).length > 0;
  const errors = showFieldErrors ? validation.errors : {};

  const canUploadImages = useMemo(() => {
    const base = validateRfqCreateForm({
      phone,
      partDescription,
      vehicle,
      imageCount: 0,
    });
    return base.valid;
  }, [phone, partDescription, vehicle]);

  const canSubmit =
    validation.valid && !busy && !images.hasUploading() && !images.hasErrors();

  function markTouched(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function scrollToFirstError(errMap) {
    for (const key of FIELD_ORDER) {
      if (errMap[key] && fieldRefs[key]?.current) {
        fieldRefs[key].current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        break;
      }
    }
  }

  function wrapAddFiles(sectionKey) {
    return (fileList) => {
      const result = images.addFiles(sectionKey, fileList);
      if (result.rejected?.length) {
        const reason = result.rejected[0].reason;
        setUploadReject((prev) => ({
          ...prev,
          [sectionKey]: getUploadRejectMessage(reason, {
            maxPerSection: 4,
            maxTotal: RFQ_MAX_CREATE_IMAGES,
          }),
        }));
      } else if (result.added > 0) {
        setUploadReject((prev) => ({ ...prev, [sectionKey]: "" }));
      }
      return result;
    };
  }

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    setSubmitAttempted(true);

    if (!validation.valid) {
      scrollToFirstError(validation.errors);
      return;
    }

    if (images.hasUploading()) {
      setMsg("Đang tải ảnh — vui lòng đợi hoặc xóa ảnh lỗi trước khi tiếp tục.");
      scrollToFirstError({ images: "uploading" });
      return;
    }

    if (images.hasErrors()) {
      setMsg("Có ảnh tải lên thất bại — thử lại hoặc xóa ảnh lỗi.");
      imagesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const { phoneE164, partDescription: desc, vehicle: v } = validation.normalized;
    const imageUrls = images.getUploadedUrls();

    setBusy(true);
    try {
      const res = await axios.post(`${API_BASE}/rfq/create`, {
        phone: phoneE164,
        partDescription: desc,
        vehicle: v,
        imageUrls,
      });

      publicIdRef.current = res.data.publicId;
      sessionStorage.setItem("rfq_public_id", res.data.publicId);
      sessionStorage.setItem("rfq_phone", phone.trim());
      if (res.data.devOtpCode) {
        sessionStorage.setItem("rfq_dev_otp", String(res.data.devOtpCode));
      }

      await images.flushPending();

      window.location.href = "/rfq/success";
    } catch (err) {
      const code = err.response?.data?.code;
      setMsg(
        err.response?.data?.message ||
          code ||
          "Không tạo được RFQ — kiểm tra RFQ_MODULE_ENABLED và migration.",
      );
    } finally {
      setBusy(false);
    }
  }

  const uploadBlockedHint = canUploadImages
    ? ""
    : "Nhập đủ SĐT, mô tả (≥8 ký tự) và chọn xe trước khi tải ảnh.";

  return (
    <div className="card">
      <h1>Hỏi giá phụ tùng</h1>
      <p className="muted">Điền mô tả &amp; SĐT — OTP xác minh ngắn.</p>
      <form
        onSubmit={submit}
        noValidate
        style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}
      >
        <div ref={phoneRef} className="rfq-form-field">
          <label htmlFor="rfq-phone">Số điện thoại</label>
          <input
            id="rfq-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => markTouched("phone")}
            placeholder="0901234567"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={errors.phone ? "true" : "false"}
            aria-describedby={errors.phone ? "rfq-phone-err" : undefined}
          />
          {errors.phone ? (
            <p id="rfq-phone-err" className="rfq-field-error" role="alert">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <div ref={descRef} className="rfq-form-field">
          <label htmlFor="rfq-desc">Mô tả phụ tùng / triệu chứng</label>
          <textarea
            id="rfq-desc"
            value={partDescription}
            onChange={(e) => setPartDescription(e.target.value)}
            onBlur={() => markTouched("partDescription")}
            aria-invalid={errors.partDescription ? "true" : "false"}
            aria-describedby={errors.partDescription ? "rfq-desc-err" : undefined}
          />
          {errors.partDescription ? (
            <p id="rfq-desc-err" className="rfq-field-error" role="alert">
              {errors.partDescription}
            </p>
          ) : null}
        </div>

        <div ref={vehicleRef} className="rfq-form-field">
          <VehicleSelector
            value={vehicle}
            onChange={(v) => {
              setVehicle(v);
              markTouched("vehicle");
            }}
            required
            showErrors={showFieldErrors}
          />
          {errors.vehicle ? (
            <p className="rfq-field-error" role="alert">
              {errors.vehicle}
            </p>
          ) : null}
        </div>

        <div ref={imagesRef} className="rfq-form-field">
          <RfqImageUpload
            sections={images.sections}
            addFiles={(sectionKey, fileList) => wrapAddFiles(sectionKey)(fileList)}
            removeItem={images.removeItem}
            retryUpload={images.retryUpload}
            canUpload={canUploadImages}
            uploadBlockedHint={uploadBlockedHint}
            maxPerSection={4}
            sectionRejectMessages={uploadReject}
          />
          {errors.images ? (
            <p className="rfq-field-error" role="alert">
              {errors.images}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={!canSubmit}>
          {busy ? "Đang gửi…" : "Tiếp tục"}
        </button>
      </form>
      {msg ? <p className="rfq-form-msg" role="alert">{msg}</p> : null}
      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link href="/">← Về trang chủ</Link>
      </p>
    </div>
  );
}