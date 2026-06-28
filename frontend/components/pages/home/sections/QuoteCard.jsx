import React from "react";

export default function QuoteCard() {
  return (
    <div className="of-request-card of-request-card--compact">
      <div className="of-request-head">
        <h4 className="of-request-title">Nhận báo giá từ nhiều shop</h4>
        <p className="of-request-subtitle">
          Gửi yêu cầu một lần, nhiều shop phản hồi giá.
        </p>
      </div>

      <button
        type="button"
        className="of-request-submit of-request-submit--large"
        onClick={() => {
          try {
            window.location.href = "/rfq/new";
          } catch { /* noop */ }
        }}
      >
        Gửi yêu cầu báo giá
      </button>

      <ul className="of-request-trust of-request-trust--compact">
        <li>✓ Phản hồi nhanh</li>
        <li>✓ Chat trực tiếp với shop</li>
        <li>✓ Gửi ảnh trong cuộc trò chuyện</li>
      </ul>
    </div>
  );
}

