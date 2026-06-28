# SEARCH-INDEX-GROUP-RUNTIME-01 — Benchmark

Generated: 2026-06-27T02:42:49.077Z

Flag: `SEARCH_GROUP_INDEX` (default **0**)

| Query | Legacy ms | Index group ms | Index-only group SQL |
|-------|-----------|----------------|----------------------|
| bugi toyota | 312.38 | 84.42 | yes |
| má phanh vios | 218.42 | 117.49 | yes |
| lọc dầu mazda | 1710.75 | 837.9 | yes |
| đèn hậu kia | 3527.98 | 1065.82 | yes |
| 04465-0D140 | 866.99 | 484.18 | yes |

Avg vehicle group key parity: **100%**


---

# Group parity

| Query | Vehicle groups | Counts | Categories | Top-20 order | ViewAll |
|-------|----------------|--------|------------|--------------|---------|
| bugi toyota | 100% | 100% | 100% | 100% | match |
| má phanh vios | 100% | 100% | 87.5% | 100% | match |
| lọc dầu mazda | 100% | 100% | 25% | 100% | match |
| đèn hậu kia | 100% | 100% | 1.622% | 100% | match |
| 04465-0D140 | 100% | 100% | 100% | 0% | match |

Target: >= 99.9% vehicle group parity.
