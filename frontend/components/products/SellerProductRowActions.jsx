"use client";

import { memo, useEffect, useRef, useState } from "react";
import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

function siteOrigin() {
  if (typeof window === "undefined") return "https://otofine.com";
  return window.location.origin.replace(/\/$/, "");
}

function SellerProductRowActions({
  product,
  onEdit,
  onDelete,
  onResubmit,
  resubmitting = false,
  layout = "inline",
}) {
  const isRejected = product?.sellerLifecycle === "rejected";
  const showResubmit = isRejected && onResubmit;
  const [menuOpen, setMenuOpen] = useState(false);
  const dockRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handleOutside(e) {
      if (dockRef.current && !dockRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [menuOpen]);

  function handleView(e) {
    e?.stopPropagation?.();
    try {
      const path = buildProductSeoUrl({
        id: product.id,
        partName: product.partName,
        partNumber: product.partNumber,
        ...(product.cars?.[0] || {}),
      });
      const url = path.startsWith("http") ? path : siteOrigin() + path;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      onEdit?.(product);
    }
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  const cls =
    layout === "stack"
      ? "seller-dash-actions seller-dash-actions--stack"
      : layout === "dock"
        ? "seller-dash-actions seller-dash-actions--dock"
        : "seller-dash-actions";

  if (layout === "dock") {
    return (
      <div className={cls} ref={dockRef} role="group" aria-label="Thao tác sản phẩm">
        <button
          type="button"
          className="seller-dash-action-dock"
          onClick={() => onEdit?.(product)}
          aria-label="Sửa sản phẩm"
          title="Sửa"
        >
          ✏
        </button>
        <button
          type="button"
          className="seller-dash-action-dock"
          onClick={handleView}
          aria-label="Xem trên marketplace"
          title="Xem"
        >
          👁
        </button>
        <div className="seller-dash-action-dock-menu-wrap">
          <button
            type="button"
            className="seller-dash-action-dock seller-dash-action-dock--more"
            aria-label="Thêm thao tác"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Thêm"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="seller-dash-action-dock-menu" role="menu">
              {showResubmit ? (
                <button
                  type="button"
                  role="menuitem"
                  className="seller-dash-action-dock-menu-item seller-dash-action-dock-menu-item--warn"
                  disabled={resubmitting}
                  onClick={() => {
                    closeMenu();
                    onResubmit(product);
                  }}
                >
                  {resubmitting ? "Đang gửi…" : "Gửi duyệt lại"}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="seller-dash-action-dock-menu-item seller-dash-action-dock-menu-item--danger"
                onClick={() => {
                  closeMenu();
                  onDelete?.(product.id);
                }}
              >
                Ẩn
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cls}>
      <button type="button" className="seller-dash-action" onClick={() => onEdit?.(product)}>
        <span aria-hidden>✏</span> Sửa
      </button>
      <button type="button" className="seller-dash-action" onClick={handleView}>
        <span aria-hidden>👁</span> Xem
      </button>
      {showResubmit ? (
        <button
          type="button"
          className="seller-dash-action seller-dash-action--warn"
          disabled={resubmitting}
          onClick={() => onResubmit(product)}
        >
          <span aria-hidden>📤</span> {resubmitting ? "Đang gửi…" : "Gửi duyệt lại"}
        </button>
      ) : null}
      <button
        type="button"
        className="seller-dash-action seller-dash-action--danger"
        onClick={() => onDelete?.(product.id)}
      >
        <span aria-hidden>🗑</span> Ẩn
      </button>
    </div>
  );
}

export default memo(SellerProductRowActions);
