"use client";

import React, { useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";
import "./ProductImagePopup.css";

export default function ProductImagePopup({
  show,
  onClose,
  product,
  openAddImagePopup,
}) {
  const [images, setImages] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fade, setFade] = useState(false);

  // Load ảnh khi mở popup (cùng API chi tiết SP)
  useEffect(() => {
    if (!show) {
      setImages([]);
      setIndex(0);
      return;
    }

    if (!product?.id) return;

    setLoading(true);

    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/product/${product.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        const raw = Array.isArray(data?.images) ? data.images : [];
        const fixed = raw.map((img) => ({
          ...img,
          url: (img.url || img.image || img.ImageURL || "") + "?v=" + Date.now(),
        }));
        setImages(fixed);
      })
      .catch((err) => console.error("Load image error:", err))
      .finally(() => setLoading(false));
  }, [show, product]);

  if (!show) return null;

  // KHÔNG ép reload khi chuyển ảnh → slider mượt
  const getUrl = (img) => img?.url || img?.image || img?.ImageURL || "";

  const prev = () => {
    if (!images.length) return;
    animateChange();
    setIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  };

  const next = () => {
    if (!images.length) return;
    animateChange();
    setIndex((i) => (i === images.length - 1 ? 0 : i + 1));
  };

  // Tạo hiệu ứng fade nhanh 150ms
  const animateChange = () => {
    setFade(true);
    setTimeout(() => setFade(false), 150);
  };

  return (
    <div className="p-modal-overlay" onClick={onClose}>
      <div
        className="p-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-header">
          <h3>Ảnh của {product?.partNumber || product?.PartNumber || "-"}</h3>
          <button className="p-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-body">
          {loading ? (
            <div className="p-loading">Đang tải ảnh...</div>
          ) : images.length === 0 ? (
            <div className="p-no-image">Không có ảnh</div>
          ) : (
            <>
              {/* Image viewer */}
              <div className="p-image-stage">
                <button className="p-nav left" onClick={prev}>
                  ‹
                </button>

                <div className="p-image-frame">
                  <img
                    key={index}
                    src={getUrl(images[index])}
                    alt="Ảnh lớn"
                    className={`p-main-img ${fade ? "fade" : ""}`}
                    onError={(e) => (e.currentTarget.style.opacity = 0.4)}
                  />
                </div>

                <button className="p-nav right" onClick={next}>
                  ›
                </button>
              </div>

              {/* Thumbnails */}
              <div className="p-thumbs">
                {images.map((img, i) => (
                  <button
                    key={i}
                    className={`p-thumb-btn ${i === index ? "active" : ""}`}
                    onClick={() => {
                      animateChange();
                      setIndex(i);
                    }}
                  >
                    <img src={getUrl(img)} alt="thumb" className="p-thumb" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-footer">
          {/* NÚT XÓA ẢNH */}
          {images.length > 0 && (
            <button
              className="pip-btn danger"
              onClick={async () => {
                const img = images[index];
                if (!window.confirm("Bạn có chắc muốn xóa ảnh này?")) return;

                // Tách KEY từ URL
                const key = img.url.split("/").pop().split("?")[0];

                await fetch(
                  `http://localhost:3001/products/${product.ProductID}/images`,
                  {
                    method: "DELETE",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                    body: JSON.stringify({ key }),
                  }
                );

                // Cập nhật danh sách ảnh trong UI
                const newImages = images.filter((_, i) => i !== index);
                setImages(newImages);

                if (newImages.length === 0) setIndex(0);
                else if (index >= newImages.length)
                  setIndex(newImages.length - 1);
              }}
            >
              Xóa ảnh này
            </button>
          )}

          {/* Nút Thêm ảnh */}
          <button
            className="pip-btn"
            onClick={() => {
              onClose();
              setTimeout(() => openAddImagePopup(product), 200);
            }}
          >
            Thêm ảnh
          </button>

          {/* Nút đóng */}
          <button className="p-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
