# SEO-INDEXATION-READINESS-AUDIT-01

**Date:** 2026-06-25  
**Mode:** Read-only — no application code changes  
**Environment:** Production stack via `127.0.0.1:3000` / `127.0.0.1:5000`  
**Apex sitemap:** `https://otofine.com/sitemap.xml` — **12,010 URLs** (live count)

---

## Executive summary

| Area | Ready for aggressive indexing? |
|------|-------------------------------|
| **Marketplace apex** (`otofine.com/sitemap.xml`) | **Conditional YES** — core namespaces render 200, self-canonical, `index,follow`; sampled batch 30/30 pass |
| **Shop subdomains** (`{slug}.otofine.com/sitemap.xml`) | **Per-shop YES** when shop tier = `INDEX`; apex `/shops/{slug}` mirrors are correctly `noindex` |
| **Whole platform in one GSC property** | **NO** — shops are canonical owners on subdomains; marketplace and shops need separate GSC coverage |

**Final verdict (Step 7):** Submit **`https://otofine.com/sitemap.xml`** to GSC **today** — **YES**, with monitoring. Do **not** treat this as permission for blind “aggressive” indexing of all 12k URLs without watching crawl stats; ~18% of `CBMY_RANGE` sitemap rows are below product gates and location-heavy namespaces still lack dedicated internal-link sections.

---

## Methodology

For each namespace, one live sample URL was taken from `/api/seo/sitemap-data` inventory (marketplace) or `phutungoto355` shop sitemap (shop). Probed:

| Signal | How measured |
|--------|----------------|
| HTTP 200 | `fetch()` status |
| Canonical self | `rel=canonical` pathname === request path (shop: subdomain `Host` header) |
| Robots indexable | no `noindex` in `<meta name="robots">` |
| In sitemap | URL present in apex or shop `sitemap.xml` |
| Internal link reachable | Page renders link-graph section (`listing-year-range-links`, **Đời xe**, **Liên kết liên quan**) or vehicle/category crawl nav |

**Readiness score (0–100):** 20 pts each for 200 / canonical / indexable / in-sitemap / crawl-nav.

**Indexability estimate:** High ≥80, Medium 60–79, Low &lt;60.

**Code namespace map** (audit labels → implementation):

| Audit label | Code `NAMESPACE` / `SHOP_NAMESPACE` |
|-------------|-------------------------------------|
| BRAND | `VEHICLE` (brand-only `/phu-tung-{brand}`) |
| CBM | `CBM` |
| BMY_RANGE | `VEHICLE_YEAR_RANGE` |
| CBMY_RANGE | `CATEGORY_BRAND_VEHICLE_YEAR_RANGE` |
| BMY_RANGE_LOCATION | `BRAND_VEHICLE_YEAR_RANGE_LOCATION` |
| CBMY_RANGE_LOCATION | `CATEGORY_BRAND_VEHICLE_YEAR_RANGE_LOCATION` |
| SHOP_BRAND_VEHICLE | `SHOP_VEHICLE` |
| SHOP_CATEGORY_BRAND_VEHICLE | `SHOP_CATEGORY_VEHICLE` |
| SHOP_BMY_RANGE | `SHOP_VEHICLE_YEAR_RANGE` |
| SHOP_CBMY_RANGE | `SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE` |

---

## Step 1 — Marketplace namespaces

| Namespace | Sample path | 200 | Canon | Index | Sitemap | Crawl links | Score | Index est. |
|-----------|-------------|-----|-------|-------|---------|-------------|-------|------------|
| CATEGORY | `/ma-phanh-truoc-o-to` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **High** |
| BRAND | `/phu-tung-toyota` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| CATEGORY_BRAND | `/can-truoc-toyota` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **High** |
| CBM | `/ban-ep-toyota-vios` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| BMY_RANGE | `/phu-tung-toyota-innova-2006-2016` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| CBMY_RANGE | `/bom-xang-toyota-camry-2007-2012` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| LOCATION | `/phu-tung-o-to-tai-ha-noi` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| CATEGORY_LOCATION | `/ma-phanh-o-to-tai-ha-noi` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **High** |
| BRAND_LOCATION | `/phu-tung-toyota-tai-ha-noi` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| BRAND_VEHICLE_LOCATION | `/phu-tung-toyota-vios-tai-ha-noi` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| CATEGORY_BRAND_LOCATION | `/can-truoc-toyota-tai-ha-noi` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **High** |
| CATEGORY_BRAND_VEHICLE_LOCATION | `/ket-nuoc-toyota-camry-tai-ha-noi` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **High** |
| BMY_RANGE_LOCATION | `/phu-tung-toyota-innova-2006-2016-tai-ha-noi` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **Medium** |
| CBMY_RANGE_LOCATION | `/bom-xang-toyota-camry-2007-2012-tai-ha-noi` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **Medium** |

**Batch check:** 30 random marketplace sitemap listing URLs — **30/30** returned 200, self-canonical, `index,follow`.

**Inventory scale (sitemap-data):**

| Bucket | Count |
|--------|------:|
| `cbmyRangeListings` | 3,665 |
| `cbmyRange` gated (≥2 products) | 651 |
| `categoryBrandVehicleLocationListings` | 6,476 |
| `categoryBrandLocationListings` | 4,063 |
| `brandVehicleYearRangeLocationListings` | 662 |
| Apex sitemap URLs | 12,010 |

**Link-graph coverage (post LINKGRAPH-BOOST-PHASE-02):**

| Target | Coverage |
|--------|----------|
| `CBMY_RANGE` (gated inventory) | **100%** HTML-reachable |
| `CBMY_RANGE` (full sitemap inventory) | **17.8%** (governance ceiling) |
| Location-tagged pages | No dedicated year-range / sibling sections |

---

## Step 2 — Shop namespaces (`phutungoto355`, subdomain owner)

Probed with `Host: phutungoto355.otofine.com` (canonical owner). Apex `/shops/phutungoto355/seo/...` correctly returns **`noindex,follow`** and canonical → subdomain — **by design**.

| Namespace | Sample path | 200 | Canon | Index | Sitemap | Crawl links | Score | Index est. |
|-----------|-------------|-----|-------|-------|---------|-------------|-------|------------|
| SHOP_CATEGORY | `/ma-phanh-o-to` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **High** |
| SHOP_BRAND | `/phu-tung-kia` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| SHOP_BRAND_VEHICLE | `/phu-tung-kia-sedona` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| SHOP_CATEGORY_BRAND | `/ma-phanh-kia` | ✅ | ✅ | ✅ | ✅ | ❌ | 80 | **High** |
| SHOP_CATEGORY_BRAND_VEHICLE | `/ma-phanh-kia-sedona` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| SHOP_BMY_RANGE | `/phu-tung-kia-sedona-2014-2020` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |
| SHOP_CBMY_RANGE | `/ma-phanh-kia-sedona-2014-2020` | ✅ | ✅ | ✅ | ✅ | ✅ | 100 | **High** |

**Shop sitemap:** 224 URLs (`phutungoto355`). Year-range sample 25/25 `index,follow` on subdomain.

**Link-graph:** `SHOP_*_YEAR_RANGE` HTML crawl coverage **73.9%** (68/92 year-range URLs in shop sitemap) after Phase-02.

**Shop index tier:** `phutungoto355` has 2,807 products, phone, province → qualifies for **`INDEX`** tier (`shopIndexGovernance.js`).

---

## Step 3 — Cross-cutting signals

| Signal | Marketplace | Shop (subdomain) |
|--------|-------------|------------------|
| `robots.txt` | `Allow: /`, `Sitemap: https://otofine.com/sitemap.xml` | Same apex file; subdomain uses own `sitemap.xml` |
| `robots.txt` blocks | `/shop/`, `/shops/` on apex | Intentional — discovery via subdomain |
| Homepage | `index,follow`, canonical `https://otofine.com` | N/A |
| Sitemap HTTP | 200 | 200 |
| Sitemap ↔ runtime (sampled) | CBMY 40/40 indexable | Year-range 25/25 indexable |

---

## Step 4 — Blockers

### P0 — Fix or accept before scaling crawl budget

| ID | Blocker | Impact |
|----|---------|--------|
| P0-1 | **Sitemap inventory ≫ gated inventory** for `CBMY_RANGE` (3,665 listed vs 651 gated) | Submitting full sitemap invites Google to crawl URLs with thin/eligible mismatch; risks “Crawled – currently not indexed” noise |
| P0-2 | **~82% of `CBMY_RANGE` sitemap rows fail product gate** | Hard ceiling ~18% full-inventory HTML link coverage without governance change |
| P0-3 | **GSC property scope** | Apex sitemap does not include shop subdomain URLs; aggressive indexing requires **per-shop** URL-prefix properties + shop `sitemap.xml` |

### P1 — Monitor closely after submit

| ID | Blocker | Impact |
|----|---------|--------|
| P1-1 | **Location namespaces lack dedicated crawl sections** | `*_LOCATION`, `CATEGORY_*_LOCATION` rely on global nav; orphan risk for long-tail location landings |
| P1-2 | **CATEGORY / CATEGORY_BRAND lack year-range nav** | Score 80 not 100; discovery depends on header/footer + search |
| P1-3 | **Shop apex mirrors** | `/shops/{slug}/...` must stay `noindex` (verified); misconfigured CDN/host could leak duplicates |
| P1-4 | **Sitemap vs strict runtime count drift (shop)** | Prior `SHOP-SITEMAP-VERIFY-01` flagged combo URLs where sitemap count ≠ runtime `noindex`; re-check after catalog changes |
| P1-5 | **Shop INDEX tier bar** | Shops below 20 products / missing logo+description+phone+province stay `CRAWL` (`noindex,follow`) while still in shop sitemap |

### P2 — Quality / ops

| ID | Blocker | Impact |
|----|---------|--------|
| P2-1 | **TTFB on shop collection** | Historical ~18s on `/phu-tung-o-to` hurts crawl efficiency |
| P2-2 | **Special-character brands** | e.g. Mercedes-Benz slug rendering (flagged in prior shop verify) |
| P2-3 | **12k URL single sitemap** | Consider sitemap index split if GSC reports “couldn’t fetch” under load |

---

## Step 5 — Google readiness score (per namespace)

Average readiness from live samples:

| Tier | Namespaces | Avg score |
|------|------------|-----------|
| **Tier A (100)** | BRAND, CBM, BMY_RANGE, CBMY_RANGE, LOCATION, BRAND_LOCATION, BRAND_VEHICLE_LOCATION, SHOP_BRAND, SHOP_BRAND_VEHICLE, SHOP_CATEGORY_BRAND_VEHICLE, SHOP_BMY_RANGE, SHOP_CBMY_RANGE | 100 |
| **Tier B (80)** | CATEGORY, CATEGORY_BRAND, all `*_LOCATION` except top vehicle/brand hubs, SHOP_CATEGORY, SHOP_CATEGORY_BRAND | 80 |

**Platform readiness index:** **~88/100** for sampled owner URLs that pass governance.

---

## Step 6 — Expected indexability

| Namespace group | Sitemap | Links | Canonical | Robots | Expected Google uptake |
|-----------------|---------|-------|-----------|--------|------------------------|
| Core marketplace (CATEGORY, BRAND, CBM, BMY_RANGE, CBMY gated) | High | High (post boost) | High | High | **High** |
| Location marketplace | High | Medium | High | High | **Medium** |
| CBMY_RANGE (ungated tail) | In sitemap | Low | High | High* | **Low** |
| Shop subdomain (INDEX tier) | High | High (post boost) | High | High | **High** |
| Shop subdomain (CRAWL tier) | May be in sitemap | Medium | High | noindex | **Low** (crawl only) |
| Apex shop mirrors | Not in apex sitemap | — | Points to subdomain | noindex | **None** (correct) |

\*Sampled gated CBMY URLs indexable; ungated not fully sampled but likely thin.

---

## Step 7 — Final verdict

### Can Otofine safely submit `sitemap.xml` to GSC today?

## **YES** — for the **marketplace apex** property (`https://otofine.com/`)

**Conditions:**

1. Submit **`https://otofine.com/sitemap.xml`** only to the **apex** GSC property.
2. Register **each active shop** as `https://{slug}.otofine.com/` and submit **`https://{slug}.otofine.com/sitemap.xml`** separately.
3. Treat “aggressive indexing” as **phased**, not “index all 12,010 immediately”:
   - Watch GSC → Pages → “Crawled – currently not indexed” for `CBMY_RANGE` tail and location URLs.
   - Expect **Medium** uptake on location long-tail until link-graph Phase-03 (location cross-links).
4. Do **not** expect shop URLs to index via apex sitemap — they are not included.

### **NO** — if the question means “one sitemap, full aggressive index of marketplace + all shops today without per-shop GSC setup.”

---

## Recommended GSC actions (post-submit)

1. Apex: Coverage baseline for ~12k URLs; alert on &gt;5% soft-404 or 5xx.
2. Weekly: Compare “Indexed” vs sitemap count by namespace bucket (manual slice in GSC URL filter).
3. Shops: Only push aggressive crawl for shops with `INDEX` tier; hold `CRAWL` tier shops at `noindex` until qualification.
4. Monitor `CBMY_RANGE` “not indexed” cluster — if &gt;30% of impressions target gated URLs, consider sitemap emission alignment (future phase, out of scope here).

---

*Audit performed read-only. No code, sitemap, governance, canonical, or redirect changes were made.*
