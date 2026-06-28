# GSC-MONITORING-PLAYBOOK-01

**Date:** 2026-06-22  
**Mode:** Read-only — no production code changes  
**Scope:** Long-term Google Search Console monitoring for Otofine post sitemap partition  
**Baseline sitemap (live):** [`sitemap-partition-autoscale-implement-01.md`](sitemap-partition-autoscale-implement-01.md)

---

## Executive summary

Otofine now exposes a **four-group sitemap index** on apex (`otofine.com`). GSC monitoring should mirror that structure: track **submitted vs indexed** at the **sitemap-group** level first, then drill into **namespace** using URL-pattern rules below.

| Priority | What to watch | Why |
|----------|---------------|-----|
| **P0** | Marketplace union parity (12,010 URLs) vs GSC “Discovered from sitemaps” | Detect sitemap regressions after deploys |
| **P0** | Products index rate | Largest URL family (~61% of marketplace); direct revenue surface |
| **P1** | Location namespace cluster | Weaker internal link graph; thinner inventory gates |
| **P1** | Shop subdomain index rate vs apex `sitemap-shops.xml` | Canonical owner is subdomain; apex aggregate is discovery aid |
| **P2** | Redirect / noindex / soft-404 spikes | Early signal of sunset, governance, or canonical bugs |

**GSC property recommendation**

| Property | Submit | Monitor |
|----------|--------|---------|
| **Domain** `otofine.com` (preferred) | `https://otofine.com/sitemap.xml` | All apex + subdomain URLs in one view |
| **URL prefix** `https://otofine.com/` | Same sitemap index | Marketplace groups only |
| **Per-shop URL prefix** `https://{slug}.otofine.com/` | `{slug}.otofine.com/sitemap.xml` (optional) | Shop tier INDEX shops with material traffic |

A single URL-prefix property on apex **cannot** fully report shop subdomain indexing. Use **Domain property** for executive dashboards, or supplement with per-shop properties for top shops.

---

## Current sitemap architecture (monitoring anchors)

```
https://otofine.com/sitemap.xml          ← submit this in GSC
├─ sitemap-products.xml                  ← 7,385 URLs (baseline)
├─ sitemap-marketplace-core.xml          ← 2,922 URLs
├─ sitemap-marketplace-location.xml      ← 1,703 URLs
└─ sitemap-shops.xml                     ← 469 URLs (shop SEO landings, subdomain hosts)
```

**Marketplace union (parity target):** products + core + location = **12,010** URLs.

---

## Dashboard layout (recommended)

### Dashboard A — Sitemap group health (weekly)

| Sitemap child | Submitted | Indexed | Index rate % | WoW Δ indexed | MoM Δ indexed | Status |
|---------------|----------:|--------:|-------------:|--------------:|--------------:|--------|
| `sitemap-products.xml` | | | | | | |
| `sitemap-marketplace-core.xml` | | | | | | |
| `sitemap-marketplace-location.xml` | | | | | | |
| `sitemap-shops.xml` | | | | | | |
| **Marketplace union** | **12,010** | | | | | |

*Source:* GSC → **Sitemaps** (per-child discovery counts) + **Pages** → filter “Indexed” with URL pattern / export.

### Dashboard B — Namespace ROI (monthly)

| Namespace | Sitemap group | Submitted | Indexed | Index % | Est. clicks (28d) | Clicks / indexed URL | Status |
|-----------|---------------|----------:|--------:|--------:|------------------:|---------------------:|--------|
| … | … | | | | | | |

*Source:* GSC **Performance** export joined to namespace classifier (regex below) in Sheets/Looker.

### Dashboard C — Coverage exceptions (weekly)

| GSC status | Count | WoW Δ | Top namespace affected | Owner |
|------------|------:|------:|------------------------|-------|
| Indexed | | | | |
| Discovered – currently not indexed | | | | |
| Crawled – currently not indexed | | | | |
| Duplicate | | | | |
| Redirect | | | | |
| Excluded by noindex | | | | |
| Soft 404 | | | | |

---

## Step 1 — Inventory mapping

### Code namespace reference

Marketplace code uses `NAMESPACE` in `frontend/lib/seo/urlGovernance.js`. Audit/playbook labels map as follows:

| Playbook label | Code `NAMESPACE` | Sitemap group |
|----------------|------------------|---------------|
| PRODUCT | `PRODUCT` | products |
| CATEGORY | `CATEGORY` | marketplace-core |
| BRAND (brand-only) | `VEHICLE` (brand slug only) | marketplace-core |
| BRAND_VEHICLE / model tree | `VEHICLE` (brand + model) | marketplace-core |
| BMY (single year) | `VEHICLE_YEAR` | marketplace-core |
| BMY_RANGE | `VEHICLE_YEAR_RANGE` | marketplace-core |
| CATEGORY_BRAND | `CATEGORY_BRAND` | marketplace-core |
| CBM | `CBM` | marketplace-core |
| CBMY_RANGE | `CATEGORY_BRAND_VEHICLE_YEAR_RANGE` | marketplace-core |
| LOCATION | `LOCATION` | marketplace-location |
| CATEGORY_LOCATION | `CATEGORY_LOCATION` | marketplace-location |
| BRAND_LOCATION | `BRAND_LOCATION` | marketplace-location |
| BRAND_VEHICLE_LOCATION | `BRAND_VEHICLE_LOCATION` | marketplace-location |
| CATEGORY_BRAND_LOCATION | `CATEGORY_BRAND_LOCATION` | marketplace-location |
| CATEGORY_BRAND_VEHICLE_LOCATION | `CATEGORY_BRAND_VEHICLE_LOCATION` | marketplace-location |
| BMY_RANGE_LOCATION | `BRAND_VEHICLE_YEAR_RANGE_LOCATION` | marketplace-location |
| CBMY_RANGE_LOCATION | `CATEGORY_BRAND_VEHICLE_YEAR_RANGE_LOCATION` | marketplace-location |
| SHOP_* | `SHOP_NAMESPACE.*` | shops |
| Homepage | (static) | marketplace-core |

**Sitemap gate thresholds** (submitted URLs only — pages below gate are never submitted):

| Namespace | Min products | Notes |
|-----------|-------------:|-------|
| PRODUCT | 1 (always) | All public PDPs |
| CATEGORY | 2 | |
| VEHICLE / BRAND | 1 | Brand-only + brand-model |
| VEHICLE_YEAR / BMY | 10 | Single-year pages |
| VEHICLE_YEAR_RANGE | 10 | |
| CATEGORY_BRAND | 5 | |
| CBM | 2 | |
| CBMY_RANGE | 2 | |
| LOCATION | 10 + sellers | Requires `sellerCount > 0` |
| CATEGORY_LOCATION | 5 | |
| BRAND_LOCATION | 10 | |
| BRAND_VEHICLE_LOCATION | 10 | |
| CATEGORY_BRAND_LOCATION | 5 | |
| CATEGORY_BRAND_VEHICLE_LOCATION | 5 | |
| BMY_RANGE_LOCATION | 2 | |
| CBMY_RANGE_LOCATION | 2 | |

---

### PRODUCTS → `PRODUCT`

| Field | Value |
|-------|-------|
| **Sitemap** | `sitemap-products.xml` |
| **Host** | `https://otofine.com` |
| **Baseline submitted** | 7,385 |

**URL pattern**

| Rule | Pattern / example |
|------|-------------------|
| Canonical PDP | `https://otofine.com/{part-slug}-{id}` |
| Example | `/ang-ten-duoi-ca-kia-sedona-2014-2020-96210a9000swp-108` |
| Heuristic regex | `^https://otofine\.com/[^/]+-\d{3,}$` |
| Not in this group | `/phu-tung-*` listings, `/p/*` redirect stubs |

**GSC filter:** Pages → Custom regex → `otofine\.com/[^/]+-\d+$`

---

### MARKETPLACE_CORE

| Namespace | URL pattern | Example |
|-----------|-------------|---------|
| **Homepage** | `https://otofine.com/` | `/` |
| **CATEGORY** | `/{category-slug}` — no `phu-tung-` prefix, no `-tai-` | `/ma-phanh-truoc-o-to` |
| **BRAND** (`VEHICLE` brand-only) | `/phu-tung-{brand}` — no model segment after brand | `/phu-tung-toyota` |
| **BRAND_VEHICLE** (`VEHICLE` + model) | `/phu-tung-{brand}-{model}` — no year, no `-tai-` | `/phu-tung-toyota-vios` |
| **BMY** (`VEHICLE_YEAR`) | `/phu-tung-{brand}-{model}-{year}` single 4-digit year | `/phu-tung-toyota-vios-2016` |
| **CATEGORY_BRAND** | `/{category}-{brand}` — no `-tai-` | `/can-truoc-toyota` |
| **CBM** | `/{category}-{brand}-{model}` or category-led CBM path | `/ban-ep-toyota-vios` |
| **BMY_RANGE** | `/phu-tung-{brand}-{model}-{from}-{to}` | `/phu-tung-toyota-innova-2006-2016` |
| **CBMY_RANGE** | `/{category}-{brand}-{model}-{from}-{to}` — no `-tai-` | `/bom-xang-toyota-camry-2007-2012` |

| Field | Value |
|-------|-------|
| **Sitemap** | `sitemap-marketplace-core.xml` |
| **Baseline submitted** | 2,922 (includes homepage) |
| **Negative filter** | Exclude `-tai-` (→ location group); exclude PDP numeric tail |

**Classifier priority (apply in order):** homepage → CBMY_RANGE (4 segments + years) → BMY_RANGE (`phu-tung-*-*-*-`) → BMY (single year) → BRAND_VEHICLE → BRAND → CATEGORY_BRAND → CBM → CATEGORY.

---

### MARKETPLACE_LOCATION

All location URLs contain **`-tai-{location-slug}`**.

| Namespace | URL pattern | Example |
|-----------|-------------|---------|
| **LOCATION** | `/phu-tung-o-to-tai-{loc}` or location hub slug | `/phu-tung-o-to-tai-ha-noi` |
| **CATEGORY_LOCATION** | `/{category}-tai-{loc}` | `/ma-phanh-o-to-tai-ha-noi` |
| **BRAND_LOCATION** | `/phu-tung-{brand}-tai-{loc}` | `/phu-tung-toyota-tai-ha-noi` |
| **BRAND_VEHICLE_LOCATION** | `/phu-tung-{brand}-{model}-tai-{loc}` | `/phu-tung-toyota-vios-tai-ha-noi` |
| **CATEGORY_BRAND_LOCATION** | `/{category}-{brand}-tai-{loc}` | `/can-truoc-toyota-tai-ha-noi` |
| **CATEGORY_BRAND_VEHICLE_LOCATION** | `/{category}-{brand}-{model}-tai-{loc}` | `/ket-nuoc-toyota-camry-tai-ha-noi` |
| **BMY_RANGE_LOCATION** | `/phu-tung-{brand}-{model}-{from}-{to}-tai-{loc}` | `/phu-tung-toyota-innova-2006-2016-tai-ha-noi` |
| **CBMY_RANGE_LOCATION** | `/{category}-{brand}-{model}-{from}-{to}-tai-{loc}` | `/bom-xang-toyota-camry-2007-2012-tai-ha-noi` |

| Field | Value |
|-------|-------|
| **Sitemap** | `sitemap-marketplace-location.xml` |
| **Baseline submitted** | 1,703 |
| **Master filter** | URL contains `-tai-` on `otofine.com` |

**Classifier priority:** CBMY_RANGE_LOCATION → BMY_RANGE_LOCATION → CATEGORY_BRAND_VEHICLE_LOCATION → CATEGORY_BRAND_LOCATION → BRAND_VEHICLE_LOCATION → BRAND_LOCATION → CATEGORY_LOCATION → LOCATION hub.

---

### SHOPS

Shop SEO URLs live on **shop subdomains** but are **discovered via apex** `sitemap-shops.xml`. Canonical owner is always `{slug}.otofine.com`.

| Playbook label | Code namespace | URL pattern | Example |
|----------------|----------------|-------------|---------|
| **SHOP_CATEGORY** | `SHOP_CATEGORY` | `https://{slug}.otofine.com/{category-slug}` | `phutungoto355.otofine.com/can-truoc-o-to` |
| **SHOP_BRAND** | `SHOP_BRAND` | `https://{slug}.otofine.com/phu-tung-{brand}` | `…/phu-tung-toyota` |
| **SHOP_BRAND_VEHICLE** | `SHOP_VEHICLE` | `https://{slug}.otofine.com/phu-tung-{brand}-{model}` | `…/phu-tung-toyota-vios` |
| **SHOP_CATEGORY_BRAND** | `SHOP_CATEGORY_BRAND` | `https://{slug}.otofine.com/{category}-{brand}` | `…/can-truoc-toyota` |
| **SHOP_CATEGORY_BRAND_VEHICLE** | `SHOP_CATEGORY_VEHICLE` | `https://{slug}.otofine.com/{category}-{brand}-{model}` | `…/can-truoc-toyota-vios` |
| **SHOP_BMY_RANGE** | `SHOP_VEHICLE_YEAR_RANGE` | `https://{slug}.otofine.com/phu-tung-{brand}-{model}-{from}-{to}` | `…/phu-tung-toyota-innova-2006-2016` |
| **SHOP_CBMY_RANGE** | `SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE` | `https://{slug}.otofine.com/{category}-{brand}-{model}-{from}-{to}` | `…/can-truoc-toyota-vios-2014-2020` |

| Field | Value |
|-------|-------|
| **Sitemap** | `sitemap-shops.xml` |
| **Baseline submitted** | 469 |
| **Excluded from apex shops sitemap** | HOME, ABOUT, CONTACT, COLLECTION (still in per-shop subdomain sitemap) |
| **Shop index tier gate** | `INDEX` tier required for `index,follow` (≥20 products, logo, description, phone, province) |

**GSC filter:** `https://[^.]+\.otofine\.com/` (Domain property) or filter Performance by hostname.

---

## Step 2 — KPI framework

Track these metrics **per sitemap group** and **per namespace** every reporting cycle.

| KPI | Definition | Source | Frequency |
|-----|------------|--------|-----------|
| **Submitted URLs** | Count in child sitemap (curl or internal validator) | Sitemap XML / deploy artifact | Weekly |
| **GSC discovered** | URLs “Discovered” via that sitemap | GSC → Sitemaps | Weekly |
| **Indexed URLs** | Pages with “Indexed” status matching group filter | GSC → Pages (export) | Weekly |
| **Index rate %** | `Indexed ÷ Submitted × 100` | Calculated | Weekly |
| **Valid index rate %** | `Indexed ÷ GSC discovered × 100` | Calculated; flags crawl lag | Weekly |
| **Growth WoW** | `(Indexedₜ − Indexedₜ₋₇) ÷ Indexedₜ₋₇` | Sheet trend | Weekly |
| **Growth MoM** | `(Indexedₜ − Indexedₜ₋₃₀) ÷ Indexedₜ₋₃₀` | Sheet trend | Monthly |
| **Clicks (28d)** | Organic clicks to group | GSC Performance | Monthly |
| **CTR** | Clicks ÷ Impressions | GSC Performance | Monthly |
| **Avg position** | Weighted by impressions | GSC Performance | Monthly |
| **Clicks per indexed URL** | Clicks ÷ Indexed | ROI proxy | Monthly |

### Group-level baseline targets (first 90 days)

| Sitemap group | Submitted baseline | Index rate — healthy band |
|---------------|-------------------:|----------------------------|
| Products | 7,385 | 50–80% |
| Marketplace core | 2,922 | 40–70% |
| Marketplace location | 1,703 | 25–50% |
| Shops | 469 | 30–60% |

---

## Step 3 — Namespace KPI thresholds (GREEN / YELLOW / RED)

Index rate = `Indexed URLs ÷ Submitted URLs` for that namespace (rolling 28-day average once stable).

### PRODUCTS — `PRODUCT`

| Status | Index rate | Action |
|--------|------------|--------|
| GREEN | > 70% | Maintain; watch PDP template performance |
| YELLOW | 40–70% | Sample 20 URLs: canonical, stock, duplicate PDP |
| RED | < 40% | Audit product visibility SQL, canonical migration, crawl budget |

### MARKETPLACE_CORE namespaces

| Namespace | GREEN | YELLOW | RED | Notes |
|-----------|-------|--------|-----|-------|
| **CATEGORY** | > 55% | 30–55% | < 30% | Weak crawl-nav on many pages |
| **BRAND** (`VEHICLE`) | > 65% | 40–65% | < 40% | Strong link graph |
| **BRAND_VEHICLE** | > 60% | 35–60% | < 35% | |
| **BMY** (`VEHICLE_YEAR`) | > 45% | 25–45% | < 25% | High gate (≥10 products) |
| **CATEGORY_BRAND** | > 50% | 30–50% | < 30% | |
| **CBM** | > 60% | 40–60% | < 40% | Good internal links (Đời xe) |
| **BMY_RANGE** | > 55% | 35–55% | < 35% | |
| **CBMY_RANGE** | > 50% | 30–50% | < 30% | Large raw inventory vs gated |
| **Homepage** | Indexed (1 URL) | — | Not indexed | P0 incident |

### MARKETPLACE_LOCATION namespaces

| Namespace | GREEN | YELLOW | RED | Notes |
|-----------|-------|--------|-----|-------|
| **LOCATION** | > 45% | 25–45% | < 25% | Needs sellers + products |
| **CATEGORY_LOCATION** | > 40% | 20–40% | < 20% | No dedicated crawl sections |
| **BRAND_LOCATION** | > 45% | 25–45% | < 25% | |
| **BRAND_VEHICLE_LOCATION** | > 40% | 22–40% | < 22% | |
| **CATEGORY_BRAND_LOCATION** | > 38% | 20–38% | < 20% | |
| **CATEGORY_BRAND_VEHICLE_LOCATION** | > 35% | 18–35% | < 18% | Largest raw inventory bucket |
| **BMY_RANGE_LOCATION** | > 35% | 18–35% | < 18% | |
| **CBMY_RANGE_LOCATION** | > 35% | 18–35% | < 18% | |

### SHOPS namespaces

| Namespace | GREEN | YELLOW | RED | Notes |
|-----------|-------|--------|-----|-------|
| **SHOP_CATEGORY** | > 55% | 35–55% | < 35% | Tier INDEX shops only indexable |
| **SHOP_BRAND** | > 50% | 30–50% | < 30% | |
| **SHOP_BRAND_VEHICLE** | > 50% | 30–50% | < 30% | |
| **SHOP_CATEGORY_BRAND** | > 48% | 28–48% | < 28% | |
| **SHOP_CATEGORY_BRAND_VEHICLE** | > 45% | 25–45% | < 25% | |
| **SHOP_BMY_RANGE** | > 42% | 22–42% | < 22% | |
| **SHOP_CBMY_RANGE** | > 40% | 20–40% | < 20% | |

---

## Step 4 — Coverage diagnostics

| GSC status | Likely root causes (Otofine) | Recommended actions |
|------------|------------------------------|---------------------|
| **Indexed** | Healthy — gates passed, self-canonical, `index,follow` | Log baseline; track clicks/URL |
| **Discovered – currently not indexed** | Crawl budget queue; new URLs; weak internal links (esp. location); quality threshold | Check link-graph coverage; fetch as Google; add internal links; wait 2–4 weeks for new deploys |
| **Crawled – currently not indexed** | Thin content; duplicate intent; low product count near gate; location pages without seller diversity | Review inventory counts; merge/deprecate low-value URLs; improve on-page uniqueness |
| **Duplicate** | Apex `/shops/{slug}/seo/*` vs subdomain (expected noindex mirror); www vs non-www; trailing slash | Confirm canonical on subdomain owner; verify apex mirror `noindex` |
| **Redirected** | Shop sunset (`SHOP_SUNSET_REDIRECT_ENABLED`); legacy `/phu-tung/` → canonical; closed shop → apex | Map redirect target; ensure 301 not chains; update sitemap if shop closed |
| **Excluded by noindex** | Shop tier `CRAWL` or `BLOCK`; apex shop mirrors; admin/search paths | Verify `getShopIndexTier`; remove from `sitemap-shops.xml` if BLOCK |
| **Soft 404** | Empty listing after inventory drop; shop deactivated; broken slug | Cross-check product count vs gate; fix 404 or noindex+sitemap removal |
| **Blocked by robots.txt** | `/xe/`, `/product/`, query params disallowed | Expected for legacy paths; ensure sitemap URLs not disallowed |
| **Not found (404)** | Stale sitemap row; product delisted; shop slug change | Run parity validator; remove from sitemap on next generation |

---

## Step 5 — Location SEO monitoring (special section)

Location is a **cross-cutting cluster** — 1,703 submitted URLs (~14% of marketplace union) with **weaker internal linking** than core (no dedicated year-range sections on location pages per indexation audit).

### Namespace watchlist (priority order)

| Priority | Namespace | Baseline submitted (approx.) | Expected index rate (90d) |
|----------|-----------|-------------------------------:|----------------------------:|
| P1 | CBMY_RANGE_LOCATION | ~651 gated | 30–45% |
| P1 | CATEGORY_BRAND_VEHICLE_LOCATION | ~54 gated | 25–40% |
| P2 | BMY_RANGE_LOCATION | ~380 gated | 30–45% |
| P2 | CATEGORY_LOCATION | ~280 gated | 35–50% |
| P2 | CATEGORY_BRAND_LOCATION | ~211 gated | 35–50% |
| P3 | BRAND_VEHICLE_LOCATION | ~107 gated | 35–50% |
| P3 | BRAND_LOCATION | ~19 gated | 40–55% |
| P3 | LOCATION hub | ~1 | 50–70% |

### Location-specific weekly checks

1. Index rate for `sitemap-marketplace-location.xml` vs core (flag if location &lt; ½ of core rate).
2. Sample 5 URLs per location namespace — confirm `-tai-` canonical, `index,follow`, HTTP 200.
3. Compare **raw inventory** vs **gated sitemap** (large compression = normal; growth in raw without gated growth = future opportunity).
4. Track “Discovered – not indexed” share for `-tai-` URLs — if &gt; 60% after 60 days, escalate link-graph investment.

---

## Step 6 — Shop SEO monitoring

### Separate tracking dimensions

| Dimension | What to measure | Source |
|-----------|-----------------|--------|
| **Apex discovery** | URLs in `sitemap-shops.xml` | Sitemap + GSC sitemaps |
| **Subdomain indexation** | Indexed URLs on `{slug}.otofine.com` | Domain GSC property |
| **Shop tier mix** | INDEX / CRAWL / BLOCK counts | Admin + `getShopIndexTier` audit script |
| **Closure impact** | URLs removed from sitemap; redirect volume | GSC Redirect + sunset logs |

### Shop index tiers (code)

| Tier | Robots | In `sitemap-shops.xml`? | GSC expectation |
|------|--------|---------------------------|-----------------|
| **INDEX** | `index,follow` | Yes (SEO landings) | Should index |
| **CRAWL** | `noindex,follow` | May appear if eligible at SEO level | Discovered, excluded by noindex |
| **BLOCK** | `noindex,nofollow` | No (`projectShopSitemap` returns `[]`) | Not in sitemap |

### Shop closure & sunset

| Event | System behavior | GSC monitoring |
|-------|-----------------|----------------|
| Shop closed / lifecycle ended | Middleware sunset redirect to apex (`resolveShopLifecycle`) | Redirect spike on subdomain URLs |
| Taxonomy sunset | `buildShopSunsetRedirectUrl` → apex collection or listing | Old shop URLs → apex canonical |
| Product sunset | `resolveShopProductSunsetRedirectUrl` → apex PDP | Product URLs on dead subdomain redirect |

**Weekly:** Compare shop count in directory vs prior week; if shop removed, confirm URLs drop out of `sitemap-shops.xml` within 24h (revalidate 300s).

---

## Step 7 — Weekly operating procedure (every Monday)

### Checklist

| # | Task | Pass criteria | Owner |
|---|------|---------------|-------|
| 1 | **Sitemap health** | `curl -s https://otofine.com/sitemap.xml` returns index with 4 children; each child HTTP 200 | SEO ops |
| 2 | **Submitted counts** | products + core + location = 12,010 ± deploy delta; record in sheet | SEO ops |
| 3 | **GSC sitemaps** | All children “Success”; no parse errors | SEO ops |
| 4 | **Coverage summary** | Log indexed / discovered-not-indexed / crawled-not-indexed per group | SEO ops |
| 5 | **Crawl stats** | Response time &lt; 500ms p95; no 5xx spike on sitemap routes | Eng |
| 6 | **Manual spot checks** | 2 URLs per sitemap group: 200, self-canonical, `index,follow` | SEO ops |
| 7 | **Redirect checks** | Sample 3 shop subdomain URLs for INDEX shop — no unexpected 301 | SEO ops |
| 8 | **Canonical checks** | PDP + CBMY_RANGE + location — `rel=canonical` matches URL bar | SEO ops |
| 9 | **Alert review** | Triage any RED/YELLOW namespace from dashboard | SEO lead |
| 10 | **Deploy correlation** | If frontend deploy in last 7d, run `validate-sitemap-partition-implement-01.mjs` | Eng |

### Weekly log template

```
Week of: ___________
Products:        submitted ___  indexed ___  rate ___%  WoW ___%
Core:            submitted ___  indexed ___  rate ___%  WoW ___%
Location:        submitted ___  indexed ___  rate ___%  WoW ___%
Shops:           submitted ___  indexed ___  rate ___%  WoW ___%
Incidents: ___________
Actions: ___________
```

---

## Step 8 — Monthly executive report template

```
OTOFINE SEO — MONTHLY GSC REPORT
Period: [Month YYYY]
Prepared by: ___________

────────────────────────────────────────
1. EXECUTIVE SUMMARY
────────────────────────────────────────
• Marketplace indexed URLs: ___ / 12,010 submitted (___%)
• MoM indexed growth: ___%
• Organic clicks (apex marketplace): ___
• Top risk: ___________
• Top win: ___________

────────────────────────────────────────
2. SITEMAP GROUP SCORECARD
────────────────────────────────────────
| Group                  | Submitted | Indexed | Rate | MoM Δ | Status |
|------------------------|----------:|--------:|-----:|------:|--------|
| Products               |           |         |      |       | G/Y/R  |
| Marketplace Core       |           |         |      |       | G/Y/R  |
| Marketplace Location   |           |         |      |       | G/Y/R  |
| Shops                  |           |         |      |       | G/Y/R  |

────────────────────────────────────────
3. TOP GAINERS (indexed URL growth, clicks)
────────────────────────────────────────
| Namespace | +Indexed | +Clicks | Driver hypothesis |
|-----------|----------|---------|-------------------|
|           |          |         |                   |

────────────────────────────────────────
4. TOP DECLINERS
────────────────────────────────────────
| Namespace | −Indexed | −Clicks | Root cause | Action |
|-----------|----------|---------|------------|--------|
|           |          |         |            |        |

────────────────────────────────────────
5. COVERAGE EXCEPTIONS
────────────────────────────────────────
| Status              | Count | MoM Δ | Notes |
|---------------------|------:|------:|-------|
| Soft 404            |       |       |       |
| Redirect            |       |       |       |
| Excluded by noindex |       |       |       |
| Duplicate           |       |       |       |

────────────────────────────────────────
6. ACTIONS NEXT MONTH
────────────────────────────────────────
| Priority | Action | Owner | ETA |
|----------|--------|-------|-----|
| P0       |        |       |     |
| P1       |        |       |     |
```

---

## Step 9 — Alert rules

### Alert matrix

| Alert ID | Condition | Severity | Channel | Response SLA |
|----------|-----------|----------|---------|--------------|
| **ALT-01** | Group index rate drops **> 10 pp** WoW | High | Slack + email | 24h |
| **ALT-02** | Submitted URLs change **> 20%** WoW without planned release | High | Slack | 24h |
| **ALT-03** | Marketplace union ≠ 12,010 (± deploy) | Critical | Pager | 4h |
| **ALT-04** | Any child sitemap HTTP ≠ 200 | Critical | Pager | 1h |
| **ALT-05** | Soft 404 count **> 0** on sitemap URLs | High | Slack | 48h |
| **ALT-06** | Redirect count on apex marketplace URLs **+15%** WoW | Medium | Email | 72h |
| **ALT-07** | “Excluded by noindex” **+10%** WoW on products/core | High | Slack | 24h |
| **ALT-08** | GSC sitemap parse error | Critical | Pager | 1h |
| **ALT-09** | Location index rate **&lt; 50%** of core rate for 4 consecutive weeks | Medium | Email | Next sprint |
| **ALT-10** | Shop INDEX-tier shop drops to CRAWL/BLOCK | Medium | Email | 72h |
| **ALT-11** | `sitemap-shops.xml` count drops **> 30%** WoW | Medium | Slack | 48h (check closures) |
| **ALT-12** | Clicks/indexed URL for PRODUCTS drops **> 25%** MoM | Medium | Email | Monthly review |

### Implementation options (no code in this deliverable)

| Method | Effort | Fit |
|--------|--------|-----|
| **Google Sheets** + weekly GSC export + conditional formatting | Low | Start here |
| **GSC API** → scheduled script → Slack webhook | Medium | ALT-01–07 automation |
| **Search Console Insights** email + manual sheet | Low | Backup |
| **BigQuery export** (GSC bulk) + Looker Studio | High | Executive dashboard |

### Suggested Looker Studio pages

1. Sitemap group scorecard (4 tiles + trend lines)
2. Namespace heatmap (index rate × submitted)
3. Coverage funnel (submitted → discovered → indexed)
4. Location vs core comparison
5. Shop subdomain hostname breakdown

---

## ROI measurement by URL family

| URL family | Primary ROI metric | Secondary metrics |
|------------|-------------------|-------------------|
| **Products** | Organic clicks → PDP → RFQ/contact | Indexed SKU count, avg position on part-name queries |
| **CBM / CBMY_RANGE** | Clicks on high-intent “part + car” queries | Internal link CTR to PDPs |
| **CATEGORY / BRAND** | Top-of-funnel impressions | Crawl depth to CBM pages |
| **Location** | Local intent impressions (city + part) | Seller diversity per hub |
| **Shops** | Branded shop queries on subdomain | INDEX-tier shop count |

**Formula:** `ROI index = (Clicks_28d ÷ Indexed_URLs) × Index_rate` — rank namespaces monthly; invest link-graph/engineering in bottom quartile with high submitted counts.

---

## Related artifacts

| Document | Purpose |
|----------|---------|
| [`sitemap-partition-autoscale-implement-01.md`](sitemap-partition-autoscale-implement-01.md) | Sitemap architecture + baselines |
| [`seo-indexation-readiness-audit-01.md`](seo-indexation-readiness-audit-01.md) | Namespace readiness samples |
| [`seo-linkgraph-boost-phase-02.md`](seo-linkgraph-boost-phase-02.md) | Internal link coverage context |
| `frontend/scripts/validate-sitemap-partition-implement-01.mjs` | Weekly parity automation |

---

## First-week bootstrap (if GSC not yet configured)

1. Verify **Domain property** for `otofine.com`.
2. Submit `https://otofine.com/sitemap.xml` only (do not submit children separately).
3. Record Day-0 submitted counts from implement audit (table above).
4. Export Pages → all indexed URLs → classify 100-row sample against namespace regex; calibrate thresholds.
5. Schedule Monday weekly log + first monthly report at Day 30.

**No production code changes required for this playbook.**
