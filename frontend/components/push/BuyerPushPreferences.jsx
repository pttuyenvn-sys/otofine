"use client";

import { useEffect, useState } from "react";
import {
  getBuyerPushPreferences,
  saveBuyerPushPreferences,
} from "@/lib/rfq/rfqPushPreferences";
import { tryRegisterBuyerHistoryPush } from "@/lib/rfqPushRegister";

export default function BuyerPushPreferences({ onChange }) {
  const [prefs, setPrefs] = useState(getBuyerPushPreferences);

  useEffect(() => {
    setPrefs(getBuyerPushPreferences());
  }, []);

  function update(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveBuyerPushPreferences(next);
    onChange?.(next);
    void tryRegisterBuyerHistoryPush();
  }

  return (
    <div className="rfq-push-prefs" aria-label="Tùy chọn thông báo">
      <p className="rfq-push-prefs__label muted">Thông báo</p>
      <ul className="rfq-push-prefs__list">
        <li className="rfq-push-prefs__item">
          <label className="rfq-push-prefs__row">
            <input
              type="checkbox"
              checked={prefs.messages}
              onChange={(e) => update("messages", e.target.checked)}
            />
            <span className="rfq-push-prefs__text">Tin nhắn từ cửa hàng</span>
          </label>
        </li>
        <li className="rfq-push-prefs__item">
          <label className="rfq-push-prefs__row">
            <input
              type="checkbox"
              checked={prefs.quotes}
              onChange={(e) => update("quotes", e.target.checked)}
            />
            <span className="rfq-push-prefs__text">Báo giá mới</span>
          </label>
        </li>
        <li className="rfq-push-prefs__item">
          <label className="rfq-push-prefs__row">
            <input
              type="checkbox"
              checked={prefs.reminders}
              onChange={(e) => update("reminders", e.target.checked)}
            />
            <span className="rfq-push-prefs__text">Nhắc nhở yêu cầu</span>
          </label>
        </li>
      </ul>
    </div>
  );
}
