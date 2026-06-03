"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { API_BASE, API_ORIGIN } from "@/lib/config";
import { getProductDetailHref } from "@/lib/productDetailHref";
import { traceRenderedProductHref } from "@/lib/marketplace/marketplaceHrefTrace";
import {
  formatMarketplaceVehicleLabel,
  isEmptyMarketplaceContext,
  parseMarketplaceContextFromQuery,
  readListingSessionMarketplaceContext,
  resolveActiveMarketplaceContext,
  resolveListingBackHref,
  carMatchesMarketplaceContext,
} from "@/lib/marketplace/marketplaceContext";
import { extractProductIdFromSeoSlug } from "@/lib/seo/productSeoUrl";
import {
  RECENT_VIEWED_KEY,
  pushRecentlyViewed,
  readRecentlyViewed,
  excludeCurrent,
} from "@/lib/shopsite/recentlyViewed";
import ShopQuickRfqLauncher from "@/components/shopsite/ShopQuickRfqLauncher";
import AppImage from "@/components/common/AppImage";
import { rewriteLegacyThumbUrlsInHtml } from "@/lib/media/productMediaUrl";
import ListingProductImage from "@/components/common/ListingProductImage";
import "./ProductDetail.css";

const stripHtml = (html = "") =>
  String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasContent = (html = "") => {
  const clean = String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, "")
    .trim();

  return clean.length > 0;
};

const getCategoryName = (text = "") => {
  const clean = stripHtml(text);
  return clean.split(" ").slice(0, 3).join(" ");
};

const formatPrice = (value) => {
  if (value === null || value === undefined || value === "") return "Liên hệ";

  const number = Number(value);

  if (isNaN(number)) return String(value);

  return number.toLocaleString("vi-VN") + " ₫";
};

const digitsOnly = (s) => String(s ?? "").replace(/\D/g, "");

function PdMiniCardImage({ src }) {
  return (
    <ListingProductImage
      slot="grid"
      fill
      src={src || null}
      alt=""
      className="object-cover w-full h-full"
    />
  );
}

/**
 * Open the storefront Quick-RFQ modal pre-filled with the current
 * product + first matching fitment. The modal lives at the storefront
 * layout level (`ShopQuickRfqLauncher`) and listens for the
 * `shopsite:openQuickRfq` CustomEvent so this product detail page
 * doesn't have to own a second copy.
 *
 * On the apex product detail route (`/<slug>-<id>`) the launcher is
 * NOT mounted (only the shopsite layout mounts it). In that case the
 * event has no listener — we fall back to the existing `/rfq/new`
 * page so the buyer still has a path to send a request, with the
 * product context carried in the URL.
 *
 * Detection: we wait one tick after dispatching the event; if the
 * page is still here AND we're not under the shopsite layout (no
 * `[data-shopsite-rfq-mount]` marker), we navigate.
 */
function openQuickRfqWithProduct(product, activeContext) {
  if (typeof window === "undefined") return;
  const title = (product?.shortDescription || product?.partName || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const brand = activeContext?.brand || "";
  const model = activeContext?.model || "";
  const yr =
    activeContext?.year != null && activeContext?.year !== ""
      ? String(activeContext.year)
      : "";
  const detail = {
    source: "product_detail_cta",
    productId: product?.id || null,
    part: title || product?.partNumber || "",
    brand,
    model,
    year: yr ? String(yr) : "",
    vehicle: [brand, model, yr].filter(Boolean).join(" "),
  };
  let delivered = false;
  function markDelivered() { delivered = true; }
  window.addEventListener("shopsite:openQuickRfq:ack", markDelivered, {
    once: true,
  });
  try {
    window.dispatchEvent(new CustomEvent("shopsite:openQuickRfq", { detail }));
  } catch {/* old WebView */}
  setTimeout(() => {
    window.removeEventListener("shopsite:openQuickRfq:ack", markDelivered);
    // Apex fallback — no launcher on this route. Navigate to /rfq/new
    // and let the universal RFQ form handle it. We don't need to
    // verify "mounted" — if the launcher was present it would have
    // popped open by now and the buyer's already in the modal.
    if (!delivered && !document.querySelector("[data-shopsite-rfq-mount]")) {
      const q = new URLSearchParams();
      if (detail.part) q.set("part", detail.part);
      if (detail.brand) q.set("brand", detail.brand);
      if (detail.model) q.set("model", detail.model);
      if (detail.year) q.set("year", detail.year);
      window.location.href = `/rfq/new${q.toString() ? `?${q.toString()}` : ""}`;
    }
  }, 80);
}

function productHref(slug, id, item, marketplaceContext, src = "related") {
  if (item && typeof item === "object") {
    const url = getProductDetailHref(
      item,
      marketplaceContext && !isEmptyMarketplaceContext(marketplaceContext)
        ? { marketplaceContext }
        : {},
    );
    if (url && url !== "/") {
      return traceRenderedProductHref({
        src,
        href: url,
        item,
        marketplaceContext,
      });
    }
  }
  if (id != null && id !== "") return `/p/${id}`;
  return "/";
}

function isCurrentListEntry(entry, param) {
  if (!entry) return false;
  const p = String(param ?? "").trim();
  if (!p) return false;
  if (String(entry.id) === p) return true;
  if (entry.slug != null && String(entry.slug) === p) return true;
  return false;
}

function PdNavChevronLeft() {
  return (
    <svg
      className="pd-hc__nav-svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59z"
      />
    </svg>
  );
}

function PdNavChevronRight() {
  return (
    <svg
      className="pd-hc__nav-svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
      />
    </svg>
  );
}

/**
 * 1 hàng, scroll-snap, wheel ngang, nút prev/next + thanh cuộn dưới (mọi kích thước).
 */
function PdHorizCarousel({ items, renderCard, variant }) {
  const scrollerRef = useRef(null);
  const [nav, setNav] = useState({ left: false, right: false });

  const updateNav = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = Math.max(0, scrollWidth - clientWidth);
    setNav({
      left: scrollLeft > 2,
      right: scrollLeft < max - 2,
    });
  }, []);

  useLayoutEffect(() => {
    updateNav();
  }, [items, updateNav]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateNav());
    ro.observe(el);
    const onScroll = () => updateNav();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [items, updateNav]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [items]);

  const doScroll = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(200, el.clientWidth * 0.75);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  if (!items || items.length === 0) return null;

  return (
    <div className={`pd-hc pd-hc--${variant}`}>
      {nav.left ? (
        <button
          type="button"
          className="pd-hc__nav pd-hc__nav--prev"
          onClick={() => doScroll(-1)}
          aria-label="Xem trước"
        >
          <PdNavChevronLeft />
        </button>
      ) : null}
      <div className="pd-hc__mask">
        <div
          className="pd-hc__viewport"
          ref={scrollerRef}
          tabIndex={0}
        >
          {items.map((it, i) => (
            <div
              className="pd-hc__cell"
              key={it.id != null ? String(it.id) : `i-${i}`}
            >
              {renderCard(it, i)}
            </div>
          ))}
        </div>
      </div>
      {nav.right ? (
        <button
          type="button"
          className="pd-hc__nav pd-hc__nav--next"
          onClick={() => doScroll(1)}
          aria-label="Xem tiếp"
        >
          <PdNavChevronRight />
        </button>
      ) : null}
    </div>
  );
}

function buildZaloUrl(shop) {
  if (!shop) return "#";
  const raw = shop.zalo != null ? String(shop.zalo).trim() : "";
  if (raw.startsWith("http")) return raw;
  if (raw) return `https://zalo.me/${digitsOnly(raw)}`;
  const p = digitsOnly(shop.phone);
  return p ? `https://zalo.me/${p}` : "#";
}

function normalizeShopAvatar(url) {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith("http")) return u;
  const base = String(API_ORIGIN || "").replace(/\/+$/, "");
  if (!base) return u.startsWith("/") ? u : `/${u}`;
  return `${base}/${u.replace(/^\/+/, "")}`;
}

export default function ProductDetail({ productId: productIdProp } = {}) {
  // Two route shapes feed this component:
  //   1. Legacy `/product/[id]` → useParams() returns { id } (this
  //      route now redirects on the server, but the param shape is
  //      preserved for any leftover client-side soft-pushes).
  //   2. Root canonical `/[slug]` (e.g. /<slug>-<id>) →
  //      useParams() returns { slug }, and the parent server page
  //      (`app/[slug]/page.js`) passes the resolved numeric id down
  //      via the `productId` prop after doing its canonical-enforce
  //      redirect.
  //
  // We accept either: an explicit prop wins (server already resolved
  // and validated the id), otherwise we peel the id out of the slug
  // ourselves so client-side navigations (history back/forward, soft
  // pushes via next/router) still work without a server round trip.
  // The slug → id parser is the same pure-string helper used by the
  // canonical-enforcement page, so there's no parser drift between
  // server and client.
  const params = useParams() || {};
  const routeId =
    productIdProp != null && productIdProp !== ""
      ? String(productIdProp)
      : params.id != null && params.id !== ""
        ? String(params.id)
        : extractProductIdFromSeoSlug(params.slug);
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionMarketplaceContext = useMemo(
    () => readListingSessionMarketplaceContext(),
    [],
  );
  const queryMarketplaceContext = useMemo(
    () => parseMarketplaceContextFromQuery(searchParams),
    [searchParams],
  );

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [mainImage, setMainImage] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  const [contactOpen, setContactOpen] = useState(false);
  const [copiedOem, setCopiedOem] = useState(false);

  const [recentViewed, setRecentViewed] = useState([]);
  const [relatedOverride, setRelatedOverride] = useState(null);

  const imageList = useMemo(() => {
    if (!data) return [];
    const imgs = (data.images || [])
      .map((i) => i.image || i.url)
      .filter(Boolean);
    if (imgs.length) return imgs;
    if (data.product?.image) return [data.product.image];
    return ["/no-image.png"];
  }, [data]);

  const legacyMediaCtx = useMemo(
    () => ({
      shopId: data?.product?.shopId,
      partNumber: data?.product?.partNumber,
    }),
    [data?.product?.shopId, data?.product?.partNumber],
  );

  const productDescriptionHtml = useMemo(() => {
    const raw = data?.product?.description?.replace(/<p><br><\/p>/g, "") || "";
    return rewriteLegacyThumbUrlsInHtml(raw, legacyMediaCtx);
  }, [data?.product?.description, legacyMediaCtx]);

  useEffect(() => {
    setRelatedOverride(null);
  }, [routeId]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLoadError("");

    fetch(`${API_BASE}/product/${encodeURIComponent(routeId)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j.message || "Không tải được sản phẩm");
        }
        return j;
      })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        const list = (res.images || [])
          .map((i) => i.image || i.url)
          .filter(Boolean);
        const first =
          list[0] || res.product?.image || "/no-image.png";
        setMainImage(first);
        setActiveIdx(0);

        const title =
          stripHtml(res.product?.shortDescription || res.product?.partName) ||
          "Sản phẩm";
        document.title = `${title} | Otofine`;

        try {
          const slug = res.product?.slug;
          const pid = res.product?.id;
          const entry = {
            id: pid,
            slug: slug || null,
            title,
            partNumber: res.product?.partNumber,
            image: first,
            priceLabel: formatPrice(
              res.product?.priceText ||
                res.product?.price ||
                res.product?.price_text,
            ),
            // Persist the owning shop so the storefront recently-viewed
            // strip can filter "viewed within this shop only" without
            // hitting the network. Falls back to null for resilience.
            shopId: res.shop?.id ?? res.product?.shop_id ?? null,
            shopSlug: res.shop?.slug || null,
            shopName: res.shop?.name || null,
            at: Date.now(),
          };
          const next = pushRecentlyViewed(entry);
          setRecentViewed(excludeCurrent(next, pid).slice(0, 12));
        } catch {
          /* ignore */
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message || "Lỗi tải trang");
      });

    return () => {
      cancelled = true;
    };
  }, [routeId]);

  useEffect(() => {
    if (!data?.product?.id) return;
    const fromDetail = Array.isArray(data.related) ? data.related : [];
    if (fromDetail.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `${API_BASE}/products/related?id=${data.product.id}&limit=12`,
        );
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (j.data && Array.isArray(j.data) && j.data.length) {
          setRelatedOverride(j.data);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.product?.id, data?.related]);

  useEffect(() => {
    const arr = readRecentlyViewed();
    setRecentViewed(
      arr.filter((x) => x && !isCurrentListEntry(x, routeId)).slice(0, 12),
    );
  }, [routeId]);

  const product = data?.product || {};
  const shop = data?.shop || {};
  const cars = data?.cars || [];

  const activeMarketplaceContext = useMemo(
    () =>
      resolveActiveMarketplaceContext({
        queryContext: queryMarketplaceContext,
        sessionContext: sessionMarketplaceContext,
        cars,
      }),
    [queryMarketplaceContext, sessionMarketplaceContext, cars],
  );

  const listingBackHref = useMemo(
    () => resolveListingBackHref(activeMarketplaceContext),
    [activeMarketplaceContext],
  );

  const vehicleBreadcrumbLabel = useMemo(
    () => formatMarketplaceVehicleLabel(activeMarketplaceContext),
    [activeMarketplaceContext],
  );

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(listingBackHref || "/");
  }, [router, listingBackHref]);

  const relatedList = useMemo(() => {
    const fromApi =
      relatedOverride != null && relatedOverride.length
        ? relatedOverride
        : data?.related;
    const list = Array.isArray(fromApi) ? fromApi : [];
    return list.filter(Boolean).slice(0, 12);
  }, [data?.related, relatedOverride]);

  const zaloHref = useMemo(() => buildZaloUrl(shop), [shop]);
  const telHref = `tel:${digitsOnly(shop.phone)}`;
  const shopAvatarUrl = normalizeShopAvatar(shop.avatar);

  const pickImage = useCallback(
    (url, idx) => {
      setMainImage(url);
      setActiveIdx(idx);
    },
    [],
  );

  const openLightbox = useCallback((idx) => {
    setLightboxIdx(idx);
    setLightboxOpen(true);
  }, []);

  const copyPartNumber = useCallback(() => {
    const t = String(product.partNumber ?? "").trim();
    if (!t) return;
    const run = () => {
      setCopiedOem(true);
      window.setTimeout(() => setCopiedOem(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(t).then(run).catch(run);
    } else {
      run();
    }
  }, [product.partNumber]);

  const specRows = useMemo(() => {
    const rows = [];
    if (product.stock != null && product.stock !== "")
      rows.push({ label: "Tồn kho", value: String(product.stock) });
    if (product.origin)
      rows.push({ label: "Xuất xứ", value: String(product.origin) });
    if (product.weight != null && product.weight !== "")
      rows.push({
        label: "Khối lượng",
        value: `${product.weight} kg`,
      });
    const L = product.length;
    const W = product.width;
    const H = product.height;
    if (L || W || H) {
      const dims = [L, W, H].filter((x) => x != null && x !== "").join(" × ");
      if (dims) rows.push({ label: "Kích thước (cm)", value: dims });
    }
    rows.push({
      label: "Danh mục",
      value: getCategoryName(product.partName) || "—",
    });
    return rows;
  }, [product]);

  if (loadError) {
    return (
      <div className="detail-page">
        <div className="detail-wrap detail-wrap--error">
          <p className="detail-error-msg">{loadError}</p>
          <button
            type="button"
            className="detail-back-link"
            onClick={handleBack}
          >
            ← Quay lại
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="detail-page">
        <div className="detail-wrap detail-skeleton-wrap">
          <div className="detail-skeleton detail-skeleton-breadcrumb" />
          <div className="detail-skeleton detail-skeleton-title" />
          <div className="detail-top-grid-skel">
            <div className="detail-skeleton detail-skeleton-gallery" />
            <div className="detail-skeleton detail-skeleton-info" />
          </div>
        </div>
      </div>
    );
  }

  const titleText =
    stripHtml(product.shortDescription || product.partName) || "Sản phẩm";

  return (
    <div className="detail-page">
      <div className="detail-wrap">
        <p className="detail-back-pretitle">
          <button
            type="button"
            className="detail-back-link"
            onClick={handleBack}
          >
            ← Quay lại
          </button>
        </p>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/" prefetch={false}>
            Trang chủ
          </Link>
          {vehicleBreadcrumbLabel ? (
            <>
              <span className="breadcrumb-sep"> / </span>
              <Link href={listingBackHref} prefetch={false}>
                {vehicleBreadcrumbLabel}
              </Link>
            </>
          ) : null}
          <span className="breadcrumb-sep"> / </span>
          <span className="breadcrumb-current">{titleText}</span>
        </nav>

        <h1 className="detail-title">{titleText}</h1>

        <div className="top-grid">
          <div className="gallery">
            <div className="main-img-wrap">
              <button
                type="button"
                className="main-img-zoom-hit"
                onClick={() => openLightbox(activeIdx)}
                aria-label="Phóng to ảnh"
              >
                <div className="main-img">
                  <img
                    src={mainImage || "/no-image.png"}
                    alt={titleText}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    onError={(e) => {
                      e.target.src = "/no-image.png";
                    }}
                  />
                </div>
                <span className="zoom-badge">Phóng to</span>
              </button>
            </div>

            {imageList.length > 1 && (
              <div className="thumbs" role="list">
                {imageList.map((url, idx) => (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    role="listitem"
                    className={`thumb-btn${activeIdx === idx ? " is-active" : ""}`}
                    onClick={() => pickImage(url, idx)}
                    aria-label={`Ảnh ${idx + 1}`}
                  >
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.opacity = "0.3";
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="info">
            <div className="price-block">
              <span className="price-label">Giá bán</span>
              <div className="price price--hero">
                {formatPrice(
                  product.priceText || product.price || product.price_text,
                )}
              </div>
              <p className="price-hint">Giá có thể thay đổi — liên hệ để chốt</p>
            </div>

            <div className="oem-strip">
              <div className="oem-strip-inner">
                <span className="oem-label">Mã OEM / Part number</span>
                <code className="oem-code">{product.partNumber || "—"}</code>
              </div>
              <button
                type="button"
                className="oem-copy"
                onClick={copyPartNumber}
              >
                {copiedOem ? "Đã chép" : "Sao chép"}
              </button>
            </div>

            <div className="badges">
              <span className="badge">Đúng xe</span>
              <span className="badge">Ship toàn quốc</span>
              <span className="badge">Hỗ trợ kỹ thuật</span>
            </div>

            <div className="spec-card">
              <h2 className="spec-card-title">Thông số sản phẩm</h2>
              <dl className="spec-dl">
                {specRows.map((row) => (
                  <div key={row.label} className="spec-row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="cta-desktop">
              <div className="cta-row">
                <a className="cta-btn cta-btn--call" href={telHref}>
                  <span className="cta-ico" aria-hidden>
                    📞
                  </span>
                  Gọi ngay
                </a>
                <a
                  className="cta-btn cta-btn--zalo"
                  href={zaloHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="cta-ico" aria-hidden>
                    💬
                  </span>
                  Zalo
                </a>
                {/* Conversion engine — "Hỏi nhanh" RFQ. Opens the
                    storefront Quick-RFQ modal pre-filled with the
                    current product + fitment. The modal lives at the
                    layout level and listens for this CustomEvent so
                    we don't re-mount it per detail page. */}
                <button
                  type="button"
                  className="cta-btn cta-btn--ghost"
                  onClick={() => openQuickRfqWithProduct(product, activeMarketplaceContext)}
                >
                  <span className="cta-ico" aria-hidden>
                    📦
                  </span>
                  Hỏi nhanh
                </button>
                <button
                  type="button"
                  className="cta-btn cta-btn--ghost"
                  onClick={() => setContactOpen(true)}
                >
                  Liên hệ
                </button>
              </div>
            </div>

            <div className="seller-box" id="otofine-contact">
              <div className="seller-head">
                {shopAvatarUrl ? (
                  <img
                    className="seller-avatar"
                    src={shopAvatarUrl}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <div className="seller-avatar seller-avatar--ph" aria-hidden>
                    🏪
                  </div>
                )}
                <div className="seller-head-text">
                  <h3>{shop.name || "Cửa hàng"}</h3>
                  <div className="seller-trust">
                    <span className="trust-pill">Đã xác minh Otofine</span>
                    <span className="trust-pill trust-pill--soft">
                      Phản hồi nhanh
                    </span>
                  </div>
                </div>
              </div>
              <p className="seller-address">
                {[shop.addressDetail, shop.phuong_xa, shop.tinh_tp]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
              {shop.phone ? (
                <p className="seller-phone-line">
                  Hotline:{" "}
                  <a className="seller-phone-link" href={telHref}>
                    {shop.phone}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <section className="section section--cars">
          <h2 className="section-title">Xe tương thích</h2>
          {cars.length === 0 ? (
            <p className="section-muted">Đang cập nhật danh sách xe phù hợp.</p>
          ) : (
            <ul className="car-chip-list">
              {cars.map((x, i) => (
                <li
                  key={`${x.hang_xe}-${x.ten_xe}-${i}`}
                  className={`car-chip${
                    carMatchesMarketplaceContext(x, activeMarketplaceContext)
                      ? " car-chip--active"
                      : ""
                  }`}
                >
                  <span className="car-chip-brand">{x.hang_xe}</span>
                  <span className="car-chip-model">{x.ten_xe}</span>
                  <span className="car-chip-year">
                    {x.year_from}–{x.year_to}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {relatedList.length > 0 && (
          <section
            className="pd-block pd-block--related"
            aria-labelledby="pd-related-heading"
          >
            <header className="pd-section-head pd-section-head--solo">
              <h2 id="pd-related-heading" className="pd-section-head__title">
                Sản phẩm liên quan
              </h2>
            </header>
            <PdHorizCarousel
              variant="related"
              items={relatedList}
              renderCard={(r) => (
                <Link
                  href={productHref(r.slug, r.id, r, activeMarketplaceContext, "related")}
                  className="pd-mini-card" prefetch={false}>
                  <div className="pd-mini-card__img">
                    <PdMiniCardImage src={r.image} />
                  </div>
                  <div className="pd-mini-card__body">
                    <div className="pd-mini-card__title">
                      {stripHtml(r.shortDescription || r.partName)}
                    </div>
                    <div className="pd-mini-card__meta">
                      <div className="pd-mini-card__pn">{r.partNumber}</div>
                      <div className="pd-mini-card__price">
                        {formatPrice(r.price)}
                      </div>
                    </div>
                  </div>
                </Link>
              )}
            />
          </section>
        )}

        {recentViewed.length > 0 && (
          <section
            className="pd-block pd-block--recent"
            aria-labelledby="pd-recent-heading"
          >
            <header className="pd-section-head pd-section-head--compact pd-section-head--solo">
              <h2 id="pd-recent-heading" className="pd-section-head__title">
                Đã xem gần đây
              </h2>
            </header>
            <PdHorizCarousel
              variant="recent"
              items={recentViewed}
              renderCard={(r) => (
                <Link
                  href={productHref(r.slug, r.id, r, activeMarketplaceContext, "recent")}
                  className="pd-mini-card" prefetch={false}>
                  <div className="pd-mini-card__img">
                    <PdMiniCardImage src={r.image} />
                  </div>
                  <div className="pd-mini-card__body">
                    <div className="pd-mini-card__title">{r.title}</div>
                    <div className="pd-mini-card__meta">
                      <div className="pd-mini-card__pn">{r.partNumber}</div>
                      <div className="pd-mini-card__price">
                        {r.priceLabel}
                      </div>
                    </div>
                  </div>
                </Link>
              )}
            />
          </section>
        )}

        <div className="section">
          <h2 className="section-title">Mô tả sản phẩm</h2>
          <div
            className="detail-html"
            dangerouslySetInnerHTML={{
              __html: productDescriptionHtml,
            }}
          />
        </div>

        {hasContent(shop.salePolicy) && (
          <div className="section">
            <h2 className="section-title">Chính sách bán hàng</h2>
            <div
              className="detail-html"
              dangerouslySetInnerHTML={{
                __html: shop.salePolicy,
              }}
            />
          </div>
        )}

        {hasContent(shop.warrantyPolicy) && (
          <div className="section">
            <h2 className="section-title">Chính sách bảo hành</h2>
            <div
              className="detail-html"
              dangerouslySetInnerHTML={{
                __html: shop.warrantyPolicy,
              }}
            />
          </div>
        )}

        {contactOpen && (
          <div
            className="contact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
            onClick={() => setContactOpen(false)}
          >
            <div
              className="contact-box"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 id="contact-modal-title">Liên hệ nhanh</h4>
              <p className="contact-sub">{shop.name}</p>
              {shop.phone ? (
                <>
                  <a className="contact-action" href={telHref}>
                    📞 Gọi điện
                  </a>
                  <a
                    className="contact-action"
                    href={`sms:${digitsOnly(shop.phone)}`}
                  >
                    💬 Nhắn SMS
                  </a>
                  <a
                    className="contact-action"
                    href={zaloHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    💬 Chat Zalo
                  </a>
                </>
              ) : (
                <p className="section-muted">Chưa có số điện thoại.</p>
              )}
              <button
                type="button"
                className="contact-close"
                onClick={() => setContactOpen(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {lightboxOpen && (
          <div
            className="lightbox"
            role="dialog"
            aria-label="Ảnh lớn"
            onClick={() => setLightboxOpen(false)}
          >
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setLightboxOpen(false)}
              aria-label="Đóng"
            >
              ×
            </button>
            {imageList.length > 1 && (
              <>
                <button
                  type="button"
                  className="lightbox-nav lightbox-prev"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIdx(
                      (i) => (i - 1 + imageList.length) % imageList.length,
                    );
                  }}
                  aria-label="Ảnh trước"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="lightbox-nav lightbox-next"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIdx((i) => (i + 1) % imageList.length);
                  }}
                  aria-label="Ảnh sau"
                >
                  ›
                </button>
              </>
            )}
            <div
              className="lightbox-inner"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={imageList[lightboxIdx] || mainImage}
                alt=""
                className="lightbox-img"
              />
            </div>
          </div>
        )}

        <nav className="detail-mobile-cta" aria-label="Thao tác nhanh">
          <a className="m-cta m-cta--call" href={telHref}>
            <span className="m-cta-ico">📞</span>
            Gọi ngay
          </a>
          <a
            className="m-cta m-cta--zalo"
            href={zaloHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="m-cta-ico">💬</span>
            Zalo
          </a>
          {/* Conversion engine — "Hỏi nhanh" replaces the legacy
              "Liên hệ" modal opener on mobile. The Quick RFQ flow is
              a friction-free way to start a conversation that lands
              in the seller's inbox immediately, vs. the old contact
              form modal which only surfaced contact info. */}
          <button
            type="button"
            className="m-cta m-cta--contact"
            onClick={() => openQuickRfqWithProduct(product, activeMarketplaceContext)}
            aria-label="Hỏi nhanh về sản phẩm này"
          >
            <span className="m-cta-ico">📦</span>
            Hỏi nhanh
          </button>
        </nav>

        {/* Mount the Quick-RFQ modal (modal-only, no floating
            button) so the apex `/<slug>-<id>` detail page can open
            the same in-place RFQ flow the shopsite product cards
            use. Without this mount, the "Hỏi nhanh" CTA falls
            back to a full-page `/rfq/new` navigation, which is a
            slower experience. The shopsite layout still mounts its
            own launcher with the floating button visible. */}
        {shop?.slug && (
          <ShopQuickRfqLauncher
            hideButton
            shop={{
              id: shop.id ?? null,
              slug: shop.slug,
              name: shop.name || "",
            }}
          />
        )}
      </div>
    </div>
  );
}
