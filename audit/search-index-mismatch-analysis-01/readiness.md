# SEARCH-INDEX-MISMATCH-ANALYSIS-01 — Readiness

Generated: 2026-06-26T14:24:31.583Z

## Current parity (legacy = truth)

| Metric | Value |
|--------|-------|
| Top-1 | 84% |
| Top-10 | 94.667% |
| Top-20 | 94.667% |
| NDCG@10 | 0.9261 |
| MRR | 0.88 |
| Exact order @10 | 100% |

## Mismatch breakdown

- Identical: 21
- Order only (same IDs): 1
- Missing/extra IDs: 3

## Root causes (ranked)

- **PARTNUMBER_NORMALIZATION**: 3 (75%), 4 products, avg 1026ms
- **RANKING_ONLY**: 1 (25%), 0 products, avg 991ms

## Noise vs scoped

| Segment | Queries | Mismatches |
|---------|---------|------------|
| Broad noise | 0 | 0 |
| Scoped | 25 | 4 |

## Projected parity if root causes resolved

| Scenario | Est. Top-20 |
|----------|-------------|
| Category fixed | 88% |
| Document fixed | 88% |
| Ranking only removed | 91.4% |
| LIKE fallback fixed | 88% |

## Production blockers

- Top-20 parity 94.667% below 95% gate

## Readiness score: 90/100

Diagnosis only — no fixes recommended.
