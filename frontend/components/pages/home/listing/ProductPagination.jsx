import React from "react";

export default function ProductPagination({
  listError,
  listBootstrapping,
  products,
  totalPages,
  page,
  setPage,
  scrollProductsIntoView,
}) {
  if (listError || listBootstrapping || products.length === 0 || totalPages <= 1) {
    return null;
  }

  return (
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
  );
}
