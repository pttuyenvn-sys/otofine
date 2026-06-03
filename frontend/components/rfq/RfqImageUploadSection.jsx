"use client";

import { useId, useRef } from "react";
import { RFQ_UPLOAD_ACCEPT } from "@/lib/rfq/rfqUploadImage";
import RfqLazyImage from "@/components/rfq/RfqLazyImage";
import { RFQ_MEDIA_VARIANT } from "@/lib/rfq/rfqMediaUrl";

/**
 * Mobile-first image picker: separate camera vs gallery (no forced capture on gallery).
 */
export default function RfqImageUploadSection({
  title,
  items = [],
  maxCount = 6,
  canUpload = true,
  onAddFiles,
  onRemove,
  onRetry,
  rejectMessage = "",
}) {
  const inputId = useId();
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const atMax = items.length >= maxCount;

  function onInputChange(e) {
    onAddFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <section className="rfq-upload-section" aria-labelledby={`${inputId}-title`}>
      <h3 id={`${inputId}-title`} className="rfq-upload-section__title">
        {title}
      </h3>

      <div className="rfq-upload-actions rfq-upload-actions--split">
        <button
          type="button"
          className="rfq-upload-btn rfq-upload-btn--camera"
          disabled={!canUpload || atMax}
          onClick={() => cameraRef.current?.click()}
        >
          📷 Chụp ảnh
        </button>
        <button
          type="button"
          className="rfq-upload-btn rfq-upload-btn--gallery"
          disabled={!canUpload || atMax}
          onClick={() => galleryRef.current?.click()}
        >
          🖼 Chọn từ thư viện
        </button>
        <span className="rfq-upload-count muted">
          {items.length}/{maxCount}
        </span>
      </div>

      {rejectMessage ? (
        <p className="rfq-field-error" role="alert">
          {rejectMessage}
        </p>
      ) : null}

      <input
        ref={cameraRef}
        id={`${inputId}-camera`}
        type="file"
        accept={RFQ_UPLOAD_ACCEPT}
        capture="environment"
        className="rfq-upload-input-hidden"
        onChange={onInputChange}
      />
      <input
        ref={galleryRef}
        id={`${inputId}-gallery`}
        type="file"
        accept={RFQ_UPLOAD_ACCEPT}
        multiple
        className="rfq-upload-input-hidden"
        onChange={onInputChange}
      />

      {items.length > 0 ? (
        <ul className="rfq-upload-grid" aria-label={title}>
          {items.map((it) => {
            const previewSrc = it.previewUrl || "";
            return (
              <li key={it.clientId} className="rfq-upload-tile">
                <div className="rfq-upload-tile__frame">
                  {it.status === "done" && it.url ? (
                    <RfqLazyImage
                      originalUrl={it.url}
                      variant={RFQ_MEDIA_VARIANT.ORIGINAL}
                      alt=""
                      className="rfq-upload-tile__img"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : previewSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewSrc}
                      alt=""
                      className="rfq-upload-tile__img"
                      loading="lazy"
                      decoding="async"
                    />
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
      ) : null}
    </section>
  );
}
