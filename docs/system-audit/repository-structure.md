# Otofine — Repository Structure Audit

> **Phase:** Structural Observation Only  
> **Date:** 2026-05-26  
> **Scope:** Read-only. No refactor suggestions. No migration proposals. Reflects current production architecture as-is.

---

## Table of Contents

1. [Repository Overview](#1-repository-overview)
2. [Frontend Structure](#2-frontend-structure)
   - [App Router Routes](#21-app-router-routes)
   - [Next.js API Routes](#22-nextjs-api-routes)
   - [Shared Components](#23-shared-components)
   - [Custom Hooks](#24-custom-hooks)
   - [API Client Modules](#25-api-client-modules)
   - [Services](#26-services)
   - [Lib Modules](#27-lib-modules)
   - [Configuration](#28-configuration)
   - [State Management](#29-state-management)
3. [Backend Structure](#3-backend-structure)
   - [Entry Point](#31-entry-point)
   - [Routes](#32-routes)
   - [Controllers](#33-controllers)
   - [Services](#34-services)
   - [Middlewares](#35-middlewares)
   - [Models & Repositories](#36-models--repositories)
   - [Jobs](#37-jobs)
   - [Config](#38-config)
   - [Utils](#39-utils)
   - [Migrations](#310-migrations)
   - [Domain Modules](#311-domain-modules)
   - [RFQ Feature Module](#312-rfq-feature-module)
4. [Critical Shared Modules](#4-critical-shared-modules)
5. [SEO-Critical Areas](#5-seo-critical-areas)
6. [Storefront-Critical Areas](#6-storefront-critical-areas)
7. [RFQ-Critical Areas](#7-rfq-critical-areas)
8. [Wildcard Subdomain Infrastructure](#8-wildcard-subdomain-infrastructure)
9. [Admin Groundwork](#9-admin-groundwork)
10. [Likely Dangerous Coupling Areas](#10-likely-dangerous-coupling-areas)

---

## 1. Repository Overview

```
/var/www/otofine/
├── frontend/                  # Next.js 15 App Router (primary frontend)
├── backend/                   # Node.js + Express ESM API
├── shared/                    # Cross-stack shared utilities
│   └── partNameMatcher.js
├── scripts/                   # Repo-level operational scripts
├── deploy/                    # Deployment config
├── audit/                     # Audit artifacts
├── docs/                      # This documentation
├── backend_backup_20260519/   # Backup snapshot
├── backend_backup_20260524_0811/ # Backup snapshot
└── package.json               # Root stub (react-quill-new only)
```

**Stack summary:**

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, App Router, Tailwind CSS 3 |
| Backend | Node.js, Express 5, ESM (`"type": "module"`) |
| Primary DB | MySQL (`mysql2`) |
| Secondary DB | SQL Server (`mssql`) — legacy/dual-write paths |
| Search | Typesense (`typesense` client) |
| Cache | Redis (`ioredis`) |
| Object Storage | Cloudflare R2 (`@aws-sdk/client-s3`) |
| Push Notifications | OneSignal (`react-onesignal`, custom push service) |
| Email | Resend (`resend`) |
| Auth | JWT (`jsonwebtoken`, `bcrypt`) |
| Rich Content | TipTap, `react-quill-new` |
| Testing | Playwright (frontend dev dep) |

---

## 2. Frontend Structure

**Root:** `/var/www/otofine/frontend`  
**Framework:** Next.js 15 App Router — **no** legacy `pages/` directory  
**Total source files (approx.):** 334 (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.css`)

### 2.1 App Router Routes

All routes live under `frontend/app/`. Seven logical groups:

#### Marketplace Root

| File | URL | Notes |
|---|---|---|
| `app/layout.js` | Root layout | Global metadata, fonts |
| `app/page.js` | `/` | Homepage — 78 lines |
| `app/globals.css` | — | Global styles — 1249 lines |
| `app/not-found.js` | 404 | |

#### SEO Landing Slugs — ⚠️ SEO-CRITICAL

| File | URL Pattern | Notes |
|---|---|---|
| `app/[slug]/page.js` | `/:slug` | Dynamic SEO landing pages — 231 lines |
| `app/phu-tung/[slug]/page.js` | `/phu-tung/:slug` | Part-knowledge SEO pages — 45 lines |
| `app/sitemap.js` | `/sitemap.xml` | Dynamic sitemap — 96 lines |
| `app/robots.js` | `/robots.txt` | Robots config — 38 lines |

#### Product Detail — ⚠️ SEO-CRITICAL

| File | URL Pattern | Notes |
|---|---|---|
| `app/product/[id]/page.js` | `/product/:id` | Product detail — 52 lines |
| `app/p/[id]/page.js` | `/p/:id` | Short product URL — 52 lines |

> Two parallel product detail routes exist (`/product/[id]` and `/p/[id]`). Both are 52 lines. Likely canonical/short URL pair.

#### Seller Center (`/shop/*`)

| File | URL |
|---|---|
| `app/shop/page.js` | `/shop` |
| `app/shop/login/page.js` | `/shop/login` |
| `app/shop/register/page.js` | `/shop/register` |
| `app/shop/forgot-password/page.js` | `/shop/forgot-password` |
| `app/shop/reset-password/page.js` | `/shop/reset-password` |
| `app/shop/change-password/page.js` | `/shop/change-password` |
| `app/shop/account/page.js` | `/shop/account` |
| `app/shop/products/page.js` | `/shop/products` |
| `app/shop/add-product/page.js` | `/shop/add-product` |
| `app/shop/settings/page.js` | `/shop/settings` |
| `app/shop/public-page/page.js` | `/shop/public-page` |
| `app/shop/insights/page.js` | `/shop/insights` |

#### RFQ (`/rfq/*`) — ⚠️ RFQ-CRITICAL

| File | URL | Notes |
|---|---|---|
| `app/rfq/layout.js` | `/rfq` layout | |
| `app/rfq/new/page.js` | `/rfq/new` | Buyer submission — 371 lines |
| `app/rfq/open/page.js` | `/rfq/open` | Open RFQ view — 128 lines |
| `app/rfq/history/page.js` | `/rfq/history` | Buyer history — 87 lines |
| `app/rfq/success/page.js` | `/rfq/success` | Post-submit confirmation — 170 lines |
| `app/rfq/t/[token]/page.js` | `/rfq/t/:token` | Token-based buyer conversation — 376 lines |
| `app/rfq/shop/inbox/page.js` | `/rfq/shop/inbox` | Seller inbox — 199 lines |
| `app/rfq/shop/[dispatchId]/page.js` | `/rfq/shop/:dispatchId` | Seller dispatch detail — 374 lines |
| `app/rfq/admin/health/page.js` | `/rfq/admin/health` | RFQ admin health check — 46 lines |

#### Storefront Route Group — ⚠️ STOREFRONT-CRITICAL

| File | URL | Notes |
|---|---|---|
| `app/(shopsite)/layout.js` | Storefront layout | 15 lines |
| `app/(shopsite)/shops/page.js` | `/shops` | Shop directory — 246 lines |
| `app/(shopsite)/shops/[slug]/layout.js` | `/shops/:slug` layout | 201 lines |
| `app/(shopsite)/shops/[slug]/page.js` | `/shops/:slug` | Shop homepage — 372 lines |
| `app/(shopsite)/shops/[slug]/gioi-thieu/page.js` | `/shops/:slug/gioi-thieu` | About page — 170 lines |
| `app/(shopsite)/shops/[slug]/lien-he/page.js` | `/shops/:slug/lien-he` | Contact page — 229 lines |
| `app/(shopsite)/shops/[slug]/san-pham/page.js` | `/shops/:slug/san-pham` | Products listing — 163 lines |
| `app/(shopsite)/shop-demo/layout.js` | `/shop-demo` layout | 32 lines |
| `app/(shopsite)/shop-demo/page.js` | `/shop-demo` | Demo storefront — 202 lines |
| `app/(shopsite)/shop-demo/gioi-thieu/page.js` | `/shop-demo/gioi-thieu` | |
| `app/(shopsite)/shop-demo/lien-he/page.js` | `/shop-demo/lien-he` | |
| `app/(shopsite)/shop-demo/san-pham/page.js` | `/shop-demo/san-pham` | |

> The `(shopsite)` route group is served both via the main domain path (`/shops/:slug`) and via wildcard subdomain rewrites through `middleware.js`. See [Section 8](#8-wildcard-subdomain-infrastructure).

#### Admin (`/admin/*`)

| File | URL |
|---|---|
| `app/admin/page.js` | `/admin` |
| `app/admin/login/page.js` | `/admin/login` |
| `app/admin/forgot-password/page.js` | `/admin/forgot-password` |
| `app/admin/shops/page.js` | `/admin/shops` |
| `app/admin/part-knowledge/page.js` | `/admin/part-knowledge` |
| `app/admin/seo/page.js` | `/admin/seo` |
| `app/admin/seo-articles/page.js` | `/admin/seo-articles` |
| `app/admin/seo-pages/page.js` | `/admin/seo-pages` |

### 2.2 Next.js API Routes

Located at `app/api/`. All are thin proxy/trigger routes.

| File | URL | Notes |
|---|---|---|
| `app/api/cron/seo-ai-nightly/route.js` | `/api/cron/seo-ai-nightly` | Triggered by `vercel.json` cron — 20 lines |
| `app/api/seo/refresh/route.js` | `/api/seo/refresh` | SEO cache refresh — 19 lines |
| `app/api/seo/registry/route.js` | `/api/seo/registry` | SEO registry read — 19 lines |
| `app/api/seo/registry/upsert/route.js` | `/api/seo/registry/upsert` | Registry upsert — 19 lines |
| `app/api/seo/ai-article/queue/route.js` | `/api/seo/ai-article/queue` | AI article queue trigger — 20 lines |
| `app/api/seo/ai-article/execute/route.js` | `/api/seo/ai-article/execute` | AI article execute — 20 lines |

### 2.3 Shared Components

Located at `frontend/components/`.

#### Root-level (guards + shell chrome)

| File | Lines | Role |
|---|---|---|
| `AdminGuard.jsx` | 42 | Route protection for admin |
| `AppShell.jsx` | 58 | Seller center shell layout |
| `AuthCard.jsx` | 12 | Auth form wrapper |
| `PasswordInput.jsx` | 87 | Reusable password input |
| `PushInit.jsx` | 13 | OneSignal push init |
| `SellerMobileBottomNav.jsx` | 158 | Mobile nav bar for sellers |
| `ShopAddressSelector.jsx` | 121 | Address selection UI |
| `ShopGuard.jsx` | 44 | Route protection for seller center |
| `Sidebar.jsx` | 145 | Seller center desktop sidebar |
| `Topbar.jsx` | 201 | Seller center top bar |

#### `components/pages/` — page-level implementations

| File | Lines | Notes |
|---|---|---|
| `Home.jsx` + `Home.css` | 3063 | Homepage — largest frontend component |
| `ProductDetail.jsx` + `ProductDetail.css` | 1050 | Product detail page |
| `ShopSettings.jsx` | 998 | Seller settings — largest settings component |
| `AdminPartKnowledge.jsx` | 523 | Admin part-knowledge management |
| `AddProduct.jsx` / `ShopAddProduct.jsx` + CSS | 251 each | Dual product add components |
| `ShopAccount.jsx` | 170 | |
| `ShopInsights.jsx` | 125 | |
| `ShopProducts.jsx` | — | |
| `ShopLogin.jsx` | 188 | |
| `ShopRegister.jsx` | 88 | |
| `ShopForgotPassword.jsx` | 66 | |
| `ShopResetPassword.jsx` | 92 | |
| `ShopChangePassword.jsx` | 99 | |
| `AdminShops.jsx` | 120 | |
| `AdminLogin.jsx` | 69 | |
| `AdminForgotPassword.jsx` | 50 | |

**`components/pages/home/`**

- `HomeHeader.jsx`
- `HomeImages.jsx`
- `HomeProductCard.jsx`
- `HomeSearch.jsx`
- `PopularCategoriesBox.jsx`
- `VehicleQuickPanel.jsx`

**`components/pages/products/`**

- `ProductForm.jsx`
- `ProductList.jsx`
- `ProductMobileCard.jsx`
- `ProductMobileList.jsx`
- `ProductsActionsSheet.jsx`
- `ShopProducts.jsx`
- `Product.css`

**`components/pages/shop-settings/`**

| File | Lines |
|---|---|
| `ShopCompletionPanel.jsx` | 134 |
| `ShopMetricsOverview.jsx` | 314 |
| `ShopSeoPreviewPanel.jsx` | 391 |

**`components/pages/hooks/`** (hook colocated with page logic)

- `useListingController.js` — 94 lines

#### `components/popup/`

- `AddProductPopup.jsx`
- `EditProductPopup.jsx`
- `ImportImagePopup.jsx` + CSS
- `ImportProductPopup.jsx`
- `ProductImagePopup.jsx` + CSS
- `ProductPopup.css`

#### `components/products/`

- `ProductFilter.jsx`
- `ProductFilterMobile.jsx`
- `ProductHeatChip.jsx`
- `ProductImageUpload.jsx`
- `ProductTable.jsx`
- `Product.css`
- `product-table.css`

#### `components/push/`

- `BuyerPushPreferences.jsx`
- `BuyerPushPrompt.jsx`
- `ShopPushPrompt.jsx`

#### `components/rfq/` — 24 files — ⚠️ RFQ-CRITICAL

| File | Lines |
|---|---|
| `RfqAssistSuggestions.jsx` | 351 |
| `RfqConversationTimeline.jsx` | 298 |
| `RfqShopInboxChatPane.jsx` | 272 |
| `RfqMessageComposer.jsx` | — |
| `RfqBuyerChatPanel.jsx` | — |
| `RfqBuyerChatHeader.jsx` | — |
| `RfqBuyerShopDrawer.jsx` | — |
| `RfqBuyerShopTabs.jsx` | — |
| `RfqConversationImageGallery.jsx` | — |
| `RfqHistoryEntryLink.jsx` | — |
| `RfqImageLightbox.jsx` | — |
| `RfqImageUpload.jsx` | — |
| `RfqImageUploadSection.jsx` | — |
| `RfqLazyImage.jsx` | — |
| `RfqOtpInput.jsx` | — |
| `RfqSafeMessageText.jsx` | — |
| `RfqShopBuyerDrawer.jsx` | — |
| `RfqShopBuyerList.jsx` | — |
| `RfqShopDispatchSummary.jsx` | — |
| `BuyerHistoryCard.jsx` | — |
| `BuyerHistoryList.jsx` | — |
| `BuyerHistoryLogin.jsx` | — |
| `ShopInboxVehicleFilters.jsx` | — |
| `ZaloOaCtas.jsx` | — |

#### `components/seo/` — 19 files — ⚠️ SEO-CRITICAL

| File | Lines | Notes |
|---|---|---|
| `SeoArticleBlock.jsx` | 543 | Core SEO article renderer |
| `CategorySeoContent.jsx` | 369 | Category SEO content block |
| `SeoListingContent.jsx` | 309 | SEO listing content |
| `SeoArticleEnriched.jsx` | 234 | Enriched article variant |
| `SeoLandingPage.jsx` | 152 | SEO landing page frame |
| `seoArticleBodyEnhance.js` | 387 | Article body enhancement logic |
| `PartKnowledgeSeoPage.jsx` + CSS module | — | Part-knowledge SEO page |
| `FaqPageJsonLd.jsx` | — | JSON-LD for FAQ |
| `OrganizationJsonLd.jsx` | — | JSON-LD for org |
| `ProductJsonLd.jsx` | — | JSON-LD for products |
| `SeoListingProductImage.jsx` | — | |
| `SeoPublicHeader.jsx` | — | |
| `WebSiteJsonLd.jsx` | — | |

CSS: `seo-article-block-shell.css`, `seo-article-card.css`, `seo-article.css`, `seo-article-enriched.css`, `seo-landing.css`

#### `components/shopsite/` — 45 files — ⚠️ STOREFRONT-CRITICAL

| File | Notes |
|---|---|
| `ShopHeader.jsx` | Main storefront header |
| `ShopSidebar.jsx` | Storefront sidebar |
| `ShopTabs.jsx` | Navigation tabs |
| `ShopProductCard.jsx` | Product card for storefront |
| `ShopProductGridState.jsx` | Product grid with loading/empty states |
| `ShopProductsPagination.jsx` | |
| `ShopGallery.jsx` | Image gallery |
| `ShopJsonLd.jsx` | JSON-LD structured data — ⚠️ SEO-CRITICAL |
| `ShopContactCard.jsx` | Contact info card |
| `ShopContactMiniDrawer.jsx` + `Impl` | Contact drawer |
| `ShopFloatingMobileCTA.jsx` | Mobile CTA |
| `ShopQuickRfqLauncher.jsx` | RFQ trigger from storefront — ⚠️ RFQ+STOREFRONT |
| `ShopQuickRfqModal.jsx` | RFQ modal from storefront — ⚠️ RFQ+STOREFRONT |
| `ShopAnalyticsBoot.jsx` | Analytics initialization |
| `StorefrontAnalyticsForwarder.jsx` | Analytics event forwarding |
| `StorefrontOwnerStrip.jsx` | Seller owner banner on storefront |
| `StorefrontSellerShortcut.jsx` | Seller shortcut on storefront |
| `ShopReturnVisitorBanner.jsx` | Returning visitor detection |
| `ShopRecentlyViewed.jsx` | Recently viewed products |
| `ShopLiveActivityStrip.jsx` | Live activity feed strip |
| `ShopSocialProofPills.jsx` | Social proof badges |
| `ShopTrustBadges.jsx` | Trust indicators |
| `ShopTrustedSellerBlock.jsx` | Trusted seller callout |
| `ShopResponseScoreChip.jsx` | Response speed indicator |
| `ShopRichContentRenderer.jsx` | Rich content (TipTap output) |
| `ShopRichEditor.jsx` + CSS | Rich content editor |
| `ShopRichEditorWithPreview.jsx` | Editor with live preview |
| `ShopPolicyEditor.jsx` | Shop policy editing |
| `ShopSection.jsx` | Section wrapper |
| `ShopShareMenu.jsx` | Share menu |
| `ShopSocialButtons.jsx` | Social links |
| `ShopMapVisualBlock.jsx` | Map display |
| `ShopMobileCategories.jsx` | Mobile category nav |
| `ShopMobileFilters.jsx` | Mobile filter drawer |
| `ShopFilters.jsx` | Desktop filters |
| `ShopDirectoryFilters.jsx` | Shop directory filters |
| `ShopImage.jsx` | Storefront image component |
| `ShopIntroClamp.jsx` | Collapsible intro text |
| `ShopWhyChooseUs.jsx` | Why choose us section |
| `ShopCard.jsx` | Directory shop card |
| `FeaturedShops.jsx` | Featured shops block |
| `RelatedShops.jsx` | Related shops block |

#### `components/ui/`

- `AutocompleteInput.jsx`
- `SellerToaster.jsx`

#### `components/vehicle/`

- `VehicleSelector.jsx` + CSS

### 2.4 Custom Hooks

**`frontend/hooks/`** (11 files):

| File | Lines | Domain |
|---|---|---|
| `useRfqConversationMessages.js` | 389 | RFQ |
| `useRfqImageUpload.js` | 332 | RFQ |
| `useProductDraftAutosave.js` | 188 | Seller |
| `useRfqChatImageUpload.js` | 182 | RFQ |
| `useShopInboxList.js` | 239 | RFQ/Seller |
| `useShopInboxSummaryBadge.js` | 114 | RFQ/Seller |
| `useSellerStorefrontUrl.js` | 107 | Storefront/Seller |
| `useStorefrontOwnerState.js` | 101 | Storefront |
| `useShopProductHeat.js` | 118 | Seller |
| `useRfqConversationMarkRead.js` | 120 | RFQ |
| `useRfqHistorySummary.js` | 51 | RFQ |
| `useVehicleSelector.js` | 180 | Marketplace |

**Additional hooks (outside `hooks/`):**

| File | Location |
|---|---|
| `useListingController.js` | `components/pages/hooks/` |
| `useDebouncedValue.js` | `lib/shopsite/` |
| `useShopFilterParams.js` | `lib/shopsite/` |
| `useBuyerPushPrompt.js` | `lib/` |
| `useOneSignalCustomPrompt.js` | `lib/` |

### 2.5 API Client Modules

Located at `frontend/api/`. All are axios-based.

| File | Lines | Covers |
|---|---|---|
| `axiosClient.js` | 21 | Base axios instance + interceptors |
| `shopApi.js` | 38 | Seller center operations |
| `shopPublicPageApi.js` | 47 | Shop public page CRUD |
| `shopRichContentApi.js` | 30 | Rich content editing |
| `productApi.js` | 19 | Product operations |
| `adminApi.js` | 39 | Admin operations |
| `carApi.js` | 18 | Car/vehicle lookups |

### 2.6 Services

Located at `frontend/services/`.

| File | Lines | Notes |
|---|---|---|
| `product.api.js` | 30 | Product fetch service |
| `shopPublic.service.js` | 248 | Shop public data service — largest service |

### 2.7 Lib Modules

Located at `frontend/lib/`.

#### Root lib

| File | Lines | Notes |
|---|---|---|
| `shopHost.js` | 273 | ⚠️ WILDCARD SUBDOMAIN — host classification |
| `config.js` | 53 | Environment config |
| `apexOrigin.js` | 60 | Apex domain resolution |
| `clientJsonCache.js` | 50 | Client-side JSON cache |
| `onesignal.js` | 57 | OneSignal push SDK wrapper |
| `rfqPushRegister.js` | 97 | RFQ push registration |
| `rfqZaloOaUx.js` | 36 | Zalo OA UX helpers |
| `productDetailHref.js` | 23 | Product URL generation |
| `useBuyerPushPrompt.js` | 91 | Buyer push prompt hook |
| `useOneSignalCustomPrompt.js` | 144 | Custom push prompt hook |

#### `lib/auth/`

| File | Lines | Notes |
|---|---|---|
| `safeShopRedirect.js` | 70 | Safe post-auth redirect |
| `sellerOwnerCookie.js` | 145 | Seller session cookie management |

#### `lib/product/`

| File | Lines |
|---|---|
| `getProductDetailCached.js` | 12 |

#### `lib/vehicle/`

| File | Lines |
|---|---|
| `vehicleFilterApi.js` | 120 |

#### `lib/seo/` — 17 modules — ⚠️ SEO-CRITICAL

| File | Lines |
|---|---|
| `productSeoUrl.js` | 306 |
| `categorySeoContent.js` | 425 |
| `dynamicListingSeoComposer.js` | 214 |
| `buildHomeSeoArticle.js` | 230 |
| `homePageTitle.js` | 105 |
| `parseLandingSlug.js` | 202 |
| `vehicleSeoChips.js` | 117 |
| `listingStateEngine.js` | 87 |
| `buildSeoListingContext.js` | 46 |
| `getListingData.js` | 56 |
| `getVehicleSeoPage.js` | 29 |
| `homeListQueryKey.js` | 32 |
| `loadPartSeoPage.server.js` | 27 |
| `parseHomeListingSlug.js` | 55 |
| `siteUrl.js` | 20 |
| `slugify.js` | 34 |
| `buildVehicleSlug.js` | 16 |

#### `lib/rfq/` — 40+ modules — ⚠️ RFQ-CRITICAL

Includes test files (`.test.js`).

| File | Notes |
|---|---|
| `rfqConversationMessages.js` + `.test.js` | Conversation message logic |
| `rfqBuyerDataStable.js` + `.test.js` | Buyer session stability |
| `rfqBuyerDeepLink.js` + `.test.js` | Deep link generation |
| `rfqBuyerEngagement.js` + `.test.js` | Engagement tracking |
| `rfqPartDescription.js` + `.test.js` | Part description parsing |
| `rfqAssistApi.js` | AI assist API calls |
| `rfqAssistAnalytics.js` | Assist analytics |
| `rfqConversationApi.js` | Conversation API calls |
| `rfqConversationConstants.js` | Shared constants |
| `rfqConversationRead.js` | Read state management |
| `rfqConversationScroll.js` | Scroll behavior |
| `rfqConversationUpload.js` | Upload in conversation |
| `rfqCreateValidation.js` | Form validation |
| `rfqDispatchSummary.js` | Dispatch summary display |
| `rfqHistoryAnalytics.js` | History analytics |
| `rfqHistoryApi.js` | History API calls |
| `rfqHistorySession.js` | History session storage |
| `rfqInboxFilters.js` | Inbox filtering |
| `rfqInboxListStable.js` | Stable inbox list |
| `rfqMediaUrl.js` | Media URL resolution |
| `rfqPushDeepOpen.js` | Push notification deep open |
| `rfqPushPreferences.js` | Push preferences |
| `rfqReminderAnalytics.js` | Reminder analytics |
| `rfqRenderDebug.js` | Debug rendering |
| `rfqSafeMessageText.js` | Safe message text |
| `rfqShopDeepLink.js` | Shop-side deep links |
| `rfqShopInboxRow.js` | Inbox row rendering |
| `rfqSubmitBlockReason.js` | Submit blocking reasons |
| `rfqSubmitGate.js` | Submit gate logic |
| `rfqUploadImage.js` | Image upload |
| `rfqViewerSession.js` | Viewer session tracking |
| `sellerQuickReplies.js` | Seller quick reply templates |
| `buyerIntent.js` | Buyer intent signals |

#### `lib/shopsite/` — 18 modules — ⚠️ STOREFRONT-CRITICAL

| File | Lines | Notes |
|---|---|---|
| `buildShopJsonLd.js` | 180 | JSON-LD for storefront SEO |
| `buildShopMetadata.js` | 169 | Next.js metadata for storefront |
| `storefrontVisuals.js` | 213 | Visual asset handling |
| `shopCompletion.js` | 115 | Shop completion scoring |
| `shopSeoReadiness.js` | 120 | SEO readiness scoring |
| `shopTrustBadges.js` | 104 | Trust badge logic |
| `responseSpeedScore.js` | 77 | Response speed calculation |
| `shopsiteAnalytics.js` | 101 | Analytics event tracking |
| `shopSitemapBuilder.js` | 71 | Per-shop sitemap generation |
| `productInventorySignals.js` | 74 | Inventory signal generation |
| `productTrust.js` | 40 | Product trust signals |
| `embedParsers.js` | 102 | Embed URL parsing |
| `recentlyViewed.js` | 93 | Recently viewed local storage |
| `resolveShopZalo.js` | 32 | Zalo ID resolution for shop |
| `normalizeRichHtml.js` | 41 | Rich content HTML normalization |
| `extractIntroImages.js` | 40 | Intro section image extraction |
| `isWildcardStorefrontHost.js` | 39 | ⚠️ WILDCARD SUBDOMAIN check |
| `useDebouncedValue.js` | 18 | Debounce hook |
| `useShopFilterParams.js` | 107 | Filter params hook |

### 2.8 Configuration

| File | Lines | Notes |
|---|---|---|
| `next.config.mjs` | 55 | Next.js config, API rewrites |
| `middleware.js` | 158 | ⚠️ WILDCARD SUBDOMAIN — edge routing |
| `tailwind.config.js` | 12 | |
| `postcss.config.mjs` | 9 | |
| `jsconfig.json` | 9 | `@/*` path alias |
| `vercel.json` | 8 | Cron for SEO AI nightly |
| `package.json` | 34 | |

### 2.9 State Management

- **No** global state library (no Redux, Zustand, Jotai, Recoil, MobX)
- **No** React Context providers
- **Pattern:** Component-local `useState`/`useEffect` + custom hooks
- **Session persistence:** `lib/auth/sellerOwnerCookie.js` (seller), `lib/rfq/rfqHistorySession.js`, `lib/rfq/rfqViewerSession.js` (RFQ buyer)
- **Client cache:** `lib/clientJsonCache.js`

---

## 3. Backend Structure

**Root:** `/var/www/otofine/backend`  
**Runtime:** Node.js, ESM (`"type": "module"`), Express 5  
**Entry:** `server.js`

### 3.1 Entry Point

| File | Notes |
|---|---|
| `server.js` | Primary app entry — mounts all routes |
| `server.js.save` | Backup copy of server file — not active |
| `importCars.js` | One-time car import utility |
| `initDB.js` | DB initialization utility |
| `testDB.js` | DB connection test utility |

### 3.2 Routes

**Top-level (`backend/routes/`) — 25 files:**

| File | Domain |
|---|---|
| `auth.routes.js` | Authentication |
| `address.routes.js` | Addresses |
| `admin.routes.js` | Admin panel |
| `car.routes.js` | Vehicles |
| `carModel.routes.js` | Car models |
| `category.routes.js` | Categories |
| `categorySeo.routes.js` | ⚠️ Category SEO |
| `filter.routes.js` | Product filters |
| `knowledgePublic.routes.js` | Knowledge base (public) |
| `location.routes.js` | Location data |
| `partKnowledge.routes.js` | Part knowledge |
| `product.routes.js` | Products |
| `productCategory.routes.js` | Product categories |
| `productExport.routes.js` | Product export |
| `productImport.routes.js` | Product import |
| `productList.routes.js` | Product listing |
| `publicShop.routes.js` | ⚠️ Public shop (storefront) |
| `push.routes.js` | Push notifications |
| `rfqPush.routes.js` | ⚠️ RFQ push |
| `sellerPublicPage.routes.js` | ⚠️ Seller public page |
| `seo.routes.js` | ⚠️ SEO core |
| `seoPageApi.routes.js` | ⚠️ SEO page API |
| `shop.routes.js` | Seller center |
| `shopMetrics.routes.js` | Shop metrics |
| `vehicleSeo.routes.js` | ⚠️ Vehicle SEO |

**Domain routes:**

| File | Notes |
|---|---|
| `domains/storefrontEvents/storefrontEvents.routes.js` | ⚠️ Storefront analytics events |
| `domains/auth/index.js` | Auth domain routes (mounted via domain entry) |
| `domains/shopPublic/index.js` | ⚠️ Shop public domain routes |

**RFQ module routes (`modules/rfq/routes/`) — 6 files:**

| File | Notes |
|---|---|
| `rfq.public.routes.js` | ⚠️ Buyer-facing RFQ |
| `rfq.shop.routes.js` | ⚠️ Seller-facing RFQ |
| `rfq.conversation.routes.js` | ⚠️ Conversation API |
| `rfq.history.routes.js` | ⚠️ History API |
| `rfq.assist.routes.js` | ⚠️ AI assist API |
| `rfq.admin.routes.js` | RFQ admin API |

### 3.3 Controllers

**Top-level (`backend/controllers/`) — 27 files:**

| File | Domain |
|---|---|
| `adminAuthController.js` | Admin auth |
| `adminController.js` | Admin |
| `authController.js` | Seller auth |
| `address.controller.js` | Addresses |
| `car.controller.js` | Vehicles |
| `carModel.controller.js` | Car models |
| `category.controller.js` | Categories |
| `categorySeo.controller.js` | ⚠️ Category SEO |
| `filter.controller.js` | Filters |
| `knowledgePublic.controller.js` | Knowledge (public) |
| `location.controller.js` | Locations |
| `partKnowledge.controller.js` | Part knowledge |
| `product.controller.js` | Products |
| `productCard.controller.js` | Product card |
| `productCategory.controller.js` | Product categories |
| `ProductDetail.controller.js` | ⚠️ Product detail |
| `productExport.controller.js` | Export |
| `productImport.controller.js` | Import |
| `productList.controller.js` | ⚠️ Product listing |
| `productRelated.controller.js` | Related products |
| `productSearch.controller.js` | ⚠️ Search |
| `rfqPush.controller.js` | ⚠️ RFQ push |
| `seo.controller.js` | ⚠️ SEO |
| `seoPage.controller.js` | ⚠️ SEO pages |
| `shop.controller.js` | Seller center |
| `shopMetrics.controller.js` | Shop metrics |
| `vehicleSeo.controller.js` | ⚠️ Vehicle SEO |

**Domain controllers:**

| File | Domain |
|---|---|
| `domains/auth/controllers/adminAuth.controller.js` | Admin auth |
| `domains/auth/controllers/shopAuth.controller.js` | Seller auth |
| `domains/shopPublic/controllers/cacheDebug.controller.js` | Cache debug |
| `domains/shopPublic/controllers/sellerPublicPage.controller.js` | ⚠️ Seller public page |
| `domains/shopPublic/controllers/shopDirectory.controller.js` | ⚠️ Shop directory |
| `domains/shopPublic/controllers/shopPublic.controller.js` | ⚠️ Shop public |
| `domains/storefrontEvents/storefrontEvents.controller.js` | ⚠️ Storefront analytics |

**RFQ module controllers (`modules/rfq/controllers/`) — 6 files:**

| File |
|---|
| `rfq.admin.controller.js` |
| `rfq.assist.controller.js` |
| `rfq.conversation.controller.js` |
| `rfq.history.controller.js` |
| `rfq.public.controller.js` |
| `rfq.shop.controller.js` |

### 3.4 Services

**Top-level (`backend/services/`) — 34 files + 1 adapter:**

| File | Domain |
|---|---|
| `seoComposer.js` | ⚠️ SEO |
| `categorySeoComposer.js` | ⚠️ SEO |
| `vehicleSeo.service.js` | ⚠️ SEO |
| `seoSlugResolver.service.js` | ⚠️ SEO |
| `seoPage.service.js` | ⚠️ SEO |
| `productList.service.js` | ⚠️ Listing |
| `productSearch.service.js` | ⚠️ Search |
| `productCard.service.js` | Product |
| `product.service.js` | Product |
| `productService.js` | Product (dual — see note) |
| `productDerive.shared.js` | ⚠️ Shared product logic |
| `productRelated.service.js` | Related products |
| `productImage.service.js` | Image handling |
| `productImport.service.js` | Import |
| `productExport.service.js` | Export |
| `productListViewSync.service.js` | List view sync |
| `typesenseProductDocument.service.js` | ⚠️ Search index |
| `typesenseRealtimeSync.service.js` | ⚠️ Search sync |
| `listCache.service.js` | ⚠️ Listing cache |
| `redisCache.service.js` | ⚠️ Redis cache |
| `knowledgeService.js` | Knowledge |
| `knowledgeDataset.service.js` | Knowledge dataset |
| `knowledgeDatasetValidator.service.js` | Knowledge validation |
| `knowledgeSearchIndex.service.js` | Knowledge search index |
| `partKnowledgeMatch.service.js` | Part knowledge matching |
| `partKnowledgeImport.service.js` | Part knowledge import |
| `carService.js` | Cars |
| `carModel.service.js` | Car models |
| `categorySync.service.js` | Category sync |
| `rfqPush.service.js` | ⚠️ RFQ push |
| `rfqR2Upload.service.js` | ⚠️ RFQ file uploads |
| `shopMetrics.service.js` | Shop metrics |
| `onesignalService.js` | Push notifications |
| `zalo.service.js` | Zalo integration |
| `services/adapters/product.adapter.js` | Product data adapter |

> Note: Both `product.service.js` and `productService.js` exist at the top level. These are distinct files — their exact relationship is not determined at structure-audit level.

**Domain services:**

| Domain | Count |
|---|---|
| `domains/auth/services/` | 9 files |
| `domains/shopPublic/services/` | 3 files |

**RFQ module services:** 22 files under `modules/rfq/services/` + additional under `modules/rfq/matching/`

### 3.5 Middlewares

**Global (`backend/middlewares/`) — 3 files:**

| File | Notes |
|---|---|
| `auth.js` | JWT auth check |
| `upload.js` | Multer file upload |
| `uploadExcel.js` | Excel file upload |

**Auth domain (`domains/auth/middlewares/`) — 2 files:**

| File |
|---|
| `auth.middleware.js` |
| `loginRateLimit.middleware.js` |

**Shop public domain (`domains/shopPublic/middlewares/`) — 5 files:**

| File |
|---|
| `enabled.middleware.js` |
| `publicApiRateLimit.middleware.js` |
| `responseCache.middleware.js` |
| `slugCheckRateLimit.middleware.js` |
| `uploadRateLimit.middleware.js` |

**RFQ module (`modules/rfq/middlewares/`) — 8 files:**

| File |
|---|
| `rfqConversationAccess.middleware.js` |
| `rfqConversationRateLimit.middleware.js` |
| `rfqHistory.middleware.js` |
| `rfqMulter.middleware.js` |
| `rfqRateLimit.middleware.js` |
| `rfqSeller.middleware.js` |
| `rfqTouchShopSeen.middleware.js` |
| `rfqViewer.middleware.js` |

### 3.6 Models & Repositories

**Models (`backend/models/`) — 2 files only:**

| File |
|---|
| `product.model.js` |
| `shop.model.js` |

> Most persistence uses raw SQL via `config/db.js` or `config/mssqlPool.js`, not ORM. Models are a thin layer.

**Repositories (`backend/repositories/`) — 4 top-level files:**

| File |
|---|
| `partKnowledge.repository.js` |
| `productCard.repository.js` |
| `productList.repository.js` |
| `productListView.repository.js` |

**Domain repositories:**

- `domains/auth/repositories/` — present
- `domains/shopPublic/repositories/` — present

**RFQ repositories:** 17 files under `modules/rfq/repositories/`

### 3.7 Jobs

Located at `backend/jobs/` — 12 files:

| File | Type | Notes |
|---|---|---|
| `scheduler.js` | Orchestrator | Central job runner |
| `nightlyRebuild.js` | Cron | Nightly data rebuild |
| `syncCar.js` | Sync | Car data sync |
| `syncKnowledge.js` | Sync | Knowledge sync |
| `syncProduct.js` | Sync | Product sync |
| `matchPartKnowledgeProducts.js` | Job | Part-knowledge product matching |
| `rfqAutoWave.worker.js` | Worker | ⚠️ RFQ auto-wave dispatch |
| `rfqBuyerReminder.worker.js` | Worker | ⚠️ RFQ buyer reminder |
| `rfqBuyerReminder.cron.js` | Cron | ⚠️ RFQ buyer reminder schedule |
| `rfqEscalation.worker.js` | Worker | ⚠️ RFQ escalation |
| `rfqEscalation.repair.js` | Cron | ⚠️ RFQ escalation repair |
| `rfqUploadRetention.js` | Cron | ⚠️ RFQ upload cleanup |

### 3.8 Config

Located at `backend/config/` — 7 files:

| File | Notes |
|---|---|
| `db.js` | MySQL primary DB connection |
| `db.engine.js` | DB engine abstraction |
| `mssqlPool.js` | SQL Server connection pool |
| `r2.js` | Cloudflare R2 config |
| `rfq.config.js` | ⚠️ RFQ system config |
| `rfqR2.config.js` | ⚠️ RFQ R2 storage config |
| `typesenseSearchDefaults.js` | Typesense search defaults |

**Domain config:**

- `domains/auth/config/auth.config.js`
- `domains/shopPublic/config/publicShop.config.js`

### 3.9 Utils

**Top-level (`backend/utils/`) — 21 files:**

| File | Domain |
|---|---|
| `seoRouteVariants.js` | ⚠️ SEO |
| `vehicleSeoSlugParser.js` | ⚠️ SEO |
| `buildVehicleSeoArticle.js` | ⚠️ SEO |
| `productSlug.js` | ⚠️ SEO |
| `listingQueryNormalize.js` | Listing |
| `productsTableColumns.server.js` | Products |
| `productCardSubtitle.js` | Products |
| `partKnowledgeProductIds.js` | Part knowledge |
| `partSynonyms.js` | Part knowledge |
| `synonymMap.js` | Part knowledge |
| `normalizeText.js` | Text |
| `textFormat.js` | Text |
| `loaiHangDisplay.js` | Display |
| `categoryKey.js` | Categories |
| `mysqlTransaction.js` | DB |
| `batchUpsert.js` | DB |
| `jsonSafe.js` | Utility |
| `syncKey.js` | Sync |
| `syncLogger.js` | Sync |
| `r2-sdk.js` | R2 storage |
| `resolveShopZalo.js` | Zalo |

**Domain utils:**

- `domains/auth/utils/` — 3 files
- `domains/shopPublic/utils/` — 4 files + 1 test

**RFQ utils:** 24 files under `modules/rfq/utils/`

### 3.10 Migrations

Located at `backend/migrations/` — **52 SQL files**.

Numbered sequence (major categories):

| Range | Area |
|---|---|
| `001–005` | Initial schema, products |
| `006` | Part knowledge seed (MySQL + SQL Server variants) |
| `007–015` | Product scale, categories, search |
| `016–020` | SEO routes, vehicle SEO |
| `021–025` | RFQ initial schema |
| `026–030` | Auth, shop, storefront |
| `031–035` | RFQ conversations, media |
| `036–040` | RFQ escalation, workers |
| `041–045` | Knowledge, part-knowledge |
| Named extras | `add_canonical_columns.sql`, `add_category_visibility.sql`, `create_category_dictionary.sql`, `create_category_dictionary_queue.sql`, `create_product_categories_table.sql` |

Many migrations have MySQL and SQL Server variants (`*_mysql.sql`, `*_sqlserver.sql`).

**Migration runners (`backend/scripts/`):**

- `run-auth-migration.js`
- `run-auth-email-migration.js`
- `run-knowledge-migrations.js`
- `run-public-shopsite-migration.js`
- `run-rfq-migration.js`
- `run-seo-migrations.js`

**Seed scripts:**

- `migrations/006_part_knowledge_seed_mysql.sql`
- `migrations/006_part_knowledge_seed_sqlserver.sql`
- `backend/scripts/seedSeoRoutes.js`

### 3.11 Domain Modules

Located at `backend/domains/`. Three domain modules with DDD-style internal structure:

#### `domains/auth/`

Subdirs: `config/`, `controllers/`, `middlewares/`, `repositories/`, `services/`, `templates/`, `utils/`, `validators/`  
Entry: `index.js`  
Covers: seller login/register, admin login, JWT issuance, email flows

#### `domains/shopPublic/` — ⚠️ STOREFRONT-CRITICAL

Subdirs: `cache/`, `config/`, `controllers/`, `middlewares/`, `observability/`, `ranking/`, `repositories/`, `services/`, `utils/`, `validators/`  
Entry: `index.js`  
Covers: public shop profile API, shop directory, response caching, ranking, rate limiting, slug resolution

#### `domains/storefrontEvents/` — ⚠️ STOREFRONT-CRITICAL

Files: `storefrontEvents.controller.js`, `storefrontEvents.repository.js`, `storefrontEvents.routes.js`  
Covers: storefront analytics event ingestion

### 3.12 RFQ Feature Module

Located at `backend/modules/rfq/`. Self-contained, largest backend submodule.

**Internal structure:**

| Subdir | Contents |
|---|---|
| `assist/` | AI assist logic |
| `controllers/` | 6 controllers |
| `docs/` | Runbook `.md` files |
| `matching/` | Matching algorithms |
| `middlewares/` | 8 middleware files |
| `providers/` | External integrations |
| `queues/` | Queue management |
| `repositories/` | 17 repository files |
| `routes/` | 6 route files |
| `services/` | 22 service files |
| `tests/` | Module tests |
| `utils/` | 24 utility files |

**Entry:** `modules/rfq/index.js`  
**Config:** `config/rfq.config.js`, `config/rfqR2.config.js`

---

## 4. Critical Shared Modules

These modules are used across subsystem boundaries and carry elevated risk if modified:

| Module | Location | Boundary |
|---|---|---|
| `partNameMatcher.js` | `shared/partNameMatcher.js` | Frontend + Backend — only cross-stack shared file |
| `shopHost.js` | `frontend/lib/shopHost.js` | Edge middleware ↔ SSR rendering |
| `isWildcardStorefrontHost.js` | `frontend/lib/shopsite/` | Consumed by `shopHost.js` and middleware |
| `middleware.js` | `frontend/middleware.js` | Edge — subdomain routing decision point |
| `productDerive.shared.js` | `backend/services/productDerive.shared.js` | Named "shared" — likely used by multiple backend services |
| `seoComposer.js` | `backend/services/seoComposer.js` | Used across SEO routes |
| `categorySeoComposer.js` | `backend/services/categorySeoComposer.js` | Used across category + SEO routes |
| `redisCache.service.js` | `backend/services/redisCache.service.js` | Cross-service cache layer |
| `listCache.service.js` | `backend/services/listCache.service.js` | Cross-service listing cache |
| `axiosClient.js` | `frontend/api/axiosClient.js` | Base for all frontend API calls |
| `config/db.js` | `backend/config/db.js` | Primary DB connection — all repositories depend on it |
| `rfqConversationConstants.js` | `frontend/lib/rfq/rfqConversationConstants.js` | Shared constants between RFQ frontend modules |

---

## 5. SEO-Critical Areas

### Frontend

| Area | Files |
|---|---|
| Dynamic SEO slug routing | `app/[slug]/page.js` (231 lines), `app/phu-tung/[slug]/page.js` |
| Product detail canonical URLs | `app/product/[id]/page.js`, `app/p/[id]/page.js` |
| Sitemap generation | `app/sitemap.js` (96 lines) |
| Robots | `app/robots.js` (38 lines) |
| SEO cron API | `app/api/cron/seo-ai-nightly/route.js`, `app/api/seo/*` |
| SEO component library | `components/seo/` — 19 files incl. JSON-LD components |
| SEO lib | `lib/seo/` — 17 modules, `productSeoUrl.js` (306 lines) |
| Storefront SEO | `lib/shopsite/buildShopMetadata.js`, `buildShopJsonLd.js`, `shopSeoReadiness.js`, `shopSitemapBuilder.js` |
| Admin SEO management | `app/admin/seo/`, `app/admin/seo-articles/`, `app/admin/seo-pages/`, `app/admin/part-knowledge/` |
| Static SEO data | `data/seo/seoPagesRegistry.json`, `data/seo/categories/*.json`, `data/seo/cache/` (27 cached files) |
| Vercel cron | `vercel.json` — triggers SEO AI nightly |

### Backend

| Area | Files |
|---|---|
| SEO routes | `routes/seo.routes.js`, `routes/seoPageApi.routes.js`, `routes/categorySeo.routes.js`, `routes/vehicleSeo.routes.js` |
| SEO controllers | `controllers/seo.controller.js`, `controllers/seoPage.controller.js`, `controllers/categorySeo.controller.js`, `controllers/vehicleSeo.controller.js` |
| SEO services | `services/seoComposer.js`, `services/categorySeoComposer.js`, `services/vehicleSeo.service.js`, `services/seoSlugResolver.service.js`, `services/seoPage.service.js` |
| SEO utils | `utils/seoRouteVariants.js`, `utils/vehicleSeoSlugParser.js`, `utils/buildVehicleSeoArticle.js`, `utils/productSlug.js` |
| Seed script | `scripts/seedSeoRoutes.js` |

---

## 6. Storefront-Critical Areas

### Frontend

| Area | Files |
|---|---|
| Subdomain edge routing | `middleware.js` (158 lines) |
| Host classification | `lib/shopHost.js` (273 lines) |
| Wildcard check | `lib/shopsite/isWildcardStorefrontHost.js` (39 lines) |
| Storefront route group | `app/(shopsite)/` — 14 files |
| Storefront UI | `components/shopsite/` — 45 files |
| Storefront lib | `lib/shopsite/` — 18 modules |
| Storefront metadata | `lib/shopsite/buildShopMetadata.js`, `buildShopJsonLd.js` |
| Seller ↔ storefront bridge | `hooks/useSellerStorefrontUrl.js`, `hooks/useStorefrontOwnerState.js`, `StorefrontOwnerStrip.jsx`, `StorefrontSellerShortcut.jsx` |
| Storefront analytics | `StorefrontAnalyticsForwarder.jsx`, `ShopAnalyticsBoot.jsx`, `lib/shopsite/shopsiteAnalytics.js` |
| RFQ entry from storefront | `ShopQuickRfqLauncher.jsx`, `ShopQuickRfqModal.jsx` |

### Backend

| Area | Files |
|---|---|
| Shop public domain | `domains/shopPublic/` — full domain (cache, ranking, middleware, repositories, services) |
| Storefront events domain | `domains/storefrontEvents/` — event ingestion |
| Public shop routes | `routes/publicShop.routes.js`, `routes/sellerPublicPage.routes.js` |
| Shop public controllers | `domains/shopPublic/controllers/shopPublic.controller.js`, `shopDirectory.controller.js`, `sellerPublicPage.controller.js` |
| Response caching | `domains/shopPublic/middlewares/responseCache.middleware.js` |
| Ranking | `domains/shopPublic/ranking/` |

---

## 7. RFQ-Critical Areas

### Frontend

| Area | Files |
|---|---|
| RFQ routes | `app/rfq/` — 10 pages (buyer + seller inbox + deep link) |
| RFQ components | `components/rfq/` — 24 files |
| RFQ hooks | `hooks/useRfqConversationMessages.js` (389), `useRfqImageUpload.js` (332), `useShopInboxList.js` (239), `useRfqChatImageUpload.js` (182), `useRfqConversationMarkRead.js` (120), `useShopInboxSummaryBadge.js` (114), `useRfqHistorySummary.js` (51) |
| RFQ lib | `lib/rfq/` — 40+ modules |
| RFQ push | `lib/rfqPushRegister.js`, `lib/rfq/rfqPushDeepOpen.js`, `lib/rfq/rfqPushPreferences.js` |
| RFQ Zalo | `lib/rfqZaloOaUx.js`, `components/rfq/ZaloOaCtas.jsx` |
| Storefront RFQ entry | `components/shopsite/ShopQuickRfqLauncher.jsx`, `ShopQuickRfqModal.jsx` |

### Backend

| Area | Files |
|---|---|
| RFQ module | `modules/rfq/` — self-contained: 6 routes, 6 controllers, 22 services, 17 repositories, 8 middlewares, 24 utils |
| RFQ push | `routes/rfqPush.routes.js`, `controllers/rfqPush.controller.js`, `services/rfqPush.service.js` |
| RFQ R2 uploads | `services/rfqR2Upload.service.js`, `config/rfqR2.config.js` |
| RFQ workers | `jobs/rfqAutoWave.worker.js`, `jobs/rfqBuyerReminder.worker.js`, `jobs/rfqEscalation.worker.js` |
| RFQ crons | `jobs/rfqBuyerReminder.cron.js`, `jobs/rfqEscalation.repair.js`, `jobs/rfqUploadRetention.js` |
| RFQ config | `config/rfq.config.js` |

---

## 8. Wildcard Subdomain Infrastructure

The storefront subdomain system routes `*.otofine.com` (or equivalent) to the shop storefront.

### Edge Layer (Next.js middleware)

| File | Role |
|---|---|
| `frontend/middleware.js` (158 lines) | Entry point — classifies incoming host, rewrites to `(shopsite)` route group |
| `frontend/lib/shopHost.js` (273 lines) | Host classification logic — determines if request is wildcard storefront, main domain, demo, etc. |
| `frontend/lib/shopsite/isWildcardStorefrontHost.js` (39 lines) | Predicate for wildcard host detection |

### SSR / Storefront Rendering

| File | Role |
|---|---|
| `frontend/next.config.mjs` | API rewrites — likely includes backend proxy rules |
| `app/(shopsite)/shops/[slug]/layout.js` (201 lines) | Per-shop layout with metadata |
| `lib/shopsite/buildShopMetadata.js` (169 lines) | Generates Next.js metadata per shop |
| `lib/shopsite/buildShopJsonLd.js` (180 lines) | JSON-LD per shop |

### Backend

| File | Role |
|---|---|
| `domains/shopPublic/` | All public shop API — slug resolution, profile, products |
| `domains/shopPublic/middlewares/slugCheckRateLimit.middleware.js` | Rate limiting on slug lookups |
| `domains/shopPublic/middlewares/responseCache.middleware.js` | Response-level caching for public shop API |
| `domains/shopPublic/config/publicShop.config.js` | Public shop configuration |
| `routes/publicShop.routes.js` | Public shop API routes |
| `routes/sellerPublicPage.routes.js` | Seller public page routes |

---

## 9. Admin Groundwork

### Frontend

| Route | File | Notes |
|---|---|---|
| `/admin` | `app/admin/page.js` (5 lines) | Entry — likely redirect |
| `/admin/login` | `app/admin/login/page.js` (5 lines) | |
| `/admin/forgot-password` | `app/admin/forgot-password/page.js` (5 lines) | |
| `/admin/shops` | `app/admin/shops/page.js` (10 lines) | Shop management |
| `/admin/part-knowledge` | `app/admin/part-knowledge/page.js` (12 lines) | |
| `/admin/seo` | `app/admin/seo/page.js` (27 lines) | SEO management |
| `/admin/seo-articles` | `app/admin/seo-articles/page.js` (31 lines) | Article management |
| `/admin/seo-pages` | `app/admin/seo-pages/page.js` (33 lines) | Page management |

**Guard:** `components/AdminGuard.jsx` (42 lines)  
**Page implementations:** `components/pages/AdminLogin.jsx`, `AdminForgotPassword.jsx`, `AdminShops.jsx`, `AdminPartKnowledge.jsx` (523 lines)

### Backend

| File | Notes |
|---|---|
| `routes/admin.routes.js` | Admin API routes |
| `controllers/adminController.js` | Admin operations |
| `controllers/adminAuthController.js` | Admin auth (top-level) |
| `domains/auth/controllers/adminAuth.controller.js` | Admin auth (domain) |

> Both `controllers/adminAuthController.js` and `domains/auth/controllers/adminAuth.controller.js` exist. Exact division of responsibility is not determined at structure-audit level.

---

## 10. Likely Dangerous Coupling Areas

These are structural observations only. No refactoring is proposed.

### A. Dual Product Service Files

`backend/services/product.service.js` and `backend/services/productService.js` both exist at the top level. Any modification to product service logic requires understanding which file is authoritative for which callers.

### B. Dual Admin Auth Controllers

`backend/controllers/adminAuthController.js` (top-level) and `backend/domains/auth/controllers/adminAuth.controller.js` (domain) both exist. It is unclear at structure level whether both are mounted in `server.js` or one supersedes the other.

### C. Dual Product Detail Routes

`app/product/[id]/page.js` and `app/p/[id]/page.js` both exist with identical line counts (52 lines each). These are likely canonical + short URL pair. Any change to product detail SEO metadata or page logic may need to be applied to both.

### D. `middleware.js` Is a Single Point of Failure

`frontend/middleware.js` (158 lines) is the sole entry point for all wildcard subdomain routing decisions. It imports `lib/shopHost.js` (273 lines). Any failure here affects all storefront subdomains.

### E. `shopHost.js` + `isWildcardStorefrontHost.js` Coupling

`lib/shopHost.js` and `lib/shopsite/isWildcardStorefrontHost.js` are tightly coupled to the subdomain routing logic. They cross `lib/` and `lib/shopsite/` module boundaries. Changes to domain configuration (e.g. adding a TLD) require coordinated updates across both files and `middleware.js`.

### F. RFQ Push Service Split

RFQ push notifications are split across `routes/rfqPush.routes.js` + `controllers/rfqPush.controller.js` + `services/rfqPush.service.js` (top-level) and `modules/rfq/` (module-level). Push-related RFQ changes span both the top-level structure and the module.

### G. SEO Slug Resolution Spans Multiple Layers

SEO slug handling touches: `app/[slug]/page.js` → `lib/seo/parseLandingSlug.js` (202 lines) → backend `routes/seo.routes.js` → `services/seoComposer.js` + `services/seoSlugResolver.service.js`. Any change to SEO URL structure propagates across frontend routing, frontend lib, and multiple backend services.

### H. `Home.jsx` Size

`components/pages/Home.jsx` is 3063 lines — the largest single component in the frontend. It likely contains significant listing, search, SEO, and vehicle filter logic in a single file.

### I. Storefront ↔ RFQ Entry Point

`components/shopsite/ShopQuickRfqLauncher.jsx` and `ShopQuickRfqModal.jsx` are the integration points between the storefront system and the RFQ system. Changes to RFQ submission flow or storefront layout affect both subsystems at these components.

### J. `backend/data/` JSON Datasets

`backend/data/knowledge/` and `backend/data/part-knowledge/` (30+ batch JSON files) are large static datasets committed to the repository. They are consumed by sync jobs (`syncKnowledge.js`, `matchPartKnowledgeProducts.js`). Their in-repo presence creates a coupling between dataset updates and deployments.
