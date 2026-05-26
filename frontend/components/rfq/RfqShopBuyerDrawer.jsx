"use client";

import { memo, useCallback, useEffect } from "react";
import RfqShopBuyerList from "@/components/rfq/RfqShopBuyerList";

function RfqShopBuyerDrawer({
  open,
  onClose,
  items = [],
  activeDispatchId,
  onSelectDispatch,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const handleSelect = useCallback(
    (id) => {
      onSelectDispatch?.(id);
      onClose?.();
    },
    [onSelectDispatch, onClose],
  );

  if (!items.length && !open) return null;

  return (
    <>
      <button
        type="button"
        className={`rfq-shop-drawer-backdrop ${open ? "rfq-shop-drawer-backdrop--open" : ""}`}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <div
        className={`rfq-shop-drawer ${open ? "rfq-shop-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="Chọn khách"
      >
        <div className="rfq-shop-drawer__handle" aria-hidden />
        <header className="rfq-shop-drawer__header">
          <h2 className="rfq-shop-drawer__title">Khách hỏi phụ tùng</h2>
          <button type="button" className="rfq-shop-drawer__close" onClick={onClose}>
            Đóng
          </button>
        </header>
        <div className="rfq-shop-drawer__scroll">
          <RfqShopBuyerList
            items={items}
            activeDispatchId={activeDispatchId}
            onSelect={handleSelect}
            variant="drawer"
            useLinks={false}
          />
        </div>
      </div>
    </>
  );
}

export default memo(RfqShopBuyerDrawer, (a, b) => {
  return (
    a.open === b.open &&
    a.items === b.items &&
    a.activeDispatchId === b.activeDispatchId &&
    a.onSelectDispatch === b.onSelectDispatch &&
    a.onClose === b.onClose
  );
});
