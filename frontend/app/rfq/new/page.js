"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { API_BASE } from "@/lib/config";
import VehicleSelector from "@/components/vehicle/VehicleSelector";
import RfqImageUpload from "@/components/rfq/RfqImageUpload";
import RfqHistoryEntryLink from "@/components/rfq/RfqHistoryEntryLink";
import { useRfqImageUpload, RFQ_IMAGE_SECTION_KEYS } from "@/hooks/useRfqImageUpload";
import { saveHistoryLastPhone, getHistoryLastPhone } from "@/lib/rfq/rfqHistorySession";
import {
  RFQ_MAX_CREATE_IMAGES,
  getUploadRejectMessage,
  validateRfqCreateForm,
} from "@/lib/rfq/rfqCreateValidation";
import { evaluateRfqCreateSubmitGate, logRfqCreateSubmitDebug } from "@/lib/rfq/rfqSubmitGate";

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
  const [draftPending, setDraftPending] = useState(false);

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

  useEffect(() => {
    const stored =
      getHistoryLastPhone() ||
      (typeof window !== "undefined" ? sessionStorage.getItem("rfq_phone") : "") ||
      "";
    if (stored && !phone) setPhone(stored);
  }, []);

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

    setDraftPending(true);
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
        saveHistoryLastPhone(phone.trim());
        if (res.data.devOtpCode) {
          sessionStorage.setItem("rfq_dev_otp", String(res.data.devOtpCode));
        }
        return pid;
      })
      .finally(() => {
        draftPromiseRef.current = null;
        setDraftPending(false);
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

  const submitGate = useMemo(
    () =>
      evaluateRfqCreateSubmitGate({
        busy,
        validation,
        uploadStatus: images.uploadStatus,
        draftPending,
      }),
    [busy, validation, images.uploadStatus, draftPending],
  );

  const showFieldErrors = submitAttempted || Object.keys(touched).length > 0;
  const errors = showFieldErrors ? submitGate.errors : {};

  const canUploadImages = useMemo(() => {
    const base = validateRfqCreateForm({
      phone,
      partDescription,
      vehicle,
      imageCount: 0,
    });
    return base.valid;
  }, [phone, partDescription, vehicle]);

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
    setSubmitAttempted(true);

    const gate = evaluateRfqCreateSubmitGate({
      busy,
      validation: validateRfqCreateForm({ phone, partDescription, vehicle, imageCount }),
      uploadStatus: images.uploadStatus,
      draftPending,
    });

    logRfqCreateSubmitDebug("click", {
      canSubmit: gate.canSubmit,
      blockers: gate.blockers.map((b) => b.code),
      uploadStatus: images.uploadStatus,
      imageCount,
      validationValid: gate.normalized != null,
    });

    if (!gate.canSubmit) {
      const label = gate.primaryBlocker?.label || "Không thể tiếp tục — kiểm tra form.";
      setMsg(label);
      scrollToFirstError(gate.errors);
      if (gate.primaryBlocker?.code === "upload_failed") {
        imagesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    const { phoneE164, partDescription: desc, vehicle: v } = gate.normalized;
    const imageUrls = images.getUploadedUrls();

    setMsg("");
    setBusy(true);
    logRfqCreateSubmitDebug("posting", { imageUrls: imageUrls.length });

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
      saveHistoryLastPhone(phone.trim());
      if (res.data.devOtpCode) {
        sessionStorage.setItem("rfq_dev_otp", String(res.data.devOtpCode));
      }

      await images.flushPending();

      logRfqCreateSubmitDebug("redirect", { publicId: res.data.publicId });
      window.location.href = "/rfq/success";
    } catch (err) {
      logRfqCreateSubmitDebug("error", {
        status: err.response?.status,
        code: err.response?.data?.code,
      });
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

  const submitBlockLabel = submitGate.primaryBlocker?.label || "";

  return (
    <div className="rfq-new-page">
      <div className="card rfq-new-page__card">
        <div className="rfq-new-page__head">
          <h1>Hỏi giá phụ tùng</h1>
          <RfqHistoryEntryLink variant="secondary" className="rfq-new-page__history-link" source="rfq_new" />
        </div>
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
            maxPerSection={4}
            sectionRejectMessages={uploadReject}
          />
          {errors.images ? (
            <p className="rfq-field-error" role="alert">
              {errors.images}
            </p>
          ) : null}
          {images.uploadStatus.hasUploading ? (
            <p className="rfq-submit-block muted" role="status">
              Đang tải {images.uploadStatus.pending + images.uploadStatus.uploading} ảnh…
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className={!submitGate.canSubmit ? "rfq-submit-btn--blocked" : ""}
          aria-disabled={!submitGate.canSubmit}
          title={submitBlockLabel || undefined}
        >
          {busy ? "Đang gửi…" : "Tiếp tục"}
        </button>
        {!submitGate.canSubmit && submitBlockLabel ? (
          <p className="rfq-submit-block rfq-field-error" role="alert">
            {submitBlockLabel}
          </p>
        ) : null}
      </form>
      {msg ? <p className="rfq-form-msg" role="alert">{msg}</p> : null}
      </div>

      <div className="rfq-new-page__sticky">
        <RfqHistoryEntryLink variant="primary" sticky source="rfq_new_sticky" />
      </div>
    </div>
  );
}
