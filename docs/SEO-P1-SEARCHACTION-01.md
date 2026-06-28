# SEO-P1-SEARCHACTION-01

**Mode:** AUDIT FIRST → IMPLEMENT ONLY IF JUSTIFIED  
**Audit date:** 2026-06-28  
**Site:** https://otofine.com  
**Outcome:** **KEEP** — no source changes (Google does not recommend removal)

---

## 1. Google guidance summary

### Official status of Sitelinks Search Box / SearchAction

| Source | Statement |
|--------|-----------|
| [Farewell, Sitelinks Search Box](https://developers.google.com/search/blog/2024/10/sitelinks-search-box) (John Mueller, 2024-10-21) | Google **removed the sitelinks search box visual element** from Search results globally, effective **2024-11-21**. |
| Same blog post | **"While you can remove sitelinks search box structured data from your site, there's no need to do so."** |
| Same blog post | **"Unsupported structured data like this won't cause issues in Search, and won't trigger errors in Search Console reports."** |
| Same blog post | **Site names** continue to use a variation of **`WebSite` structured data**, which **remains supported**. |
| [Search Central documentation updates](https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox) changelog (2024-11-29) | **Removed** sitelinks search box documentation; archived `nositelinkssearchbox` rule. Reason: **"The sitelinks search box feature is no longer available in Google Search results."** |

### Classification (per Google only)

| Question | Answer |
|----------|--------|
| Recommended today for Google rich results? | **No** — feature retired |
| Deprecated? | **Yes** — feature and docs removed |
| Must remove markup? | **No** — Google explicitly says no need |
| Harmful if kept? | **No** — Google says no Search issues / no SC errors |
| Still used by Google Search? | **Ignored** for sitelinks search box (post Nov 2024) |

**Conclusion:** SearchAction is **optional legacy markup**. Google’s current guidance is **neutral on removal** and **discourages removal as unnecessary**, not **mandates removal**.

---

## 2. Current implementation

### STEP 1 — Every SearchAction location

| File | SearchAction? | Notes |
|------|---------------|-------|
| `frontend/components/seo/WebSiteJsonLd.jsx` | **YES** — sole source | `potentialAction` → `SearchAction` |
| `frontend/components/seo/OrganizationJsonLd.jsx` | No | Organization only |
| `frontend/app/layout.js` | Indirect | Renders `<WebSiteJsonLd />` globally |
| JSON-LD generators elsewhere | **None found** | Grep across repo: only `WebSiteJsonLd.jsx` |
| Metadata generators | **None** | SearchAction not in `generateMetadata` |
| Structured data helpers | **None** | Product/FAQ/Breadcrumb separate components |

**Total SearchAction emitters:** **1 file** (`WebSiteJsonLd.jsx`).

---

### STEP 2 — Generated WebSite schema (production, 2026-06-28)

Live homepage JSON-LD (Googlebot fetch):

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Otofine",
  "url": "https://otofine.com",
  "description": "Nền tảng tìm mua phụ tùng ô tô đúng xe, minh bạch giá, kết nối cửa hàng trên toàn quốc.",
  "inLanguage": "vi-VN",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://otofine.com?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Otofine",
    "url": "https://otofine.com"
  }
}
```

Source (`WebSiteJsonLd.jsx`):

```javascript
potentialAction: {
  "@type": "SearchAction",
  target: {
    "@type": "EntryPoint",
    urlTemplate: `${absoluteUrl("/")}?q={search_term_string}`,
  },
  "query-input": "required name=search_term_string",
},
```

**Note:** `absoluteUrl("/")` returns origin without trailing slash → live `urlTemplate` is `https://otofine.com?q=…` (matches production).

Separate blocks on same page: `Organization` JSON-LD, `FAQPage` JSON-LD (homepage only) — **no duplicate WebSite**.

---

### STEP 3 — Robots verification

**Source:** `frontend/app/robots.js` → served at `https://otofine.com/robots.txt`

```
User-Agent: *
Allow: /
Allow: /phu-tung-
Disallow: /xe/
Disallow: /rfq/
Disallow: /product/
Disallow: /shop/
Disallow: /admin/
Disallow: /api/
Disallow: /search/
Disallow: /*?q=*
Disallow: /*?pagenumber=*
Disallow: /*?*
Sitemap: https://otofine.com/sitemap.xml
```

| URL pattern | Blocked? |
|-------------|----------|
| `https://otofine.com/?q=toyota` | **Yes** — matches `Disallow: /*?q=*` and `Disallow: /*?*` |
| `https://otofine.com?q=toyota` | **Yes** — matches `Disallow: /*?*` |
| `https://otofine.com/search/` | **Yes** — explicit `Disallow: /search/` |

Per [Google robots.txt specification](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt), `*` wildcard rules apply to URL paths including query strings.

**Conflict confirmed:** SearchAction advertises a search URL template that robots.txt declares **non-crawlable**.

---

## 4. Conflict analysis

| Dimension | Analysis |
|-----------|----------|
| **Historical purpose** | SearchAction existed to power **sitelinks search box** in SERP — requires crawlable search results URL. |
| **Current Google behavior** | Feature **removed** (Nov 2024). Google **does not render** sitelinks search box from this markup. |
| **Robots vs markup** | Technically inconsistent: markup points to `?q=` URLs; robots blocks all `?` URLs. |
| **Google’s stated impact** | Unsupported markup **“won’t cause issues in Search”** even when feature retired ([blog](https://developers.google.com/search/blog/2024/10/sitelinks-search-box)). |
| **Crawl budget** | Robots disallow of `?q=` is **intentional** ([faceted navigation guidance](https://developers.google.com/search/docs/crawling-indexing/crawl-management/faceted-navigation)) — unrelated to whether JSON-LD block exists. |
| **Practical benefit if kept** | None for Google rich results; possible minor value for non-Google consumers of schema.org (not in audit scope). |
| **Practical harm if kept** | **None documented by Google** for Search indexing/ranking. |

**Key insight:** The robots conflict mattered when Google **crawled** the search target to validate sitelinks search box eligibility. That validation path is **obsolete** after feature removal. Keeping markup does **not** override robots.txt or force crawling of `?q=` URLs.

---

## 5. Decision

### **KEEP** SearchAction (no code change)

### Evidence matrix

| Criterion (from brief) | Finding |
|------------------------|---------|
| Still beneficial for Google Search? | **No** — feature retired |
| Robots conflict acceptable? | **Yes for Search** — Google ignores unsupported markup; disallow unchanged |
| Google clearly recommends REMOVE? | **No** — Google says **“no need to do so”** |
| Google clearly recommends KEEP? | **Neutral** — optional; not harmful |
| Provides practical benefit today? | **No** for Google SERP features |
| Conflicts with robots guidance? | **Historical yes; current Search impact: none per Google** |

### Rationale

Per task rule: **“If Google documentation does NOT clearly recommend removing SearchAction, DO NOT remove it.”**

Google’s official blog ([Farewell, Sitelinks Search Box](https://developers.google.com/search/blog/2024/10/sitelinks-search-box)) explicitly states removal is **optional** and **unnecessary**. That is **not** a recommendation to remove.

Removing `potentialAction` would:

- **Not** improve rankings or rich results (feature already gone)
- **Not** resolve a Google-documented Search error (none expected)
- **Risk** unnecessary churn to a global layout JSON-LD block
- **Require** keeping `WebSite` schema anyway (site names support)

**Optional future cleanup (out of scope):** If Otofine later adopts a **crawlable** dedicated search path (e.g. `/search/` allowed in robots), SearchAction could be **updated** — but today `/search/` is also disallowed, so neither keep nor remove fixes search URL crawlability.

---

## 6. Files changed

**None.** Implementation step skipped — REMOVE not justified under Google’s official guidance.

---

## 7. Regression

Not applicable (no code changes).

If SearchAction were removed in future, verify:

- [ ] `WebSite` JSON-LD still valid (`@type`, `name`, `url`)
- [ ] `Organization` JSON-LD unchanged
- [ ] No duplicate `@type: WebSite` blocks
- [ ] `npm run build` PASS
- [ ] Rich Results Test / schema validator — no errors on homepage

---

## 8. Rollback

Not applicable.

---

## Appendix — Decision summary

```
DECISION:     KEEP
CONFIDENCE:   95%
GOOGLE CITE:  https://developers.google.com/search/blog/2024/10/sitelinks-search-box
              "there's no need to do so" / "won't cause issues in Search"
ROBOTS:       /?q=* blocked (intentional); conflict moot for retired feature
FILES:        0 changed
```
