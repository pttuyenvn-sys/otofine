import React, { useMemo } from "react";
import { resolveHeroWatermark } from "@/lib/listing/brandHeroWatermark";

export default function ListingHero({ pageTitle, brand = "" }) {
  const watermark = useMemo(() => resolveHeroWatermark(brand), [brand]);
  const isBrand = watermark.key !== "generic";

  return (
    <section
      className="listing-hero listing-hero--premium"
      aria-labelledby="listing-h1"
    >
      <div
        className={`listing-hero__panel listing-hero__panel--${isBrand ? "brand" : "generic"}`}
      >
        {isBrand && (
          <div
            className={`listing-hero__watermark ${watermark.className}`}
            aria-hidden="true"
          >
            <img
              src={watermark.src}
              alt=""
              className="listing-hero__watermark-img"
              decoding="async"
              draggable={false}
            />
          </div>
        )}
        <div className="listing-hero__content">
          <h1 id="listing-h1" className="listing-hero__h1">
            {pageTitle}
          </h1>

          <p className="listing-hero__sub">
            Tìm đúng phụ tùng theo xe, so sánh giá, liên hệ trực tiếp cửa hàng — minh bạch, nhanh chóng.
          </p>

          <ul className="listing-hero__badges" role="list">
            <li role="listitem">Shop xác minh</li>
            <li role="listitem">Giá rõ ràng</li>
            <li role="listitem">Hỗ trợ tìm đúng xe</li>
            <li role="listitem">Tối ưu mobile</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
