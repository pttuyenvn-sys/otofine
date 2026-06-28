# SEARCH-INVERTED-MISMATCH-ROOTCAUSE-01

**Mode:** Read-only audit — no code, SQL, index, or config changes.

**Date:** 2026-06-27

## Executive summary

Inverted runtime diverges from legacy primarily because **legacy scans the full `products` table with FULLTEXT/LIKE + keyword relevance**, while inverted uses **token intersection on `search_token_index`** with a different ranking function on `product_search_index`.

| Metric | Current | Canary target |
|--------|---------|---------------|
| Top10 parity | **70%** | ≥99% |
| Top20 parity | **79%** | ≥99.5% |
| Candidate recall | **89%** | ≥99% |

### Root cause distribution (estimated)

| Class | % | Label |
|-------|---|-------|
| **A** | **35%** | Candidate missing |
| **B** | **31%** | Ranking difference |
| **C** | **18%** | Grouping difference |
| **D** | **12%** | Search intent difference |
| **E** | **2%** | URL / SEO difference |
| **F** | **2%** | Unknown / empty |

---

## Per-query classification

### 1. `bugi toyota` — **Class B (Ranking)**

| | Legacy | Inverted |
|---|--------|----------|
| Top10 parity | 30% | |
| Candidate recall | 100% | 29 candidates, identical set |
| Legacy #1 | 5279 Bugi Toyota Vios | |
| Inverted #1 | 4552 Gioăng chắn dầu bugi Toyota Camry | |

**Missing from inverted top10:** 5279, 5293, 5288 (all pure **Bugi** category)

**Extra in inverted top10:** 4552, 6256, 6257, 7025, 7113 (**Ron bugi**, **Gioăng bugi**, **Phớt bugi**)

**Why:** All products have `matched_tokens=2`, `inverted_score=190–200`. Inverted ranks higher when `retrieval_score=120` (adjacent category tokens) vs `100` (Bugi category). Legacy `buildKeywordRelevanceOrderSql` prioritizes exact category title match "Bugi" over related categories.

**Secondary Class D:** `part_number_norm: "bugi"` incorrectly set — may add OEM boost noise.

---

### 2. `má phanh Toyota Vios` — **Class B + Class C**

| | Legacy | Inverted |
|---|--------|----------|
| Top10 parity | 70% | |
| Candidate recall | 100% | 500 candidates |
| Category groups | **14** | **135** |
| Vehicle groups | 14 | 135 |

**Ranking:** 6651 vs 6650 — identical score 490, inverted tie-breaks by `product_id ASC` (6650 wins). Legacy prefers 6651.

**Ranking:** Cụm phanh products (5790, 5791) legacy #6–10, inverted #259+ — legacy category-intent boost for "má phanh" vs inverted token match on "phanh" alone.

**Grouping:** Inverted emits every category with token hits across 500 candidates; legacy quality gate filters to brake-relevant categories.

**Class E (minor):** 2nd popup group URL differs because group ordering differs.

---

### 3. `lọc dầu Mazda` — **Class C (Grouping only)**

| | Legacy | Inverted |
|---|--------|----------|
| Top10 / Top20 | **100%** | |
| Candidate recall | 100% | |
| Category groups | 2 | 28 |

Ranking parity is perfect (6 legacy products, all in inverted top 6). Mismatch is **sidebar category count only** — inverted surfaces 28 token-matched categories vs legacy 2.

---

### 4. `đèn hậu Kia` — **Class A (Candidate missing)** — worst query

| | Legacy | Inverted |
|---|--------|----------|
| Top10 parity | 30% | |
| **Candidate recall** | **28%** | 299 candidates |
| Legacy top100 | 100 products | |
| Missing from candidates | **72 products** | |

**Query tokens:** `den`, `hau`, `den hau`, `kia`

**Root cause:** When brand facet is present, inverted requires `min_matched_tokens >= 2`. Legacy top-100 includes many Kia products matching **only `kia`** (e.g. product 113 "Bạc biên Kia Morning" — matched tokens: `[kia]`, missing: `[den, hau, den hau]`).

Legacy FULLTEXT returns broad brand+keyword matches; inverted correctly excludes single-token brand hits but **legacy treats these as relevant search results**.

**Ranking (secondary Class B):** Legacy interleaves by model/year pattern (792, 799, 806…); inverted sorts by `product_id ASC` within score bands (788–807 sequential).

**Grouping (Class C):** Legacy 863 category groups vs inverted 107 — legacy groups all Kia catalog matches.

---

### 5. `04465-0D140` — **Class F (Unknown / data)**

Both runtimes return **0 results**. Part not present in active index or catalog. Parity 100% vacuously.

---

### 6. `bố thắng` — **Class D (Intent) + Class B**

| | Legacy | Inverted |
|---|--------|----------|
| Top10 parity | 60% | |
| Candidate recall | 97.3% | 322 candidates |
| Query tokens | legacy uses `bo thang` | inverted: **`[thang]` only** |

**Class D:** Stop-word filter drops `bo`; synonym expansion does not restore `bố thắng` → `má phanh` / brake pad mapping.

**Class B:** Product 389 "Càng i thẳng trước lái Kia Quoris" inverted #1 — matches substring `thang` in title. Legacy #1 is 4691 (actual brake pad). Legacy ranks by phrase relevance; inverted ranks by token `thang` frequency/weight.

**Class C:** Category groups 20 vs 68.

---

### 7. `brake pad` — **Class D (Intent)**

| | Legacy | Inverted |
|---|--------|----------|
| Legacy results | **0** | |
| Inverted results | 63 | |

Legacy English query path returns nothing; inverted tokenizes `brake`, `pad`, `brake pad`. **Legacy gap**, not inverted regression.

---

## Candidate analysis summary

See [candidate-analysis.json](./search-inverted-mismatch-rootcause-01/candidate-analysis.json).

| Query | Recall | Missing from candidates | Primary cause |
|-------|--------|-------------------------|---------------|
| bugi toyota | 100% | 0 | — |
| má phanh vios | 100% | 0 | — |
| lọc dầu mazda | 100% | 0 | — |
| **đèn hậu kia** | **28%** | **72** | min_matched=2 + brand-only legacy hits |
| 04465-0D140 | 100% | 0 | both empty |
| bố thắng | 97.3% | 1 | unrelated product (7485) |
| brake pad | 100% | 0 | legacy empty |

---

## Token analysis summary

See [token-analysis.json](./search-inverted-mismatch-rootcause-01/token-analysis.json).

| Query | Tokens sent to retrieval | Issue |
|-------|--------------------------|-------|
| bugi toyota | bugi, toyota | `part_number_norm=bugi` false OEM path |
| má phanh vios | ma, phanh, ma phanh, toyota, vios | `ma` is overly broad (matches many categories) |
| đèn hậu kia | den, hau, den hau, kia | Correct tokens; legacy recall gap is policy not tokenization |
| bố thắng | **thang only** | Stop word dropped `bo`; no synonym for brake pad |
| brake pad | brakepad, brake pad, brake, pad | Legacy has no English token path |

---

## Ranking analysis summary

See [ranking-analysis.json](./search-inverted-mismatch-rootcause-01/ranking-analysis.json).

Inverted scoring components (`scoreInvertedIndexRow`):
- OEM exact match (+200)
- Phrase in blob (+120)
- Token coverage (+80 scaled)
- Brand/model facet (+40 each)
- retrieval_score × 0.5 + matched_tokens × 10

Legacy uses `buildKeywordRelevanceOrderSql` with category slug alignment, exact phrase tiers, and popularity — **not replicated** in inverted scorer.

---

## Group analysis summary

See [group-analysis.json](./search-inverted-mismatch-rootcause-01/group-analysis.json).

Inverted `fetchIndexGroupedInventory` groups **all candidates** without legacy's search quality gate. This inflates category sidebar counts without always affecting top-N product ranking.

---

## Worst queries (corpus ranked by Top10 parity)

| Rank | Query | Top10 | Recall | Class |
|------|-------|-------|--------|-------|
| 1 | bugi toyota | 30% | 100% | B |
| 2 | đèn hậu kia | 30% | 28% | A |
| 3 | bố thắng | 60% | 97% | D |
| 4 | má phanh vios | 70% | 100% | B |
| 5 | lọc dầu mazda | 100% | 100% | C |
| 6 | brake pad | 100% | 100% | D |
| 7 | 04465-0D140 | 100% | 100% | F |

*Note: Validation corpus has 7 queries; expand to 100+ for production canary.*

---

## Expected parity gain (if fixed — not implemented)

| Fix area | Est. Top10 gain |
|----------|-----------------|
| Candidate retrieval policy (brand+keyword vs min_matched) | **+18%** |
| Ranking formula parity with legacy relevance | **+7%** |
| Grouping quality gate | **+5%** |
| Synonym + stop-word handling | **+3%** |
| URL/group ordering | **+1%** |

**Projected after top 3:** Top10 ~95%, recall ~98%

---

## Deliverables

| File | Description |
|------|-------------|
| [rootcause-summary.json](./search-inverted-mismatch-rootcause-01/rootcause-summary.json) | Aggregate classification + readiness |
| [candidate-analysis.json](./search-inverted-mismatch-rootcause-01/candidate-analysis.json) | Per-query missing product token forensics |
| [ranking-analysis.json](./search-inverted-mismatch-rootcause-01/ranking-analysis.json) | Score breakdown for reordered products |
| [token-analysis.json](./search-inverted-mismatch-rootcause-01/token-analysis.json) | Query tokenization + expansion |
| [group-analysis.json](./search-inverted-mismatch-rootcause-01/group-analysis.json) | Category/vehicle group counts |
| [top-mismatches.json](./search-inverted-mismatch-rootcause-01/top-mismatches.json) | Top20 diff per query |
| [readiness.md](./search-inverted-mismatch-rootcause-01/readiness.md) | Rollout readiness score |

---

## Conclusion

Parity gap is **not** from missing inverted index data (backfill 100% coverage confirmed). It stems from **intentional architectural differences**:

1. Legacy permissive retrieval (FULLTEXT brand bleed) vs inverted strict token intersection
2. Different ranking functions (keyword relevance vs weighted token score)
3. Missing quality gate on inverted grouping
4. Token normalization gaps (stop words, English, synonyms)

**No fixes applied in this audit.**
