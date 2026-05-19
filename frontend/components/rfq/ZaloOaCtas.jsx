"use client";

import { ZALO_OA_URL } from "@/lib/config";
import { emitOaFollowClick, openZaloOaUrl } from "@/lib/rfqZaloOaUx";

/**
 * Zalo OA CTAs — scoped dưới `.rfq-scope` (rfq/layout) hoặc Tailwind (shop register).
 */

/** rfq/success — trong layout RFQ (scoped CSS) */
export function ZaloOaCardRfqSuccess() {
  return (
    <section className="rfq-oa-card rfq-oa-card--spread" aria-label="Nhận báo giá Zalo">
      {/* TODO: future OA API — replacement QR asset */}
      <div className="rfq-oa-success-grid">
        <div className="rfq-oa-qr-slot" aria-hidden="true">
          <span className="rfq-oa-qr-placeholder">QR OA</span>
          <span className="muted rfq-oa-qr-hint">Thay bằng ảnh QR khi marketing cung cấp</span>
        </div>
        <div className="rfq-oa-success-copy">
          <p className="rfq-oa-card__lead rfq-oa-card__lead--nomargin">Nhận báo giá realtime qua Zalo</p>
          <p className="muted rfq-oa-micro">Giữ Otofine trên Zalo để không bỏ sót báo giá và tin mới.</p>
          <div className="rfq-oa-success-actions">
            {ZALO_OA_URL ? (
              <a
                href={ZALO_OA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rfq-oa-btn rfq-oa-btn--block rfq-oa-btn--outline"
                onClick={() => emitOaFollowClick("rfq_success")}
              >
                Mở Zalo OA
              </a>
            ) : (
              <button type="button" className="rfq-oa-btn rfq-oa-btn--block rfq-oa-btn--outline" disabled>
                Mở Zalo OA
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ZaloOaBuyerMobileStickyBar() {
  if (!ZALO_OA_URL) return null;

  return (
    <div className="rfq-oa-buyer-strip">
      <div className="rfq-oa-buyer-strip__inner">
        <p className="rfq-oa-buyer-strip__text">
          <span className="rfq-oa-buyer-strip__eyebrow">Zalo</span>
          Nhận báo giá realtime
        </p>
        <button
          type="button"
          className="rfq-oa-btn rfq-oa-btn--compact rfq-oa-btn--strip"
          onClick={() => openZaloOaUrl(ZALO_OA_URL, "buyer_token_sticky")}
        >
          Quan tâm
        </button>
      </div>
    </div>
  );
}

export function ZaloOaBuyerInlineHint() {
  if (!ZALO_OA_URL) return null;
  return (
    <p className="rfq-oa-buyer-inline-hint muted">
      <button type="button" className="rfq-oa-linklike" onClick={() => openZaloOaUrl(ZALO_OA_URL, "buyer_token_inline")}>
        Nhận cập nhật qua Zalo OA
      </button>
    </p>
  );
}

/**
 * Shop đăng ký — CTA nhẹ cuối form (Tailwind only, không global CSS từ app/components).
 * surface: shop_register
 *
 * TODO: future OA API integration
 */
export function ZaloOaShopRegisterCta() {
  const has = Boolean(ZALO_OA_URL);
  return (
    <aside
      className="mt-4 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm"
      aria-label="Zalo OA Otofine"
    >
      <p className="text-sm font-semibold text-slate-900 leading-snug mb-3">Follow OA Otofine để nhận RFQ realtime</p>
      {has ? (
        <a
          href={ZALO_OA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
          onClick={() => emitOaFollowClick("shop_register")}
        >
          Quan tâm OA
        </a>
      ) : (
        <button
          type="button"
          disabled
          className="w-full rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 cursor-not-allowed"
          title="Đặt NEXT_PUBLIC_ZALO_OA_URL"
        >
          Quan tâm OA
        </button>
      )}
    </aside>
  );
}
