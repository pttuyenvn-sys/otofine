# Readiness — SEARCH-INVERTED-MISMATCH-ROOTCAUSE-01

## Rollout readiness score

| Stage | Score | Top10 parity | Recall | Notes |
|-------|-------|--------------|--------|-------|
| **Current** | **62 / 100** | 70% | 89% | Below canary pass thresholds |
| After fixing top cause (candidate retrieval) | 78 | ~85% | ~97% | đèn hậu kia recall restored |
| After fixing top 2 (+ ranking) | 85 | ~92% | ~97% | bugi/má phanh order aligned |
| After fixing top 3 (+ grouping gate) | **88** | ~95% | ~98% | Sidebar/popup counts stable |

**Pass threshold (canary):** Top10 ≥99%, Top20 ≥99.5%, recall ≥99%

## Current vs expected

```
Metric              Current    After top-3 fixes
─────────────────────────────────────────────
Top10 parity        70%        ~95%
Top20 parity        79%        ~97%
Candidate recall    89%        ~98%
Wrong URLs          1 query    ~0
Wrong popup         3 queries  ~0
Rollout ready       NO         LIKELY (pending validation)
```

## Blockers (ordered by impact)

1. **Candidate retrieval scope** — Legacy brand+keyword scan includes products matching brand only; inverted `min_matched_tokens=2` with brand facet excludes 72% of legacy top-100 for `đèn hậu Kia`.
2. **Ranking formula** — Inverted boosts adjacent categories (Ron bugi, Gioăng bugi) above canonical category (Bugi) when retrieval token weights differ; legacy category-intent ranking prefers exact category.
3. **Grouping breadth** — Inverted emits all token-hit categories (135 for má phanh vios); legacy quality gate reduces to 14 relevant groups.

## Non-blockers (parity OK or inverted better)

| Query | Status |
|-------|--------|
| lọc dầu mazda | Top10/Top20 100%; sidebar group count differs only |
| 04465-0D140 | Both empty — catalog/data gap, not runtime |
| brake pad | Legacy empty, inverted 63 hits — legacy gap |

## Recommendation

**Do not enable `SEARCH_RUNTIME=inverted` for production** until candidate retrieval and ranking parity exceed 99% on expanded canary corpus (≥100 queries).

Continue **Stage 1 shadow canary** (`SEARCH_CANARY=1`, `SEARCH_RUNTIME=legacy`) and expand query sampling before Stage 2.

## No implementation in this audit

This document is diagnosis only. Estimated gains assume future fixes to retrieval policy, ranking weights, and grouping quality gate — not implemented here.
