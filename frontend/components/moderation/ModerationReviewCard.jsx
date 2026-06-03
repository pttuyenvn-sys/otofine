import React, { useState } from "react";
import AppImage from "@/components/common/AppImage";
import { PRODUCT_IMAGE_VARIANT } from "@/lib/media/productMediaUrl";

export default function ModerationReviewCard({ product, onApprove, onReject, onNext, onPrev, onClose }) {
  const imgs = product?.images || (product?.thumbnailUrl ? [product.thumbnailUrl] : []);
  const [index, setIndex] = useState(0);

  if (!product) return null;

  return (
    <aside style={{ position: "sticky", top: 16, width: 420, padding: 16, background: "white", border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 800 }}>{product.partName || `#${product.id}`}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{product.shopName || `shop#${product.shopId}`}</div>
      </div>

      <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb", marginBottom: 8 }}>
        {imgs.length ? (
          <div style={{ position: "relative", background: "#000", height: 300 }}>
            <AppImage
              mode="next"
              src={imgs[index]}
              variant={PRODUCT_IMAGE_VARIANT.THUMB_400}
              allowOriginalFallback={false}
              width={420}
              height={300}
              sizes="420px"
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
            {imgs.length > 1 && (
              <div style={{ position: "absolute", left: 8, top: 8, background: "rgba(255,255,255,0.85)", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>
                {index + 1}/{imgs.length}
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>No image</div>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Price: <strong>{product.price != null ? Number(product.price).toLocaleString() : "-"}</strong></div>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Stock: <strong>{product.stock != null ? product.stock : "-"}</strong></div>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Images: <strong>{product.imageCount || imgs.length || 0}</strong></div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Risk</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(product.riskFlags || []).map((f, idx) => (
            <div key={idx} style={{ padding: "6px 8px", borderRadius: 8, background: "#fff1f2", fontWeight: 700, fontSize: 12 }}>
              {f.code} ({f.severity})
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 12, display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" onClick={onPrev} style={{ flex: "0 0 auto", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff" }}>‹ Prev</button>
        <button type="button" onClick={() => onApprove && onApprove(product.id)} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "#059669", color: "white", fontWeight: 800 }}>Approve (A)</button>
        <button type="button" onClick={() => onReject && onReject(product.id)} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "#dc2626", color: "white", fontWeight: 800 }}>Reject (R)</button>
        <button type="button" onClick={onNext} style={{ flex: "0 0 auto", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff" }}>Next ›</button>
      </div>
    </aside>
  );
}

