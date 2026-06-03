"use client";

import React from "react";
import Link from "next/link";
import AppImage from "@/components/common/AppImage";
import { PRODUCT_IMAGE_VARIANT } from "@/lib/media/productMediaUrl";
import { RISK_FLAG_LABELS, REJECT_REASON_LABELS } from "@/components/moderation/ModerationFilters";

export const sectionStyle = {
  background: "white",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  marginBottom: 10,
};

export const btnSecondary = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};

function similarityLabel(value) {
  if (value === "exact") return { text: "Exact match", color: "#991b1b" };
  if (value === "close") return { text: "Close match", color: "#c2410c" };
  if (value === "none") return { text: "No match", color: "#6b7280" };
  return { text: "Unknown", color: "#6b7280" };
}

function Badge({ label, color }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color, background: "#fff", border: `1px solid ${color}`, borderRadius: 999, padding: "2px 6px" }}>
      {label}
    </span>
  );
}

export function ModerationGallery({ images = [], compact = false }) {
  const [index, setIndex] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const url = images[index] || null;
  const height = compact ? 240 : 320;

  return (
    <div>
      <div
        style={{
          position: "relative",
          background: "#111827",
          borderRadius: 10,
          overflow: "hidden",
          height,
          border: "1px solid #e5e7eb",
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: `scale(${zoom})`,
              transition: "transform 0.15s ease",
              cursor: zoom > 1 ? "zoom-out" : "zoom-in",
            }}
            onClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
          />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
            No images
          </div>
        )}
        {images.length > 1 ? (
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.9)", padding: "3px 6px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
            {index + 1} / {images.length}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} style={btnSecondary}>−</button>
        <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} style={btnSecondary}>+</button>
        <button type="button" onClick={() => setZoom(1)} style={btnSecondary}>Reset</button>
        {images.length > 1 ? (
          <>
            <button type="button" disabled={index <= 0} onClick={() => { setIndex((i) => i - 1); setZoom(1); }} style={btnSecondary}>‹</button>
            <button type="button" disabled={index >= images.length - 1} onClick={() => { setIndex((i) => i + 1); setZoom(1); }} style={btnSecondary}>›</button>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>
          {images.map((img, i) => (
            <button
              key={img}
              type="button"
              onClick={() => { setIndex(i); setZoom(1); }}
              style={{
                border: i === index ? "2px solid #2563eb" : "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 0,
                width: 52,
                height: 52,
                overflow: "hidden",
                flex: "0 0 auto",
                cursor: "pointer",
              }}
            >
              <AppImage
                mode="next"
                src={img}
                variant={PRODUCT_IMAGE_VARIANT.THUMB_400}
                allowOriginalFallback={false}
                width={52}
                height={52}
                sizes="52px"
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RiskExplanationPanel({ risk }) {
  if (!risk) return null;
  const level = String(risk.priorityLevel || "LOW").toUpperCase();
  const levelColor = level === "CRITICAL" ? "#991b1b" : level === "HIGH" ? "#c2410c" : level === "MEDIUM" ? "#b45309" : "#065f46";

  return (
    <div style={sectionStyle}>
      <h2 style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}>Risk breakdown</h2>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: levelColor }}>{risk.score}</div>
        <div>
          <div style={{ fontWeight: 800, color: levelColor, fontSize: 13 }}>{level}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{risk.summary}</div>
        </div>
      </div>
      {(risk.flags || []).length ? (
        (risk.flags || []).map((f) => (
          <div key={f.code} style={{ padding: 6, borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{RISK_FLAG_LABELS[f.code] || f.label || f.code}</div>
              <div style={{ opacity: 0.7 }}>{f.code} · {f.severity}</div>
            </div>
            <div style={{ fontWeight: 800 }}>+{f.weight}</div>
          </div>
        ))
      ) : (
        <div style={{ opacity: 0.65, fontSize: 12 }}>No risk flags.</div>
      )}
      {risk.rejectHistory?.contribution > 0 ? (
        <div style={{ marginTop: 8, padding: 8, background: "#fff7ed", borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>Reject history: +{risk.rejectHistory.contribution}</div>
          <div style={{ opacity: 0.8 }}>{risk.rejectHistory.count} prior rejection(s)</div>
        </div>
      ) : null}
    </div>
  );
}

export function DuplicateComparisonPanel({ current, duplicates, onOpenProduct }) {
  const all = [...(duplicates?.sameShop || []), ...(duplicates?.otherShops || [])];
  if (!all.length) {
    return (
      <div style={sectionStyle}>
        <h2 style={{ fontWeight: 800, marginBottom: 6, fontSize: 14 }}>Duplicate warnings</h2>
        <div style={{ opacity: 0.65, fontSize: 12 }}>No part-number matches found.</div>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <h2 style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}>Duplicate warnings</h2>
      {all.slice(0, 2).map((dup) => (
        <div key={dup.productId} style={{ padding: 8, border: "1px solid #fecaca", borderRadius: 8, background: "#fff1f2", marginBottom: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>
            Match #{dup.productId} {dup.similarities?.sameShop ? "(same shop)" : `(${dup.shopName})`}
          </div>
          <div>{dup.partName}</div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            <Badge label={`Part ${similarityLabel("exact").text}`} color="#991b1b" />
            <Badge label={`Price ${similarityLabel(dup.similarities?.price).text}`} color={similarityLabel(dup.similarities?.price).color} />
          </div>
          {onOpenProduct ? (
            <button type="button" onClick={() => onOpenProduct(dup.productId)} style={{ ...btnSecondary, marginTop: 6 }}>
              Open match
            </button>
          ) : (
            <Link href={`/admin/products/moderation/${dup.productId}`} style={{ display: "inline-block", marginTop: 6, fontWeight: 700 }}>
              Open match →
            </Link>
          )}
        </div>
      ))}
      {all.length > 2 ? (
        <div style={{ fontSize: 11, opacity: 0.7 }}>+{all.length - 2} more match(es)</div>
      ) : null}
    </div>
  );
}

export function ModerationTimelinePanel({ timeline }) {
  return (
    <div style={sectionStyle}>
      <h2 style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}>Moderation timeline</h2>
      {(timeline || []).length ? (
        timeline.map((ev) => (
          <div key={ev.id} style={{ padding: 8, borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>{ev.moderatorEmail || `admin#${ev.moderatorAdminId || "-"}`}</div>
            <div>
              {new Date(ev.createdAt).toLocaleString()} — {ev.oldStatus || "—"} → {ev.newStatus || "—"}
            </div>
            {ev.rejectReason ? <div style={{ color: "#991b1b" }}>Reason: {REJECT_REASON_LABELS[ev.rejectReason] || ev.rejectReason}</div> : null}
            {ev.notes ? <div style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>{ev.notes}</div> : null}
          </div>
        ))
      ) : (
        <div style={{ opacity: 0.65, fontSize: 12 }}>No moderation events yet.</div>
      )}
    </div>
  );
}

export function ProductInfoPanel({ product, shop }) {
  return (
    <>
      <div style={sectionStyle}>
        <h2 style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}>Product info</h2>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>Status: <strong>{product.moderationStatus}</strong></div>
          <div>Part number: <strong>{product.partNumber || "—"}</strong></div>
          <div>Price: <strong>{product.price != null ? Number(product.price).toLocaleString() : "—"}</strong></div>
          <div>Stock: <strong>{product.stock ?? "—"}</strong></div>
          <div>Images: <strong>{product.imageCount ?? 0}</strong></div>
          <div>Created: <strong>{product.createdAt ? new Date(product.createdAt).toLocaleString() : "—"}</strong></div>
        </div>
        {product.description ? (
          <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.9 }}>{product.description}</div>
        ) : null}
      </div>
      <div style={sectionStyle}>
        <h2 style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}>Shop info</h2>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{shop?.name}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Public: {shop?.publicStatus || "—"}</div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Pending {shop?.moderation?.pending ?? 0} · Approved {shop?.moderation?.approved ?? 0} · Rejected {shop?.moderation?.rejected ?? 0}
        </div>
        {shop?.id ? (
          <Link href={`/admin/shops/${shop.id}/governance`} style={{ display: "inline-block", marginTop: 6, fontWeight: 700, fontSize: 12 }}>
            Shop governance →
          </Link>
        ) : null}
      </div>
    </>
  );
}

export function ModerationDetailSkeleton() {
  return (
    <div style={{ padding: 12 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: 72, background: "linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%)", backgroundSize: "200% 100%", animation: "modSkel 1.2s ease infinite", borderRadius: 8, marginBottom: 10 }} />
      ))}
      <style>{`@keyframes modSkel { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

export function ModerationDetailContent({ data, compact = false, onOpenProduct }) {
  if (!data) return null;
  const { product, shop, risk, timeline, duplicates } = data;

  return (
    <div>
      <div style={sectionStyle}>
        <h2 style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}>Images</h2>
        <ModerationGallery images={product.images || []} compact={compact} />
      </div>
      <ProductInfoPanel product={product} shop={shop} />
      <RiskExplanationPanel risk={risk} />
      <DuplicateComparisonPanel current={product} duplicates={duplicates} onOpenProduct={onOpenProduct} />
      <ModerationTimelinePanel timeline={timeline} />
    </div>
  );
}
