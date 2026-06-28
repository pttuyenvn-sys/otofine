# SEARCH-INVERTED-RUNTIME-CANARY-01

Shadow canary: legacy user response + background inverted evaluation.

## Flags

```env
SEARCH_CANARY=0          # default off
SEARCH_CANARY=1          # enable canary
SEARCH_CANARY_SAMPLE_RATE=100|10|5|1
SEARCH_RUNTIME=legacy    # Stage 1 shadow (user gets legacy)
```

## Rollout

1. `SEARCH_CANARY=1` + `SEARCH_RUNTIME=legacy` — shadow mode
2. `SEARCH_RUNTIME=inverted` + `SEARCH_CANARY=1` — live inverted with monitoring
3. `SEARCH_CANARY=0` — production complete

## Rollback

```env
SEARCH_RUNTIME=legacy
SEARCH_CANARY=0
```

## Latest daily report

Date: 2026-06-27
Samples: 26
Avg Top10 parity: 67.69%
Pass: NO
