"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RFQ_MESSAGE_TEXT_MAX } from "@/lib/rfq/rfqConversationConstants";

/**
 * Text-only composer — no images, no realtime typing indicators.
 * Parent handles POST; websocket/unread deferred.
 */
export default function RfqMessageComposer({
  onSend,
  disabled = false,
  placeholder = "Nhập tin nhắn…",
  sendLabel = "Gửi",
  className = "",
  sticky = false,
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const areaRef = useRef(null);

  const trimmed = text.trim();
  const canSend = !disabled && !sending && trimmed.length > 0;

  const resize = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 160);
    el.style.height = `${Math.max(44, next)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setSendError("");
    try {
      await onSend(trimmed);
      setText("");
      if (areaRef.current) areaRef.current.style.height = "44px";
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

  return (
    <form
      className={`rfq-msg-composer ${sticky ? "rfq-msg-composer--sticky" : ""} ${className}`.trim()}
      onSubmit={handleSubmit}
    >
      <div className="rfq-msg-composer__row">
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
          className="rfq-btn rfq-btn--primary rfq-msg-composer__send"
          disabled={!canSend}
        >
          {sending ? "…" : sendLabel}
        </button>
      </div>
      {sendError && <p className="rfq-msg-composer__error">{sendError}</p>}
      <p className="rfq-msg-composer__hint muted">
        Enter gửi · Shift+Enter xuống dòng · Tối đa {RFQ_MESSAGE_TEXT_MAX} ký tự
      </p>
    </form>
  );
}
