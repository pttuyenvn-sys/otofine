"use client";

import { useId, useRef } from "react";
import { rfqImageSrc } from "@/lib/rfq/rfqMediaUrl";
import { RFQ_UPLOAD_ACCEPT } from "@/lib/rfq/rfqUploadImage";

/**
 * Mobile-first image picker: camera capture + gallery, multi-select, preview grid.
 */
export default function RfqImageUploadSection({
  sectionKey,
  title,
  hint,
  capture = "environment",
  items = [],
  maxCount = 6,
  canUpload = true,
  uploadBlockedHint = "",
  onAddFiles,
  onRemove,
  onRetry,
  rejectMessage = "",
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const atMax = items.length >= maxCount;

  function openPicker() {
    if (!canUpload) return;
    if (atMax) return;
    inputRef.current?.click();
  }

  function onInputChange(e) {
    onAddFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <section className="rfq-upload-section" aria-labelledby={`${inputId}-title`}>
      <div className="rfq-upload-section__head">
        <h3 id={`${inputId}-title`} className="rfq-upload-section__title">
          {title}
        </h3>
        {hint ? <p className="rfq-upload-section__hint muted">{hint}</p> : null}
      </div>

      <div className="rfq-upload-actions">
        <button
          type="button"
          className="rfq-upload-btn rfq-upload-btn--camera"
          disabled={!canUpload || atMax}
          onClick={openPicker}
        >
          📷 Chụp / chọn ảnh
        </button>
        <span className="rfq-upload-count muted">
          {items.length}/{maxCount}
        </span>
      </div>

      {!canUpload && uploadBlockedHint ? (
        <p className="rfq-upload-blocked muted">{uploadBlockedHint}</p>
      ) : null}
      {rejectMessage ? (
        <p className="rfq-field-error" role="alert">
          {rejectMessage}
        </p>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={RFQ_UPLOAD_ACCEPT}
        capture={capture}
        multiple
        className="rfq-upload-input-hidden"
        onChange={onInputChange}
      />

      {items.length > 0 ? (
        <ul className="rfq-upload-grid" aria-label={title}>
          {items.map((it) => {
            const src =
              it.status === "done" && it.url
                ? rfqImageSrc(it.url)
                : it.previewUrl || "";
            return (
              <li key={it.clientId} className="rfq-upload-tile">
                <div className="rfq-upload-tile__frame">
                  {src ? (
                    <img src={src} alt="" className="rfq-upload-tile__img" />
                  ) : (
                    <span className="rfq-upload-tile__placeholder" aria-hidden />
                  )}
                  {(it.status === "uploading" || it.status === "pending") && (
                    <span className="rfq-upload-tile__overlay" role="status">
                      <span className="rfq-upload-spinner" aria-hidden />
                      Đang tải…
                    </span>
                  )}
                  {it.status === "error" && (
                    <span className="rfq-upload-tile__overlay rfq-upload-tile__overlay--error">
                      Lỗi
                    </span>
                  )}
                </div>
                {it.status === "error" && (
                  <p className="rfq-upload-tile__err">{it.error || "Tải thất bại"}</p>
                )}
                <div className="rfq-upload-tile__actions">
                  {it.status === "error" ? (
                    <button
                      type="button"
                      className="rfq-upload-tile__retry"
                      onClick={() => onRetry(it.clientId)}
                    >
                      Thử lại
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rfq-upload-tile__remove"
                    aria-label="Xóa ảnh"
                    disabled={it.status === "uploading"}
                    onClick={() => onRemove(it.clientId)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rfq-upload-empty muted">Chưa có ảnh — bấm chụp hoặc chọn từ thư viện.</p>
      )}
    </section>
  );
}
