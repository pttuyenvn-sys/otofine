"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeShopSeoReadiness } from "@/lib/shopsite/shopSeoReadiness";
import { API_BASE } from "@/lib/config";

/**
 * Mobile-only collapsible affordance.
 *
 * The SEO panel is rich (score bar + per-gate suggestions + Facebook
 * and Google preview cards). On a phone it can take a full screen of
 * vertical real estate that the seller almost never edits while
 * filling out the rest of the form. We collapse it by default on
 * mobile and let desktop render expanded, identical to the legacy
 * layout.
 */
function useMobileCollapse(defaultOpenMobile = false) {
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState(true);
  // Track whether we've already established the layout-driven default
  // so the seller's manual expand/collapse on mobile isn't reset by
  // a window resize / orientation change.
  const initialized = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 899.98px)");
    const update = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (!initialized.current) {
        initialized.current = true;
        setOpen(mobile ? defaultOpenMobile : true);
      }
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [defaultOpenMobile]);
  return { isMobile, open, setOpen };
}

/**
 * Phase 5.5 — SEO readiness panel for `/shop/settings`.
 *
 * Three stacked cards:
 *
 *   1. SEO readiness score + per-gate suggestions, mirroring the
 *      backend `evaluateSeoEligibility()` gate so the seller can see
 *      exactly which conditions block indexing.
 *
 *   2. Facebook share preview — renders the OG card Facebook /
 *      Messenger / Zalo would show today using the SAME inputs the
 *      storefront's metadata builder feeds into `og:image`,
 *      `og:title`, `og:description`. If the seller's preview matches
 *      this card, it'll match production exactly.
 *
 *   3. Google SERP snippet preview — title / URL / description in
 *      Google's classic blue-link layout, so the seller can sanity-
 *      check the description copy.
 *
 * No network calls. Pure projection of form state.
 */
export default function ShopSeoPreviewPanel({ basic, pub, extras = {} }) {
  // Productcount + the authoritative server-side eligibility gate
  // live on the public shop DTO. The seller cannot edit them from
  // `/shop/settings`, so we fetch them once when the panel mounts
  // and re-fetch only if the slug changes (rare).
  const [serverState, setServerState] = useState({
    productCount: undefined,
    seoEligible: undefined,
    seoReasons: undefined,
    loading: true,
  });

  useEffect(() => {
    const slug = (pub?.slug || "").trim();
    if (!slug) {
      setServerState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    setServerState((s) => ({ ...s, loading: true }));
    fetch(`${API_BASE}/public/shops/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setServerState({
          productCount: typeof d.productCount === "number" ? d.productCount : undefined,
          seoEligible: typeof d.seoEligible === "boolean" ? d.seoEligible : undefined,
          seoReasons: Array.isArray(d.seoReasons) ? d.seoReasons : undefined,
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setServerState((s) => ({ ...s, loading: false }));
      });
    return () => { cancelled = true; };
  }, [pub?.slug]);

  const enrichedExtras = useMemo(
    () => ({ ...extras, productCount: serverState.productCount }),
    [extras, serverState.productCount],
  );

  const readiness = useMemo(
    () => computeShopSeoReadiness({ basic, pub, extras: enrichedExtras }),
    [basic, pub, enrichedExtras],
  );
  const preview = useMemo(() => composePreview({ basic, pub, extras }), [basic, pub, extras]);

  const tone = scoreTone(readiness.score);
  const gateMsg = readiness.gateOk
    ? "Đã đủ điều kiện để mở indexing — chờ Otofine bật rollout chung."
    : "Chưa đủ điều kiện indexing — bổ sung các mục bắt buộc bên dưới.";

  const { isMobile, open, setOpen } = useMobileCollapse(false);

  return (
    <section
      id="seo"
      className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 px-3.5 py-3 sm:px-5 sm:py-4 mb-3 sm:mb-4"
      aria-label="SEO readiness"
    >
      <button
        type="button"
        onClick={isMobile ? () => setOpen((v) => !v) : undefined}
        // On desktop the header is just a label, not a button. We
        // suppress the button affordance via aria-hidden controls
        // when isMobile=false.
        aria-expanded={isMobile ? open : undefined}
        className={
          "w-full flex items-center justify-between gap-3 " +
          (isMobile ? "cursor-pointer" : "cursor-default")
        }
      >
        <div className="min-w-0 text-left">
          <h2 className="text-sm font-semibold text-gray-900">
            SEO sẵn sàng {readiness.score}%
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{gateMsg}</p>
        </div>
        <span className="inline-flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center justify-center min-w-[3rem] h-10 px-2 rounded-xl text-base font-bold ${tone.pill}`}
          >
            {readiness.score}
          </span>
          {isMobile && (
            <span
              aria-hidden
              className={
                "text-gray-400 text-lg leading-none transition-transform " +
                (open ? "rotate-180" : "rotate-0")
              }
            >
              ⌄
            </span>
          )}
        </span>
      </button>

      <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
          style={{ width: `${readiness.score}%` }}
          aria-hidden
        />
      </div>

      {isMobile && !open ? null : (
      <>
      {/* Per-gate suggestions ---------------------------------------- */}
      {readiness.suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            {readiness.suggestions.length} gợi ý cải thiện SEO
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {readiness.suggestions.map((s) => (
              <li
                key={s.key}
                className="flex items-start gap-2 text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
              >
                <span
                  aria-hidden
                  className={`mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                    s.gate ? "bg-red-500" : "bg-amber-400"
                  }`}
                />
                <div className="min-w-0">
                  <div className="font-medium text-gray-800">
                    {s.label}
                    {s.gate && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700">
                        bắt buộc
                      </span>
                    )}
                  </div>
                  {s.fix && (
                    <div className="text-[11px] text-gray-500 mt-0.5">{s.fix}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-700">
          Hoàn hảo — mọi tín hiệu SEO đã được tối ưu.
        </p>
      )}

      {/* Previews ----------------------------------------------------- */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <FacebookPreviewCard preview={preview} />
        <GooglePreviewCard preview={preview} />
      </div>

      <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
        Preview chỉ là phỏng đoán bằng cùng dữ liệu mà Facebook / Google sẽ
        đọc. Hình ảnh thật có thể khác đôi chút do crawler cache.
      </p>
      </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function FacebookPreviewCard({ preview }) {
  return (
    <figure className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <figcaption className="text-[10px] uppercase tracking-wider text-gray-400 px-3 pt-2 pb-1 flex items-center gap-1.5">
        <FacebookGlyph /> Facebook / Messenger / Zalo
      </figcaption>
      <div className="bg-[#f0f2f5] p-3">
        <div className="bg-white rounded-md overflow-hidden border border-gray-200 shadow-sm">
          <div className="bg-gray-100 aspect-[1.91/1] relative">
            {preview.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                Chưa có ảnh OG
              </div>
            )}
          </div>
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 truncate">
              {preview.host}
            </div>
            <div className="text-[13px] font-semibold text-gray-900 leading-tight line-clamp-2 mt-0.5">
              {preview.title}
            </div>
            <div className="text-[11px] text-gray-500 leading-snug line-clamp-2 mt-0.5">
              {preview.description}
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

function GooglePreviewCard({ preview }) {
  return (
    <figure className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <figcaption className="text-[10px] uppercase tracking-wider text-gray-400 px-3 pt-2 pb-1 flex items-center gap-1.5">
        <GoogleGlyph /> Google Search
      </figcaption>
      <div className="bg-white p-4">
        <div className="flex items-start gap-3">
          {preview.favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.favicon}
              alt=""
              className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-[12px] text-gray-700 truncate">
              <span className="font-medium text-gray-900">Otofine</span>
              <span className="mx-1 text-gray-400">·</span>
              <span className="text-gray-500">{preview.host}</span>
            </div>
            <div className="text-[10px] text-gray-500 truncate">{preview.urlPath}</div>
            <a
              href={preview.url}
              className="block mt-1 text-[#1a0dab] hover:underline text-[18px] leading-snug line-clamp-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              {preview.title}
            </a>
            <p className="text-[13px] text-gray-700 leading-snug line-clamp-3 mt-1">
              {preview.description}
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Compose                                                             */
/* ------------------------------------------------------------------ */

function composePreview({ basic, pub, extras }) {
  const name = (basic?.name || "Shop Otofine").trim();
  const slug = (pub?.slug || "your-shop").trim();
  const intro = stripIntro(pub?.introHtml);
  const bio = (pub?.bio || "").trim();
  const description = trimDescription(intro || bio || `Phụ tùng ô tô chính hãng tại ${name}.`);
  const title = `${name} | Otofine`;
  const image = absolutize(extras?.cover || extras?.avatar || pub?.coverImage || pub?.avatar);
  const favicon = absolutize(extras?.avatar || pub?.avatar);
  // UX polish: storefront subdomain is now the live indexed URL, so
  // the seller should preview EXACTLY what Google / Facebook will
  // render after wildcard rollout: `<slug>.otofine.com` instead of
  // the legacy `/shops/<slug>` path on the apex. This is preview-only
  // — backend canonical, sitemap, og:url and JSON-LD continue to
  // emit whichever URL the existing SEO logic computes. We do NOT
  // touch backend/SEO logic from here. See `lib/shopsite/*` for the
  // server-side truth.
  const host = `${slug}.otofine.com`;
  const url = `https://${host}/`;

  return { name, slug, title, description, image, favicon, host, urlPath: url, url };
}

function stripIntro(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function trimDescription(text) {
  if (!text) return "";
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

function absolutize(url) {
  if (!url) return null;
  const v = String(url).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  return `https://otofine.com${v.startsWith("/") ? "" : "/"}${v}`;
}

function scoreTone(s) {
  if (s >= 85) return { pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" };
  if (s >= 60) return { pill: "bg-amber-50 text-amber-700", bar: "bg-amber-500" };
  return { pill: "bg-red-50 text-red-700", bar: "bg-red-500" };
}

function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
      <path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5 3.66 9.15 8.44 9.93v-7.02H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.78 8.43-4.92 8.43-9.93z" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
      <path fill="#4285F4" d="M23 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.18c-.27 1.44-1.09 2.66-2.32 3.48v2.9h3.75C21.78 18.66 23 15.7 23 12.27z" />
      <path fill="#34A853" d="M12 23c3.13 0 5.75-1.04 7.66-2.83l-3.75-2.9c-1.04.7-2.37 1.12-3.91 1.12-3.01 0-5.56-2.03-6.47-4.76H1.66v2.99C3.56 20.52 7.46 23 12 23z" />
      <path fill="#FBBC05" d="M5.53 13.63c-.23-.7-.36-1.45-.36-2.23s.13-1.53.36-2.23V6.18H1.66C.86 7.77.39 9.83.39 12s.47 4.23 1.27 5.82l3.87-3.19z" />
      <path fill="#EA4335" d="M12 5.38c1.7 0 3.23.59 4.43 1.73l3.32-3.32C17.74.94 15.12 0 12 0 7.46 0 3.56 2.48 1.66 6.18l3.87 2.99C6.44 7.41 8.99 5.38 12 5.38z" />
    </svg>
  );
}
