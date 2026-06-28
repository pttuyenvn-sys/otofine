# SEO-P1-H1-VERIFY-01

**Mode:** AUDIT FIRST → IMPLEMENT ONLY IF JUSTIFIED  
**Audit date:** 2026-06-28  
**Site:** https://otofine.com  
**Outcome:** **PASS** — no source changes

---

## 1. Google guidance (Search Central only)

### Does Google require an SSR `<h1>`?

| Question | Official answer |
|----------|-----------------|
| Exactly one H1 required? | **Not stated as a ranking/indexing requirement** in Search Central SEO docs. [Title link guidance](https://developers.google.com/search/docs/appearance/title-link) recommends making the **main title clear** and mentions using **“the first visible `<h1>` element”** as a **best practice** for title-link clarity — not a hard requirement. |
| Any heading required? | Google uses **heading elements** as **one of several sources** for title links (along with `<title>`, visual title, og:title, etc.). Missing headings do not automatically block indexing. |
| Multiple H1 allowed? | [Title link doc](https://developers.google.com/search/docs/appearance/title-link) warns about **“no clear main title”** when **multiple equally prominent headings** exist — a quality/clarity issue, not a ban on multiple H1s. |
| URL / title / H1 must match? | **No.** [December 2022 SEO office hours](https://developers.google.com/search/help/office-hours/2022/december): *“they don't need to be exactly the same.”* |
| Missing H1 harmful? | **Not explicitly.** Primary indexing signal for titles: **`<title>` element** — Google’s [2021 title generation update](https://developers.google.com/search/blog/2021/08/update-to-generating-page-titles) states HTML title tags are used **“more than 80% of the time.”* |
| JavaScript-rendered H1? | [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics): Googlebot **queues pages for rendering**, executes JS in headless Chromium, and **“uses the rendered HTML to index the page.”** SSR/pre-rendering is **recommended** for speed and non-JS bots — **not mandatory** for Google Search if content appears after render. |

### Summary

Google **does not require** an SSR `<h1>` on product pages. It **recommends** clear main titles (often an H1) and **can use** post-render headings. Otofine must be judged on **whether Google Search has a real indexing problem**, not on third-party “one H1 in raw HTML” folklore.

---

## 2. Current implementation

### Source location

| File | Role |
|------|------|
| `frontend/app/[slug]/page.js` | Server route for product URLs; `generateMetadata()` sets `<title>`, canonical, robots; renders `<ProductJsonLd />` + `<ProductDetail productId={…} />` |
| `frontend/components/pages/ProductDetail.jsx` | **`"use client"`** — H1 at line 626: `<h1 className="detail-title">{titleText}</h1>` |
| `frontend/components/seo/ProductJsonLd.jsx` | Server JSON-LD; `Product.name` from identity (SSR) |

### Rendering flow

```
Server ([slug]/page.js)
  ├─ generateMetadata → <title>, canonical, og:*  (SSR in <head>)
  ├─ ProductJsonLd → Product + BreadcrumbList       (SSR in <body>)
  └─ ProductDetail (client boundary)
        └─ useEffect → fetch /api/product/:id
              └─ setData → render <h1 class="detail-title">
```

**H1 is client-only:** depends on client fetch after hydration. Product data is already resolved on the server for metadata/JSON-LD but **not** passed into an SSR heading.

---

## 3. SSR verification (curl / Googlebot, no browser JS)

### Sample set (23 URLs)

| Group | Count | Selection method |
|-------|-------|------------------|
| Random products | 10 | `random.sample` from 7,385 sitemap URLs |
| Sitemap-priority (proxy) | 5 | First 5 URLs in `sitemap-products.xml` |
| Category diversity | 5 | One product per top slug prefix (`ang`, `bac`, `den`, `giam`, `loc`, …) |
| OEM | 3 | Slugs containing `oem` |
| Aftermarket-style | 2 | Non-OEM samples |

Full list stored in audit run; examples:

- `https://otofine.com/loc-gio-dieu-hoa-toyota-altis-2006-2016-8713906080-6537`
- `https://otofine.com/bugi-kia-k3-2015-1884611070oem-234`
- `https://otofine.com/giam-xoc-truoc-phai-toyota-vios-2019-2023-485100dd00tki-6207`

### Results — raw HTML (`Googlebot/2.1` UA)

| Metric | Result |
|--------|--------|
| Pages tested | **23 / 23** |
| `<h1>` count | **0** on every page |
| `<h2>`–`<h4>` in raw HTML | **0** on sample deep-dive |
| `detail-title` class in raw HTML | **Absent** |
| `detail-page` class in raw HTML | **Present** (client shell boundary) |
| `BAILOUT_TO_CLIENT_SIDE_RENDERING` | **Absent** on products |
| `<title>` in `<head>` | **Present** on all (server metadata) |
| Product name in HTML body | **Present** (RSC/stream payload text) |
| JSON-LD `Product.name` | **Present** in SSR |

**Previous audit confirmed:** SSR lacks `<h1>` — **still true** on 23/23 samples.

### Representative SSR signals (product 6537)

```
<title>Lọc gió điều hòa Toyota Altis 2006-2016 | Otofine</title>
JSON-LD Product.name: "Lọc gió điều hòa Toyota Altis 2006-2016"
<h1> count: 0
```

---

## 4. Browser verification (post-hydration + client fetch)

Tool: Playwright headless Chromium, `waitUntil: networkidle`.

| URL | H1 count | H1 text |
|-----|----------|---------|
| `…8713906080-6537` | **1** | Lọc gió điều hòa Toyota Altis 2006-2016 |
| `…1884611070oem-234` | **1** | Bugi Kia K3 2015 |
| `…485100dd00tki-6207` | **1** | Giảm xóc trước phải Toyota Vios 2019-2023 |
| `…25310r0150-1020` | **1** | Két nước Kia Carnival 2021 |

| Metric | Result |
|--------|--------|
| H1 class | `detail-title` |
| Duplicate visible H1 | **None** |
| H2 present after load | Yes (sections, related products) |

**Conclusion:** H1 **exists after hydration** and client product fetch — **not** missing in the rendered DOM.

---

## 5. Decision

### **PASS** — no implementation

### Decision tree (from brief)

| Branch | Applies? | Outcome |
|--------|----------|---------|
| SSR contains one meaningful H1 | **No** (0/23) | Not this branch |
| SSR zero H1, browser adds H1 | **Yes** | Evaluate JS indexing risk ↓ |
| Both SSR and DOM lack H1 | **No** | DOM has exactly 1 H1 |

### Indexing risk assessment (Google Search only)

| Factor | Assessment |
|--------|------------|
| Google renders JavaScript? | **Yes** — official rendering pipeline uses rendered HTML for indexing |
| H1 in rendered HTML? | **Yes** — 1× `detail-title` after load |
| Primary title signal in SSR? | **Yes** — `<title>` from `generateMetadata()` |
| Product name in SSR structured data? | **Yes** — `ProductJsonLd` |
| Product name text in SSR HTML? | **Yes** |
| Google requires SSR H1? | **No** documented requirement |
| Real Google Search issue proven? | **No** — content available after render + strong `<title>`/JSON-LD in SSR |

Per task rule: *“Do NOT implement unless the audit proves a real Google Search issue.”*  
**Not proven.** Missing SSR `<h1>` is a **best-practice gap** (faster crawl, non-Google bots), not a demonstrated Google indexing failure.

### Why not IMPLEMENT now

- Would require server/client coordination to avoid **duplicate visible H1**
- Touches product rendering architecture (`ProductDetail.jsx` is 1100+ lines, `"use client"`)
- Scope excludes unrelated surfaces; fix is non-trivial for uncertain Search benefit
- Google’s own JS guidance: rendered HTML **is** used for indexing

### Optional future work (out of scope, not required)

Server-render a single `<h1>` using data already fetched in `resolveSeoEntity` / `generateMetadata` — **only if** monitoring shows title/indexing issues in GSC. Not justified by current official guidance alone.

---

## 6. Files changed

**None.**

---

## 7. Regression

Not applicable (no code changes).

If H1 SSR is added later, verify:

- [ ] `npm run build` PASS
- [ ] Exactly **one** visible H1 per product page
- [ ] UI unchanged (same `detail-title` styling)
- [ ] `<title>` unchanged
- [ ] Canonical unchanged
- [ ] `ProductJsonLd` unchanged

---

## 8. Rollback

Not applicable.

---

## Appendix

```
DECISION:     PASS
CONFIDENCE:   88%
SSR H1:       0 / 23 pages
DOM H1:       1 / 4 pages tested (Playwright, post-hydration)
GOOGLE CITE:  JavaScript SEO basics — rendered HTML used for indexing
              Title link — <title> primary; H1 recommended not required
FILES:        0 changed
```
