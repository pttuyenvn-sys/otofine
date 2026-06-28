"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ShopImage from "@/components/shopsite/ShopImage";
import { API_BASE } from "@/lib/config";
import { fetchJsonCached } from "@/lib/clientJsonCache";
import { buildShopStorefrontUrl } from "@/lib/shopsite/buildShopStorefrontUrl";

const SHOP_LIMIT = 5;

function formatProductCount(n) {
  const v = Number(n) || 0;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(v);
}

function shopBrandLabel(shop, brandFilter) {
  if (brandFilter) return brandFilter;
  return shop?.topBrands?.[0]?.brand || null;
}

function buildMetaLine(shop, brandFilter) {
  const brandLabel = shopBrandLabel(shop, brandFilter);
  const parts = [];
  if (brandLabel) parts.push(`Shop chuyên ${brandLabel}`);
  if (shop.productCount > 0) {
    parts.push(`${formatProductCount(shop.productCount)} SP`);
  }
  return parts.join(" • ");
}

function ShopAvatar({ shop }) {
  const fallback = (
    <span className="of-shop-rec__avatar-fallback" aria-hidden>
      🛒
    </span>
  );

  if (!shop?.avatar) {
    return <div className="of-shop-rec__avatar of-shop-rec__avatar--empty">{fallback}</div>;
  }

  return (
    <div className="of-shop-rec__avatar">
      <ShopImage
        src={shop.avatar}
        alt=""
        className="of-shop-rec__avatar-img"
        fallback={fallback}
        fallbackClassName="of-shop-rec__avatar of-shop-rec__avatar--empty"
      />
    </div>
  );
}

export default function ShopRecommendRail({ brand = "" }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      perPage: String(SHOP_LIMIT),
      sort: "rank",
      page: "1",
    });
    if (brand) params.set("brand", brand);

    const url = `${API_BASE}/public/shops?${params.toString()}`;
    setLoading(true);

    fetchJsonCached(url, { ttlMs: 120_000 })
      .then((data) => {
        if (cancelled) return;
        let items = Array.isArray(data?.items)
          ? data.items.slice(0, SHOP_LIMIT)
          : [];
        if (!brand) {
          items = [...items].sort(
            (a, b) => (Number(b.productCount) || 0) - (Number(a.productCount) || 0),
          );
        }
        setShops(items);
      })
      .catch(() => {
        if (!cancelled) setShops([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brand]);

  if (!loading && shops.length === 0) return null;

  const directoryHref = brand
    ? `/shops?brand=${encodeURIComponent(brand)}`
    : "/shops";

  return (
    <div className="right-section right-section--shops of-shop-rec" aria-label="Shop phù hợp">
      <h4 className="of-rail-card__h of-shop-rec__title">SHOP PHÙ HỢP</h4>

      {loading ? (
        <p className="of-shop-rec__loading">Đang tải…</p>
      ) : (
        <ul className="of-shop-rec__list" role="list">
          {shops.map((shop) => {
            const storefrontHref = buildShopStorefrontUrl(shop.slug);
            const metaLine = buildMetaLine(shop, brand);

            const cardBody = (
              <>
                <ShopAvatar shop={shop} />
                <div className="of-shop-rec__body">
                  <p className="of-shop-rec__name">{shop.name}</p>
                  <p className="of-shop-rec__meta-row">
                    <span className="of-shop-rec__meta">{metaLine || shop.name}</span>
                    {shop.verified ? (
                      <span className="of-shop-rec__star" aria-label="Shop xác minh">
                        ⭐
                      </span>
                    ) : null}
                  </p>
                </div>
              </>
            );

            return (
              <li key={shop.slug} className="of-shop-rec__item">
                {storefrontHref ? (
                  <a href={storefrontHref} className="of-shop-rec__card">
                    {cardBody}
                  </a>
                ) : (
                  <div className="of-shop-rec__card of-shop-rec__card--static">
                    {cardBody}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && shops.length > 0 ? (
        <Link href={directoryHref} className="of-rail-more" prefetch={false}>
          Xem thêm →
        </Link>
      ) : null}
    </div>
  );
}
