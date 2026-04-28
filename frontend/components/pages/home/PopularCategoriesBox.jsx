"use client";

import React, { useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";
import { fetchJsonCached } from "@/lib/clientJsonCache";

const POPULAR_URL = `${API_BASE}/filter/categories/popular`;

/**
 * Sidebar: Danh mục phổ biến — click = cùng logic chọn danh mục cột trái (không route [slug]).
 */
export default function PopularCategoriesBox({
  onCtaClick,
  selectedCategory,
  onSelectCategory,
}) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJsonCached(POPULAR_URL, { ttlMs: 21_600_000 });
        if (cancelled) return;
        setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="box box-popular-cats" aria-label="Danh mục phổ biến">
      <h4 className="sidebar-title popular-cats-title">Danh mục phổ biến</h4>
      <p className="popular-cats-hint">Theo số sản phẩm &amp; cập nhật gần đây</p>
      <div className="popular-cats-chips" role="list">
        {items.map((it) => {
          const name = it.name || "";
          if (!name) return null;
          const isActive = selectedCategory === name;
          return (
            <button
              key={`${it.categoryNorm || name}`}
              type="button"
              className={`popular-cat-chip${isActive ? " popular-cat-chip--active" : ""}`}
              role="listitem"
              aria-pressed={isActive}
              onClick={() => onSelectCategory?.(name)}
            >
              {name}
            </button>
          );
        })}
      </div>
      <a
        href="#otofine-products-start"
        className="popular-cats-cta"
        onClick={(e) => {
          e.preventDefault();
          if (typeof onCtaClick === "function") onCtaClick();
        }}
      >
        Tìm phụ tùng đúng xe ngay
      </a>
    </div>
  );
}
