"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RFQ_MESSAGE_TEXT_MAX } from "@/lib/rfq/rfqConversationConstants";
import { RFQ_UPLOAD_ACCEPT } from "@/lib/rfq/rfqUploadImage";
import { useRfqChatImageUpload } from "@/hooks/useRfqChatImageUpload";
import RfqLazyImage from "@/components/rfq/RfqLazyImage";
import { RFQ_MEDIA_VARIANT } from "@/lib/rfq/rfqMediaUrl";

/**
 * Text + image composer for RFQ conversations (poll transport; websocket deferred).
 */
export default function RfqMessageComposer({
  dispatchId,
  conversationHeaders = {},
  onSend,
  disabled = false,
  placeholder = "Nhập tin nhắn…",
  sendLabel = "Gửi",
  className = "",
  sticky = false,
  quickReplies = null,
  hideHints = false,
}) {
  const inputId = useId();
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const areaRef = useRef(null);

  const images = useRfqChatImageUpload({
    dispatchId,
    headers: conversationHeaders,
  });

  const trimmed = text.trim();
  const hasReadyImages = images.items.some((it) => it.status === "done");
  const canSend =
    !disabled &&
    !sending &&
    !images.hasUploading() &&
    !images.hasErrors() &&
    (trimmed.length > 0 || hasReadyImages);

  const resize = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollHeight = el.scrollHeight;
    const max = 120;
    if (!String(text || "").trim()) {
      el.style.height = "";
      return;
    }
    el.style.height = `${Math.min(max, Math.max(40, scrollHeight))}px`;
  }, [text]);

  useEffect(() => {
    resize();
  }, [text, resize]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setSendError("");
    try {
      const attachmentIds = images.getAttachmentIds();
      await onSend(trimmed, { attachmentIds });
      setText("");
      images.clearAll();
      if (areaRef.current) areaRef.current.style.height = "";
    } catch (err) {
      const data = err?.response?.data;
      const msg =
        data?.message ||
        (data?.code && data.code !== "INTERNAL" ? data.code : null) ||
        (err?.response?.status === 429 ? "Quá nhiều tin nhắn — thử lại sau" : null) ||
        "Không gửi được tin nhắn — thử lại.";
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void handleSubmit(e);
    }
  }

  function onFiles(fileList) {
    images.addFiles(fileList);
  }

  return (
    <form
      className={`rfq-msg-composer rfq-msg-composer--compact ${sticky ? "rfq-msg-composer--sticky" : ""} ${className}`.trim()}
      onSubmit={handleSubmit}
    >
      {images.items.length > 0 ? (
        <ul className="rfq-msg-composer__previews" aria-label="Ảnh sẽ gửi">
          {images.items.map((it) => {
            const previewSrc = it.previewUrl || "";
            return (
              <li key={it.clientId} className="rfq-msg-composer__preview">
                {it.status === "done" && it.url ? (
                  <RfqLazyImage
                    originalUrl={it.url}
                    variant={RFQ_MEDIA_VARIANT.ORIGINAL}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewSrc} alt="" loading="lazy" decoding="async" />
                ) : null}
                {(it.status === "pending" || it.status === "uploading") && (
                  <span className="rfq-msg-composer__preview-status">…</span>
                )}
                {it.status === "error" && (
                  <button
                    type="button"
                    className="rfq-msg-composer__preview-retry"
                    onClick={() => images.retry(it.clientId)}
                  >
                    Thử lại
                  </button>
                )}
                <button
                  type="button"
                  className="rfq-msg-composer__preview-remove"
                  aria-label="Xóa"
                  onClick={() => images.removeItem(it.clientId)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="rfq-msg-composer__row">
        <div className="rfq-msg-composer__media">
          <button
            type="button"
            className="rfq-msg-composer__media-btn"
            disabled={disabled || sending || !dispatchId}
            onClick={() => cameraRef.current?.click()}
            aria-label="Chụp ảnh"
          >
            <span className="rfq-msg-composer__media-icon" aria-hidden>
              📷
            </span>
          </button>
          <button
            type="button"
            className="rfq-msg-composer__media-btn"
            disabled={disabled || sending || !dispatchId}
            onClick={() => galleryRef.current?.click()}
            aria-label="Chọn ảnh"
          >
            <span className="rfq-msg-composer__media-icon" aria-hidden>
              🖼
            </span>
          </button>
        </div>
        <textarea
          ref={areaRef}
          className="rfq-msg-composer__input"
          rows={1}
          value={text}
          onChange={(e) => {
            if (e.target.value.length <= RFQ_MESSAGE_TEXT_MAX) {
              setText(e.target.value);
            }
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          aria-label="Tin nhắn"
          maxLength={RFQ_MESSAGE_TEXT_MAX}
        />
        <button
          type="submit"
          className="rfq-msg-composer__send"
          disabled={!canSend}
        >
          {sending ? "…" : sendLabel}
        </button>
      </div>

      <input
        ref={cameraRef}
        id={`${inputId}-cam`}
        type="file"
        accept={RFQ_UPLOAD_ACCEPT}
        capture="environment"
        className="rfq-upload-input-hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        id={`${inputId}-gal`}
        type="file"
        accept={RFQ_UPLOAD_ACCEPT}
        multiple
        className="rfq-upload-input-hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {quickReplies?.length > 0 && !disabled ? (
        <div className="rfq-msg-composer__chips">
          {quickReplies.map((label) => (
            <button
              key={label}
              type="button"
              className="rfq-msg-composer__chip"
              disabled={sending}
              onClick={() => {
                setText(label);
                areaRef.current?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {sendError && <p className="rfq-msg-composer__error">{sendError}</p>}
      {!hideHints && images.hasUploading() ? (
        <p className="rfq-msg-composer__hint muted">Đang tải…</p>
      ) : null}
    </form>
  );
}
