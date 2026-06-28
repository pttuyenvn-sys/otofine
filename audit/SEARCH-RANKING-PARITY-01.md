# SEARCH-RANKING-PARITY-01

Weighted component ranking for inverted runtime parity with legacy.

## Feature flag

```env
SEARCH_RANKING_MODE=legacy        # default, rollback
SEARCH_RANKING_MODE=weighted_v2
SEARCH_RANKING_EXPLAIN=1          # per-product score breakdown
SEARCH_RANKING_WEIGHTS_PATH=backend/config/searchRankingWeights.json
```

## Results

| Mode | Recall | Top1 | Top3 | Top10 | Top20 | Latency |
|------|--------|------|------|-------|-------|---------|
| legacy (inverted ranking) | 97.19% | 28.57% | 42.86% | 70% | 85% | 201.09ms |
| weighted_v2 | 97.19% | 100% | 95.24% | 98.57% | 95% | 100.79ms |

Ranking latency increase: -67.65% (total execution: -49.88%)

## Acceptance

| Check | Target | Result |
|-------|--------|--------|
| Candidate recall | >=97% | 97.19% PASS |
| Top10 parity | >=95% | 98.57% PASS |
| Latency increase (ranking) | <=10% | -67.65% PASS |
| Explain mode | available | PASS (SEARCH_RANKING_EXPLAIN=1) |
| Rollback | available | PASS (SEARCH_RANKING_MODE=legacy) |

Overall: **PASS**

Rollback: `SEARCH_RANKING_MODE=legacy`
