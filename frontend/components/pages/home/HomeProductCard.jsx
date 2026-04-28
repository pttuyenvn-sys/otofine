"use client";

import React, { useMemo, useCallback, memo } from "react";
import { FiPhoneCall } from "react-icons/fi";
import Link from "next/link";
import { getProductDetailHref } from "@/lib/productDetailHref";
import { ProductCardImage } from "./HomeImages";

function areEqual(prev, next) {
  if (prev.index !== next.index) return false;
  const a = prev.item;
  const b = next.item;
  return (
    a.id === b.id &&
    a.slug === b.slug &&
    a.shortDescription === b.shortDescription &&
    a.priceText === b.priceText &&
    a.partNumber === b.partNumber &&
    a.subtitleLine1 === b.subtitleLine1 &&
    a.subtitleLine2 === b.subtitleLine2 &&
    JSON.stringify(a.cardHighlights || []) ===
      JSON.stringify(b.cardHighlights || []) &&
    a.summary === b.summary &&
    a.image === b.image &&
    a.phone === b.phone &&
    a.shopName === b.shopName &&
    a.provinceName === b.provinceName &&
    a.origin === b.origin
  );
}

function getCardHighlights(item) {
  if (Array.isArray(item.cardHighlights) && item.cardHighlights.length > 0) {
    return item.cardHighlights.slice(0, 3);
  }
  const lines = String(item.summary || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.slice(0, 3);
}

function HomeProductCardComponent({ item, index, onSelectPhone }) {
  const href = useMemo(
    () => getProductDetailHref(item),
    [item.slug, item.id],
  );

  const onPhone = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelectPhone(item.phone);
    },
    [onSelectPhone, item.phone],
  );

  return (
    <article className="of-product of-product--row">
      <div className="of-product__row-inner">
        <Link
          href={href}
          className="of-product__main-link"
          prefetch={index < 6}
          aria-labelledby={`of-p-title-${item.id}`}
        >
          <div className="of-product__media of-product__media--row">
            <div className="of-product__media-placeholder" aria-hidden>
              <span className="of-product__ph-icon" aria-hidden>
                🖼️
              </span>
            </div>
            <ProductCardImage
              src={item.image}
              alt={item.shortDescription || "Phụ tùng ô tô"}
              sizes="(max-width: 640px) 100vw, 200px"
              priority={index < 2}
            />
          </div>
          <div className="of-product__body of-product__body--row">
            <h3 id={`of-p-title-${item.id}`} className="of-product__title">
              {item.shortDescription}
            </h3>
            {(() => {
              const rows = getCardHighlights(item);
              if (rows.length === 0) return null;
              return (
                <div
                  className="of-product__highlights"
                  aria-label="Điểm nổi bật sản phẩm"
                >
                  {rows.map((line, i) => (
                    <p
                      key={`${item.id}-h-${i}`}
                      className={
                        i === 0
                          ? "of-product__highlight of-product__highlight--r1"
                          : i === 1
                            ? "of-product__highlight of-product__highlight--r2"
                            : "of-product__highlight of-product__highlight--r3"
                      }
                    >
                      {line}
                    </p>
                  ))}
                </div>
              );
            })()}
          </div>
        </Link>
        <div className="of-product__side">
          <p className="of-product__price" aria-label={`Giá ${item.priceText}`}>
            {item.priceText}
          </p>
          <div className="of-product__side-cta">
            <Link
              href={href}
              className="of-product__cta of-product__cta--detail"
              prefetch={index < 4}
            >
              Xem SP
            </Link>
            <button
              type="button"
              className="of-product__cta of-product__cta--call"
              onClick={onPhone}
            >
              <FiPhoneCall className="of-product__phone-ic" aria-hidden />
              Gọi báo giá
            </button>
            <button
              type="button"
              className="of-product__cta of-product__cta--zalo of-product__cta--ghost"
              onClick={onPhone}
            >
              Liên hệ ngay
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export const HomeProductCard = memo(HomeProductCardComponent, areEqual);
