import { notFound } from "next/navigation";
import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { RESERVED_SLUGS } from "@/lib/seo/parseLandingSlug";
import { getSeoListingData } from "@/lib/seo/getListingData";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { SEO_BASE_SLUG } from "@/lib/seo/slugify";
import { buildHomePageTitle } from "@/lib/seo/homePageTitle";
import {
  parseHomeListingStateFromSlug,
  buildHomeListingUrl,
} from "@/lib/seo/parseHomeListingSlug";
import { loadPartSeoPage } from "@/lib/seo/loadPartSeoPage.server.js";
import { buildSeoListingContext } from "@/lib/seo/buildSeoListingContext.js";
import { API_BASE } from "@/lib/config";
import {
  buildCandidatePhrases,
  findBestSeoArticle,
} from "../../../shared/partNameMatcher.js";
import SeoArticleBlock from "@/components/seo/SeoArticleBlock.jsx";
import { categoryLandingSlugFromName } from "@/lib/seo/slugify";

/** Luôn đọc SEO engine mới nhất; tránh cache RSC cũ che `seo_page_cache`. */

// Category pages now use the same dynamic matching system as regular parts
// This ensures SEO content adapts to H1 changes from user filters
export const dynamic = "force-dynamic";

function debugSlugRoute(phase, payload) {
  if (process.env.NODE_ENV === "production") return;
  const line = `[slug-page] ${phase}`;
  console.warn(line, typeof payload === "object" ? JSON.stringify(payload).slice(0, 2400) : payload);
}

/** Dev / opt-in PERF_SLUG_LOG=1: timing for bottleneck hunting (server console). */
function perfSlug(mark, ms) {
  const on =
    process.env.NODE_ENV !== "production" || process.env.PERF_SLUG_LOG === "1";
  if (!on) return;
  console.warn(`[slug-perf] ${mark}: ${ms.toFixed(1)}ms`);
}

const homeLoading = (
  <div className="home-page-loading" aria-busy="true" aria-label="Đang tải">
    <div className="home-page-loading__bar" />
    <div className="home-page-loading__bar home-page-loading__bar--short" />
    <div className="home-page-loading__grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="home-page-loading__card" />
      ))}
    </div>
  </div>
);

const Home = nextDynamic(() => import("@/components/pages/Home"), {
  ssr: true,
  loading: () => homeLoading,
});

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function stripHtmlMeta(str) {
  if (str == null || typeof str !== "string") return "";
  return String(str)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function buildSeoEngineArticleBlock(pe) {
  if (!pe) return null;
  const seo = pe.seoContent ?? {};
  const intro =
    typeof seo.introHtml === "string" && seo.introHtml.trim()
      ? seo.introHtml
      : typeof pe.intro_html === "string"
        ? pe.intro_html
        : "";
  const articleBody =
    typeof seo.articleHtml === "string" && seo.articleHtml.trim()
      ? seo.articleHtml
      : typeof pe.article_html === "string"
        ? pe.article_html
        : "";
  const faqPayload = seo.faqStructured ?? pe.faq_json ?? null;

  const h1Guess =
    (typeof pe.route?.h1 === "string" && pe.route.h1.trim()
      ? pe.route.h1
      : "") ||
    (typeof pe.part?.name_vi === "string" && pe.part.name_vi.trim()
      ? pe.part.name_vi
      : "");

  const partDisplayName =
    (typeof pe.part?.name_vi === "string" && pe.part.name_vi.trim()
      ? pe.part.name_vi.trim()
      : "") || stripHtmlMeta(h1Guess) || "Phụ tùng";

  return (
    <SeoArticleBlock
      intro={intro}
      article={articleBody}
      shops={Array.isArray(pe.shops) ? pe.shops : []}
      faq={faqPayload}
      relatedLinks={seo.crossSell ?? null}
      products={Array.isArray(pe.products) ? pe.products : []}
      productThumbnails={pe.productThumbnails ?? {}}
      partDisplayName={partDisplayName}
    />
  );
}

function buildDbArticleContent(pe) {
  if (!pe) return null;
  const introHtml =
    (typeof pe?.seoContent?.introHtml === "string" && pe.seoContent.introHtml.trim()
      ? pe.seoContent.introHtml
      : typeof pe?.intro_html === "string"
        ? pe.intro_html
        : "") || "";
  const articleHtml =
    (typeof pe?.seoContent?.articleHtml === "string" &&
    pe.seoContent.articleHtml.trim()
      ? pe.seoContent.articleHtml
      : typeof pe?.article_html === "string"
        ? pe.article_html
        : "") || "";
  if (!introHtml.trim() && !articleHtml.trim()) return null;
  return { introHtml, articleHtml };
}

function buildPremiumArticle(pe) {
  const dbContent = buildDbArticleContent(pe);
  if (dbContent) return { source: "db", ...dbContent };
  const seoBlock = buildSeoEngineArticleBlock(pe);
  if (seoBlock) return { source: "seo", block: seoBlock };
  return null;
}

function buildHomeInitialStateFromParsed(parsed) {
  const f = parsed?.filters || {};
  return {
    selectedCategory: String(f.category || "").trim(),
    filters: {
      brand: String(f.brand || "").trim(),
      model: String(f.model || "").trim(),
      year: String(f.year || "").trim(),
      engine: "",
      displacement: "",
      transmission: "",
      drivetrain: "",
      bodyType: "",
    },
  };
}

async function searchPartKnowledgeRows(h1) {
  const phrases = buildCandidatePhrases(h1).slice(0, 8);
  const rowsBySlug = new Map();
  for (const q of phrases) {
    const url = `${String(API_BASE).replace(/\/$/, "")}/part-knowledge?page=1&limit=40&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const body = await res.json().catch(() => ({}));
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      for (const row of rows) {
        const slug = String(row?.slug || "").trim().toLowerCase();
        if (!slug) continue;
        if (!rowsBySlug.has(slug)) rowsBySlug.set(slug, row);
      }
    } catch {
      /* ignore search failures */
    }
  }
  return [...rowsBySlug.values()];
}

async function loadBestMatchedPartEngineByH1(h1) {
  const rows = await searchPartKnowledgeRows(h1);
  const best = findBestSeoArticle(h1, rows);
  if (!best?.row?.slug) return null;
  return loadPartSeoPage(best.row.slug);
}

export async function generateMetadata({ params, searchParams }) {
  const metaTotal0 = nowMs();
  const { slug: slugParam } = await params;
  const sp = await searchParams;
  const raw = typeof slugParam === "string" ? slugParam : "";
  const slug = raw.toLowerCase().trim();
  debugSlugRoute("generateMetadata slug", { raw, slug });
  if (!slug || RESERVED_SLUGS.has(slug)) {
    return {
      title: "Không tìm thấy | Otofine",
      robots: { index: false, follow: true },
    };
  }

  // Category slugs now use the same dynamic matching system as regular parts
  // This ensures metadata adapts to H1 changes from user filters

  const tLp = nowMs();
  const partEngine = await loadPartSeoPage(slug);
  perfSlug("generateMetadata/loadPartSeoPage", nowMs() - tLp);
  debugSlugRoute("loadPartSeoPage", {
    hasPartEngine: !!partEngine,
    routeId: partEngine?.route?.id,
    partId: partEngine?.part?.id,
  });
  if (partEngine) {
    const h1 =
      (typeof partEngine.route?.h1 === "string" && partEngine.route.h1.trim()) ||
      (typeof partEngine.part?.name_vi === "string" &&
        partEngine.part.name_vi.trim()) ||
      slug;
    /** Prefer cache-backed title/meta from SEO Engine API */
    const title =
      (typeof partEngine.title === "string" && partEngine.title.trim())
        ? partEngine.title.trim()
        : `${h1} chính hãng, giá tốt | Otofine`;
    const description =
      (typeof partEngine.meta_description === "string" &&
        partEngine.meta_description.trim())
        ? partEngine.meta_description.trim()
        : `${h1} cho nhiều dòng xe. Tra cứu đúng phụ tùng, xem giá mới nhất và tư vấn tại Otofine.`;
    const canonical = absoluteUrl(`/${slug}`);
    perfSlug("generateMetadata/total", nowMs() - metaTotal0);
    return {
      title,
      description,
      alternates: { canonical },
      robots: { index: true, follow: true },
      openGraph: {
        title,
        description,
        url: canonical,
        siteName: "Otofine",
        locale: "vi_VN",
        type: "article",
        images: [{ url: "/logo.png", width: 512, height: 512, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: ["/logo.png"],
      },
    };
  }

  const pageNumMeta = Math.max(1, Number(sp?.page) || 1);
  const tGl = nowMs();
  const { parsed: parsedListing, list: listMeta } = await getSeoListingData(
    slug,
    pageNumMeta,
  );
  perfSlug("generateMetadata/getSeoListingData", nowMs() - tGl);
  debugSlugRoute("getSeoListingData (metadata)", {
    kind: parsedListing?.kind,
    hasList: !!listMeta,
  });

  if (parsedListing && parsedListing.kind !== "invalid" && listMeta) {
    const resolvedH1 = parsedListing.h1 || slug;
    const pageNum = pageNumMeta;
    const qRaw = typeof sp?.q === "string" ? sp.q : sp?.q?.[0] || "";
    const qp = new URLSearchParams();
    if ((qRaw || "").trim()) qp.set("q", (qRaw || "").trim());
    if (pageNum > 1) qp.set("page", String(pageNum));
    const qs = qp.toString();
    const pathWithQuery = qs ? `/${slug}?${qs}` : `/${slug}`;
    const canonical = absoluteUrl(pathWithQuery);
    const title = `${resolvedH1} chính hãng, giá tốt | Otofine`;
    const description = `Tìm ${String(resolvedH1).toLowerCase()} phù hợp, nhiều lựa chọn từ cửa hàng uy tín trên Otofine. So sánh nhanh giá và sản phẩm.`;
    const hasItems = (listMeta.data?.length || 0) > 0;
    const isBase = slug === SEO_BASE_SLUG;
    const indexable = hasItems || isBase;
    perfSlug("generateMetadata/total", nowMs() - metaTotal0);
    return {
      title,
      description,
      alternates: { canonical },
      robots: indexable
        ? { index: true, follow: true }
        : { index: false, follow: true },
      openGraph: {
        title,
        description,
        url: canonical,
        siteName: "Otofine",
        locale: "vi_VN",
        type: "article",
        images: [
          {
            url: "/logo.png",
            width: 512,
            height: 512,
            alt: "Otofine phụ tùng ô tô",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: ["/logo.png"],
      },
    };
  }

  const tHm = nowMs();
  const homeState = await parseHomeListingStateFromSlug(slug);
  perfSlug("generateMetadata/parseHomeListingStateFromSlug", nowMs() - tHm);
  debugSlugRoute("parseHomeListingStateFromSlug", homeState);

  if (homeState) {
    const resolvedH1 = buildHomePageTitle(
      homeState.selectedCategory,
      homeState.filters,
    );
    const pageNum = Math.max(1, Number(sp?.page) || 1);
    const q = typeof sp?.q === "string" ? sp.q : sp?.q?.[0] || "";
    const pathWithQuery = buildHomeListingUrl(resolvedH1, { q, page: pageNum });
    const canonical = absoluteUrl(pathWithQuery);
    const title = `${resolvedH1} chính hãng, giá tốt | Otofine`;
    const description = `Tìm ${resolvedH1.toLowerCase()} phù hợp, nhiều lựa chọn từ cửa hàng uy tín trên Otofine. So sánh nhanh giá và sản phẩm.`;
    perfSlug("generateMetadata/total", nowMs() - metaTotal0);
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: canonical,
        siteName: "Otofine",
        locale: "vi_VN",
        type: "article",
        images: [{ url: "/logo.png", width: 512, height: 512, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: ["/logo.png"],
      },
    };
  }

  perfSlug("generateMetadata/total", nowMs() - metaTotal0);
  return {
    title: "Không tìm thấy | Otofine",
    robots: { index: false, follow: true },
  };
}

export default async function SeoOrHomeListingPage({ params, searchParams }) {
  const routeT0 = nowMs();
  const { slug: slugParam } = await params;
  const raw = typeof slugParam === "string" ? slugParam : "";
  const slug = raw.toLowerCase().trim();
  debugSlugRoute("page route slug", { raw, slug });
  if (!slug || RESERVED_SLUGS.has(slug)) notFound();

  // Category slugs now use the same dynamic matching system as regular parts
  // This ensures SEO content adapts to H1 changes from user filters

  const tLp = nowMs();
  const partEngine = await loadPartSeoPage(slug);
  perfSlug("page/loadPartSeoPage", nowMs() - tLp);

  debugSlugRoute("loadPartSeoPage (page)", {
    hasPartEngine: !!partEngine,
    routeId: partEngine?.route?.id,
    partId: partEngine?.part?.id,
  });
  if (partEngine) {
    const seoListingContext = buildSeoListingContext(partEngine, slug);
    perfSlug("page/handler_total_SEO_shell", nowMs() - routeT0);
    return (
      <Suspense fallback={homeLoading}>
        <Home
          key={slug}
          seoListingContext={seoListingContext}
          premiumArticle={buildPremiumArticle(partEngine)}
        />
      </Suspense>
    );
  }

  const sp = await searchParams;
  const pageNum = Math.max(1, Number(sp?.page) || 1);
  const tGl = nowMs();
  const { parsed, list } = await getSeoListingData(slug, pageNum);
  perfSlug("page/getSeoListingData", nowMs() - tGl);

  debugSlugRoute("getSeoListingData (page)", {
    kind: parsed?.kind,
    hasList: !!list,
  });

  if (parsed && parsed.kind !== "invalid" && list) {
    perfSlug("page/handler_total", nowMs() - routeT0);
    return (
      <Suspense fallback={homeLoading}>
        <Home
          key={slug}
          initialFromSlug={buildHomeInitialStateFromParsed(parsed)}
        />
      </Suspense>
    );
  }

  const tHm = nowMs();
  const homeState = await parseHomeListingStateFromSlug(slug);
  perfSlug("page/parseHomeListingStateFromSlug", nowMs() - tHm);

  debugSlugRoute("parseHomeListingStateFromSlug (page)", homeState);

  if (homeState) {
    const resolvedH1 = buildHomePageTitle(
      homeState.selectedCategory,
      homeState.filters,
    );
    const matchedPartEngine = await loadBestMatchedPartEngineByH1(resolvedH1);
    perfSlug("page/handler_total", nowMs() - routeT0);
    return (
      <Suspense fallback={homeLoading}>
        <Home
          key={slug}
          initialFromSlug={{
            selectedCategory: homeState.selectedCategory,
            filters: homeState.filters,
          }}
          premiumArticle={buildPremiumArticle(matchedPartEngine)}
        />
      </Suspense>
    );
  }

  perfSlug("page/handler_total", nowMs() - routeT0);
  debugSlugRoute("notFound — no branch matched", { slug });
  notFound();
}
