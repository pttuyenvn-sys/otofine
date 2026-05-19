"use client";

import React, {
  useMemo,
  useCallback,
  useEffect,
  useState,
  memo,
} from "react";
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
  const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth <= 768);
      };

      checkMobile();

      window.addEventListener("resize", checkMobile);

      return () => {
        window.removeEventListener("resize", checkMobile);
      };
    }, []);
  
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
          {isMobile && (
            <>
              <div className="of-product__meta">
                {item.partNumber && (
                  <span className="of-product__code">{item.partNumber}</span>
                )}
                {item.origin && (
                  <span className="of-product__origin">{item.origin}</span>
                )}
              </div>

              <div className="of-product__meta of-product__meta--l3">
                {item.shopName && (
                  <span className="of-product__shop">{item.shopName}</span>
                )}

                {item.provinceName && (
                  <span className="of-product__location">{item.provinceName}</span>
                )}

                <span className="of-product__stock">Còn hàng</span>
              </div>
            </>
          )}
          <div className="of-product__side-cta">
            <button
              type="button"
              className="of-product__cta of-product__cta--call"
              onClick={onPhone}
            >
              <FiPhoneCall className="of-product__phone-ic" aria-hidden />
              Gọi báo giá
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export const HomeProductCard = memo(HomeProductCardComponent, areEqual);
