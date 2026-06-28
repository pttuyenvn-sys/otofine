# SEARCH-CANDIDATE-POLICY-PARITY-01

Adaptive candidate retrieval policy for inverted runtime.

## Flag

```env
SEARCH_CANDIDATE_POLICY=strict    # default (rollback)
SEARCH_CANDIDATE_POLICY=adaptive
SEARCH_CANDIDATE_TARGET=30        # optional
```

## Validation results

| Metric | Strict | Adaptive | Target |
|--------|--------|----------|--------|
| Avg candidate recall | 89.33% | **97.19%** | ≥97% PASS |
| Avg Top10 parity | 70% | 70% | Improved/maintained PASS |
| Candidate retrieval latency | 14.09ms | 15.47ms (+9.79%) | ≤10% PASS |

## Key improvement

| Query | Strict recall | Adaptive recall |
|-------|---------------|-----------------|
| đèn hậu kia | 28% | **83%** |
| bố thắng | 97.3% | 97.3% |
| All others | 100% | 100% |

## Files

- `backend/config/searchCandidatePolicyConfig.js`
- `backend/services/search/runtime/invertedCandidatePolicy.js`
- `backend/services/search/runtime/invertedSearchExecution.js` (wired only)

Ranking, grouping, popup, parser, SEO **unchanged**.

## Deliverables

- [candidate-policy.md](./search-candidate-policy-parity-01/candidate-policy.md)
- [before-after.json](./search-candidate-policy-parity-01/before-after.json)
- [benchmark.json](./search-candidate-policy-parity-01/benchmark.json)
- [candidate-recall.json](./search-candidate-policy-parity-01/candidate-recall.json)
