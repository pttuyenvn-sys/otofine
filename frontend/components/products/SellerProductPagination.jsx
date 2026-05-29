"use client";

import { memo, useMemo } from "react";
import { paginationRange } from "./sellerProductUi";

function SellerProductPagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  className = "",
  compact = false,
}) {
  const { from, to } = paginationRange(page, limit, total);
  const pages = useMemo(() => {
    const list = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i += 1) list.push(i);
    return list;
  }, [page, totalPages]);

  if (total <= 0) return null;

  return (
    <div className={`seller-dash-pagination ${className}`.trim()}>
      <div className="seller-dash-pagination-summary">
        Hiển thị{" "}
        <strong>
          {from.toLocaleString("vi-VN")}–{to.toLocaleString("vi-VN")}
        </strong>{" "}
        / {total.toLocaleString("vi-VN")}
      </div>

      <div className="seller-dash-pagination-controls">
        <button
          type="button"
          className="seller-dash-page-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
        >
          ‹
        </button>

        <div className="seller-dash-pagination-pages" role="navigation" aria-label="Phân trang">
          {pages[0] > 1 ? (
            <>
              <button type="button" className="seller-dash-page-btn" onClick={() => onPageChange(1)}>
                1
              </button>
              {pages[0] > 2 ? <span className="seller-dash-page-ellipsis">…</span> : null}
            </>
          ) : null}

          {pages.map((p) => (
            <button
              key={p}
              type="button"
              className={`seller-dash-page-btn${p === page ? " is-active" : ""}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ))}

          {pages[pages.length - 1] < totalPages ? (
            <>
              {pages[pages.length - 1] < totalPages - 1 ? (
                <span className="seller-dash-page-ellipsis">…</span>
              ) : null}
              <button
                type="button"
                className="seller-dash-page-btn"
                onClick={() => onPageChange(totalPages)}
              >
                {totalPages}
              </button>
            </>
          ) : null}
        </div>

        <button
          type="button"
          className="seller-dash-page-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang sau"
        >
          ›
        </button>
      </div>

      {!compact && onLimitChange ? (
        <select
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="seller-dash-pagination-limit"
          aria-label="Số dòng mỗi trang"
        >
          <option value={20}>20/trang</option>
          <option value={50}>50/trang</option>
          <option value={100}>100/trang</option>
        </select>
      ) : null}
    </div>
  );
}

export default memo(SellerProductPagination);
