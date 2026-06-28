# Candidate Policy

## Flag

```env
SEARCH_CANDIDATE_POLICY=strict   # default
SEARCH_CANDIDATE_POLICY=adaptive
SEARCH_CANDIDATE_TARGET=30
```

## Results

| Policy | Avg recall | Avg Top10 | Avg latency |
|--------|------------|-----------|-------------|
| strict | 89.33% | 70% | 125.58ms |
| adaptive | 97.19% | 70% | 154.88ms |

Latency increase: 9.79%
