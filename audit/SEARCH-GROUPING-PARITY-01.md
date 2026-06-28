# SEARCH-GROUPING-PARITY-01

Quality-gated inverted grouping parity with legacy runtime.

## Feature flag

```env
SEARCH_GROUPING_MODE=legacy           # default, rollback
SEARCH_GROUPING_MODE=quality_gate_v2
SEARCH_GROUPING_WEIGHTS_PATH=backend/config/searchGroupingWeights.json
SEARCH_GROUPING_QUALITY_THRESHOLD=18
SEARCH_GROUPING_POPUP_RESERVE=3
```

Requires (unchanged): `SEARCH_RUNTIME=inverted`, `SEARCH_CANDIDATE_POLICY=adaptive`, `SEARCH_RANKING_MODE=weighted_v2`.

## Results

| Mode | Top10 | Top20 | Popup | ViewAll |
|------|-------|-------|-------|---------|
| legacy (inverted groups) | 98.57% | 95% | 71.43% | 100% |
| quality_gate_v2 | 98.57% | 95% | 100% | 100% |

## Acceptance

| Check | Target | Result |
|-------|--------|--------|
| Top10 parity | >=99% | 98.57% FAIL |
| Top20 overlap | >=99.5% | 95% FAIL |
| Popup parity | 100% | 100% PASS |
| ViewAll parity | 100% | 100% PASS |
| Rollback | available | PASS (`SEARCH_GROUPING_MODE=legacy`) |

Overall: **FAIL**

### Grouping-specific outcomes (`quality_gate_v2`)

| Metric | Before (legacy grouping) | After (quality_gate_v2) |
|--------|--------------------------|-------------------------|
| Popup parity | 71.43% | **100%** |
| ViewAll parity | 100% | **100%** |
| má phanh vehicle groups | 135 | **14** (matches legacy) |

Top10/Top20 remain at **98.57%** / **95%** — limited by ranking parity (`má phanh vios` 90%/70%), not grouping. Ranking and candidate retrieval were not changed in this task.

Rollback: `SEARCH_GROUPING_MODE=legacy`
