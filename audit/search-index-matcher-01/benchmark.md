# Benchmark

| Query | Legacy (ms) | Hybrid (ms) | Matcher (ms) | Provider | Docs scanned | LIKE |
|-------|-------------|-------------|--------------|----------|--------------|------|
| bugi toyota | 287.01 | 20.74 | 6716.49 | matcher-index | 41 | no |
| má phanh vios | 285.89 | 38.17 | 1768.36 | matcher-index | 22 | no |
| lọc dầu mazda | 978.99 | 10.49 | 2411.35 | matcher-index | 21 | no |
| đèn hậu kia | 1747.81 | 7.36 | 3517.87 | matcher-index | 56 | no |
| 04465-0D140 | 1036.79 | 1.2 | 10697.11 | exact-index | 0 | no |
| bố thắng | 2611.97 | 25.09 | 10035.8 | matcher-index | 307 | no |
| brake pad | 1720.12 | 13.83 | 10104.09 | matcher-index | 79 | no |

LIKE fallback rate: **0%**
