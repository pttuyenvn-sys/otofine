import React from "react";
import Link from "next/link";
import { HomeProductCard } from "@/components/pages/home/HomeProductCard";

export default function ProductGridWrapper({
  keyword,
  listError,
  listBootstrapping,
  products,
  totalPages,
  page,
  setPage,
  startTransition,
  navigateToState,
  setKeyword,
  scrollProductsIntoView,
  setContactPhone,
}) {
  return (
    <>
      {keyword && (
        <div style={{ marginBottom: 12, fontWeight: 600 }}>
          Kết quả tìm kiếm cho: "{keyword}"
        </div>
      )}

      <div className="center of-product-list">
        {!listError && !listBootstrapping && products.length === 0 ? (
          <div className="of-empty-state" style={{ padding: "24px 16px", textAlign: "center" }}>
            <p style={{ color: "#374151", fontWeight: 600, fontSize: 15, margin: "0 0 8px" }}>
              Chưa có sản phẩm phù hợp với bộ lọc hiện tại
            </p>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 16px" }}>
              Thử bỏ bớt bộ lọc hoặc chọn danh mục khác để xem thêm kết quả.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {["Má phanh", "Đèn pha", "Lọc gió", "Bơm nước", "Gương chiếu hậu"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="of-btn of-btn--ghost"
                  style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb", color: "#1f2937", cursor: "pointer" }}
                  onClick={() => {
                    startTransition(() => {
                      navigateToState({ category: cat });
                      setKeyword("");
                      setPage(1);
                    });
                  }}
                >
                  {cat} ô tô
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {listBootstrapping && products.length === 0 && !listError
          ? Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="of-product of-product--skeleton"
              aria-hidden
            />
          ))
          : null}

        {products.map((item, index) => (
          <HomeProductCard
            key={item.id}
            item={item}
            index={index}
            onSelectPhone={setContactPhone}
          />
        ))}
      </div>

      {!listError &&
        !listBootstrapping &&
        products.length > 0 &&
        totalPages > 1 && (
          <nav
            className="pagination product-pagination"
            aria-label="Phân trang sản phẩm"
          >
            <button
              type="button"
              className="page-btn page-btn-nav"
              disabled={page <= 1}
              aria-label="Trang trước"
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                scrollProductsIntoView();
              }}
            >
              &lt;
            </button>
            {(() => {
              const total = totalPages;
              const current = page;
              const maxBtns = 5;
              let start = Math.max(1, current - Math.floor(maxBtns / 2));
              let end = Math.min(total, start + maxBtns - 1);
              start = Math.max(1, end - maxBtns + 1);
              const nums = [];
              for (let i = start; i <= end; i += 1) nums.push(i);
              return nums.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`page-btn${n === page ? " active" : ""}`}
                  aria-current={n === page ? "page" : undefined}
                  onClick={() => {
                    setPage(n);
                    scrollProductsIntoView();
                  }}
                >
                  {n}
                </button>
              ));
            })()}
            <button
              type="button"
              className="page-btn page-btn-nav"
              disabled={page >= totalPages}
              aria-label="Trang sau"
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
                scrollProductsIntoView();
              }}
            >
              &gt;
            </button>
          </nav>
        )}
    </>
  );
}

