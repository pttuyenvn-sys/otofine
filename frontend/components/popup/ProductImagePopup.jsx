"use client";

import React, { useEffect, useState } from "react";
import axiosClient from "@/api/axiosClient";
import { buildProductImageAlt } from "@/lib/seo/buildProductImageAlt";
import { productImageDimensionProps } from "@/lib/image/productImageDimensions";
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

    let cancelled = false;
    axiosClient
      .get(`/product/${product.id}`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        const raw = Array.isArray(data?.images) ? data.images : [];
        const fixed = raw.map((img) => ({
          ...img,
          url: (img.url || img.image || img.ImageURL || "") + "?v=" + Date.now(),
        }));
        setImages(fixed);
      })
      .catch((err) => {
        if (!cancelled) console.error("Load image error:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [show, product]);

  if (!show) return null;

  const productImageAlt = buildProductImageAlt(product);

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
                    alt={productImageAlt}
                    className={`p-main-img ${fade ? "fade" : ""}`}
                    {...productImageDimensionProps({
                      src: getUrl(images[index]),
                      layout: "pdp-main",
                    })}
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
                    <img
                      src={getUrl(img)}
                      alt={productImageAlt}
                      className="p-thumb"
                      {...productImageDimensionProps({ src: getUrl(img), layout: "pdp-thumb" })}
                    />
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

                try {
                  await axiosClient.delete(`/products/${product.ProductID}/images`, { data: { key } });
                } catch (e) {
                  console.error("Delete image error:", e);
                }

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
