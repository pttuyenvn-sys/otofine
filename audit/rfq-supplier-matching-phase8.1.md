# Phase 8.1 — RFQ Supplier Matching Foundation

**Status:** SHIPPED (foundation — backend service layer only)
**Scope:** additive only; preserves all existing RFQ flows
**Out of scope:** no UI, no dispatch wiring, no ML, no infra changes

---

## 1. Guarantees (read first)

This phase adds an **intelligent supplier matching engine** as a **pure
service module** alongside the existing RFQ infrastructure. It is
*not* yet called from anywhere in production code paths.

| Surface | Status after Phase 8.1 |
|---|---|
| Existing RFQ create / OTP / dispatch APIs | unchanged |
| `rfqDispatch.service.appendDispatchWaveInternal` | unchanged |
| `rfqDispatch.repository.pickShopIdsForMatching` | unchanged (still used) |
| RFQ UI (buyer + shop center) | unchanged |
| RFQ admin / health routes | unchanged |
| Auth, middleware, nginx, wildcard, SEO, products | unchanged |
| Backend boot time / bundle size | identical (lazy-imported only) |

**Rollout safety:** because no production code path imports the new
`backend/modules/rfq/matching/` module, this commit is a pure
no-op in the running system. Ops can `pm2 restart otofine-backend`
freely. To roll back, simply drop the folder + revert the commit.

---

## 2. High-level architecture

```
                  ┌─────────────────────────────────┐
                  │      RFQ row (rfq_requests)     │
                  └──────────────┬──────────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │ rfqMatchInputs.normalizer.js          │
              │  - parses vehicle_json, category_key  │
              │  - extracts keywords from description │
              │  - resolves taxonomy via part_knowledge│
              │  - parses location (province) tolerant│
              │  → frozen MatchInput                  │
              └──────────────┬───────────────────────┘
                             │
       ┌─────────────────────┴──────────────────────┐
       ▼                                            ▼
┌──────────────────────────┐         ┌────────────────────────────────┐
│ rfqShopCandidates.repo.js │         │ rfqShopSpecialization.repo.js │
│  - byBrand (products+pca) │         │  - base shop row (trust+brand)│
│  - byPart  (part_knowledge)│         │  - total product count        │
│  - byGeo   (provinceId)    │         │  - vehicle spec (brand+model) │
│  - wideFallback            │         │  - part spec (system_group)   │
│  → ids: number[] (≤ 80)    │         │  - brand share (top brands)   │
└──────────────────────────┘         └────────────────────────────────┘
                             │
                             ▼
                ┌────────────────────────────────┐
                │  rfqMatchScorer.js (pure)      │
                │  - 13 deterministic signals    │
                │  - WEIGHTS sums to MAX_SCORE   │
                │  - returns { score, tier,      │
                │    breakdown, max,             │
                │    specialization }            │
                └──────────────┬─────────────────┘
                               │
                               ▼
                ┌────────────────────────────────┐
                │ rfqMatchEngine.service.js      │
                │  - sort, dedup, cap top-N      │
                │  - emit rfq.match.* events     │
                │  - extraScorers hook (ML-ready)│
                │  → { input, stats, results }   │
                └────────────────────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────────┐
              │  Consumers (future, not in P8.1)     │
              │    - scripts/rfq-match-preview.mjs   │
              │      (ops dry-run CLI)               │
              │    - admin preview endpoint (P8.2)   │
              │    - dispatch shadow-mode (P8.3)     │
              │    - ML reranker via extraScorers    │
              └──────────────────────────────────────┘
```

---

## 3. New files (all additive, none touched the existing tree)

```
backend/modules/rfq/matching/
  index.js                                ← barrel (only public surface)
  rfqMatchInputs.normalizer.js            ← RFQ → frozen MatchInput
  rfqShopCandidates.repo.js               ← candidate pool SQL
  rfqShopSpecialization.repo.js           ← per-shop enrichment SQL (bulk)
  rfqMatchScorer.js                       ← pure deterministic scorer
  rfqMatchEngine.service.js               ← orchestration + observability
  rfqMatchLogger.js                       ← rfqLog + [shopsite] event= bridge

scripts/
  rfq-match-preview.mjs                   ← ops dry-run CLI

audit/
  rfq-supplier-matching-phase8.1.md       ← this file
```

No file outside `backend/modules/rfq/matching/`, `scripts/`, and
`audit/` was modified.

---

## 4. The scoring model

Pure function. Same inputs → same outputs. Sums to exactly **100 pts**;
a module-load assertion fails fast if a contributor changes a weight
without updating `MAX_SCORE`.

| Group | Signal | Max | Source |
|---|---|---:|---|
| Vehicle fit (40) | `brandSpecialization` | 20 | shop has ≥1 product with `car_models.hang_xe = rfq.brand` |
|  | `modelExact` | 10 | shop has ≥1 product applied to exact `cm.ten_xe = rfq.model` |
|  | `yearOverlap` | 10 | shop has ≥1 product whose `year_from ≤ rfq.year ≤ year_to` |
| Part fit (25) | `systemGroupMatch` | 15 | shop has ≥1 product in `part_knowledge.system_group ∈ rfq.systemGroups` |
|  | `categoryTagMatch` | 5 | shop has ≥1 product with `part_knowledge.category_tag ∈ rfq.categoryTags` |
|  | `partInventoryDepth` | 5 | log-tier: 1→2 pts, 5→4 pts, 25+ → 5 pts |
| Trust & quality (20) | `verified` | 8 | `shops.verified_at IS NOT NULL` |
|  | `responsive` | 4 | phone + (zalo OR facebook) — half credit if only one |
|  | `storefrontPolish` | 4 | ≥3 of {avatar, cover, bio, intro_html} — half credit at 2 |
|  | `freshness` | 4 | `last_seen_at` within 24h — half credit within 7d |
| Inventory volume (10) | `totalProductsTier` | 6 | log-tier on total count (10/50/200 thresholds) |
|  | `brandInventoryShare` | 4 | brand-share ≥ 50% → full, ≥ 20% → half |
| Geography (5) | `sameProvince` | 5 | `shop.provinceId === rfq.location.provinceId` |
| **Total** |  | **100** |  |

**Tier classification** (deterministic, same thresholds used by logs):
- **HOT** — score ≥ 75 — surface as top supplier
- **WARM** — 45 ≤ score < 75 — viable, send if quota allows
- **COLD** — < 45 — fallback only

**Tiebreakers** (when scores are equal): `verified` desc → `totalProducts`
desc → `shopId` asc. Fully deterministic across runs.

---

## 5. Real example: RFQ #119 → ranked suppliers

The live dev RFQ has `vehicle=Kia Morning 2018, description="Test ZALO OA"`.
Only one shop is currently `public` in dev. Engine output:

```
Candidates: total=1  byBrand=1  byPart=0  byGeo=0   (no province on RFQ)
Returned=1  BestScore=70/100  dur=160ms

[1] shop=2 phutungoto355  score=70/100  tier=warm
     + 20/20 Chuyên Kia                       (1602 sản phẩm cho hãng Kia)
     + 10/10 Khớp đúng model Morning
     + 10/10 Đời xe 2018 nằm trong dải sản phẩm
     +  8/8  Shop đã xác minh
     +  4/4  Liên hệ đa kênh
     +  4/4  Hồ sơ shop hoàn thiện
     +  4/4  Hoạt động trong 24h
     +  6/6  Quy mô kho hàng                  (2806 sản phẩm)
     +  4/4  Tỉ trọng kho hàng tập trung Kia  (57% kho cho Kia)
     • top brands: Kia(1602), Mazda(1100), Peugeot(104)
```

Note the part-fit pillar correctly stays at 0 because "Test ZALO OA"
contains no real part name → engine **gracefully degrades** instead of
inventing matches.

A synthetic RFQ for the same vehicle but with `"Cần mua lọc gió động cơ"`
ranks the same shop at **95/100 HOT** (part-fit signals now fire).

---

## 6. Pipeline & complexity

For a single RFQ:

| Step | Queries | Cost |
|---|---:|---|
| Load RFQ row | 1 | PK lookup |
| Taxonomy resolve (slug-or-keyword) | 1 | `part_knowledge` indexed |
| Candidate pool (4 parallel) | 4 | bounded `LIMIT 40` each |
| Bulk enrichment (4 parallel + 1) | 5 | `shopId IN (≤80)` grouped |
| **Total round-trips** | **≤ 11** | parallelized into ~3 RTTs |
| **End-to-end wall time** (dev) | — | ~100–200 ms |

No N+1, no per-shop sub-queries. Candidate pool capped at 80, scorer
caps results at 25 (default 10). The engine is **safe to call inline
from a hot path** once we wire it.

---

## 7. Observability

Every call emits structured logs on **both** streams ops already uses:

```
# rfqLog JSON line
{"ts":"...","svc":"rfq","level":"info","event":"rfq.match.started","rfqId":119,"brand":"Kia","model":"Morning","year":2018,"partGroups":[...],"topN":5}

# [shopsite] event= line
[shopsite] event=rfq.match.started rfqId=119 brand=Kia model=Morning year=2018 partGroups=[...] topN=5
```

| Event | When | Fields |
|---|---|---|
| `rfq.match.started` | engine entry | rfqId, brand, model, year, partGroups, topN |
| `rfq.match.completed` | engine exit (success) | rfqId, candidates, scored, returned, bestScore, dur_ms |
| `rfq.match.zero-results` | no candidates OR no shops survived enrichment | rfqId, reason |
| `rfq.match.top-suppliers` | when returned > 0 | rfqId, shops:[{id,score,tier},…] |
| `rfq.match.failed` | engine exception | rfqId, reason, msg |
| `rfq.match.taxonomy-failed` | taxonomy resolve threw (non-fatal) | msg |

The dual-stream bridge is intentional: RFQ ops dashboards parse
`{svc:"rfq"}`, shopsite ops dashboards parse `[shopsite] event=`. Both
get the same events without anyone having to grep two formats.

---

## 8. Future-ready hooks

| Hook | How |
|---|---|
| **ML reranker** | `matchRfqToShops({ extraScorers: [(signals, input) => ({key, label, points, max, evidence})] })` — extras merge into breakdown + add to score; total can exceed 100 (callers aware). |
| **Response quality / quote accuracy** | future: feed historical quote→close rate into `signals` bag, score in `extraScorers`. |
| **Supplier reputation** | future: add `reputation` signal sourced from review aggregate; weight via `WEIGHTS.reputation` (will trigger `MAX_SCORE` recalc — assertion guarantees no silent drift). |
| **Cache layer** | engine returns serialisable JSON; can be cached per `(rfqFingerprint, day)` with TTL=10min. Not enabled in P8.1. |
| **Shadow dispatch** | wire into `rfqDispatch.service` as a *parallel* picker; log divergence vs. `pickShopIdsForMatching`. Enables A/B-style validation before cut-over. |

---

## 9. Safety contract

| Property | Guaranteed by |
|---|---|
| **Read-only** | no `INSERT`/`UPDATE`/`DELETE` in any new file (grep-clean). |
| **Bounded work** | candidate pool capped at 80, top-N at 25 (default 10), taxonomy resolution capped at 20 ids + 5 keyword tokens. |
| **Deterministic** | scorer is pure; ties broken with stable comparator. Two consecutive runs against identical DB state produce identical output (test pass). |
| **Explainable** | every point awarded carries `{key, label, points, max, evidence}` — UI can render the reason without re-running the scorer. |
| **Resilient to sparse inventory** | wide fallback in candidate pool ensures non-empty result whenever any public shop exists; taxonomy resolve failures degrade gracefully (part-fit signals → 0, vehicle/trust signals still fire). |
| **No collateral imports** | `matching/` is referenced only by itself; the running app does not load it until a future phase explicitly wires it. Confirmed by `grep -r matching/ backend/` returning zero non-self hits. |
| **Weight-drift guarded** | `MAX_SCORE` constant + load-time assertion. Any change to `WEIGHTS` that breaks the sum fails the boot of any module that imports the scorer. |

---

## 10. Test matrix

### Scorer unit tests (`/tmp/p8-scorer-test.mjs`)

| # | Test | Result |
|---:|---|---|
| 1 | empty signals → 0 | PASS |
| 2 | perfect signals → exactly MAX_SCORE (100) | PASS |
| 3 | mid-range signals → bounded (30 ≤ score ≤ 70) | PASS |
| 4 | modelExact absent when no model | PASS |
| 5 | yearOverlap fires correctly | PASS |
| 6 | sameProvince absent when province mismatch | PASS |
| 7 | determinism: same input twice → same breakdown JSON | PASS |
| 8 | tier thresholds: 85→hot, 60→warm, 30→cold | PASS |
| 9 | tier boundary: TIERS.hot threshold → "hot" | PASS |
| 10 | MAX_SCORE is 100 | PASS |

**Result:** `ALL_TESTS_PASSED` (20 assertions)

### Engine integration tests (`/tmp/p8-engine-test.mjs`, live DB)

| # | Test | Result |
|---:|---|---|
| 1 | taxonomy resolved for "lọc gió động cơ" (15 groups) | PASS |
| 2 | keywords extracted with Vietnamese diacritics | PASS |
| 3 | engine returns ≥ 1 result | PASS |
| 4 | top-1 has partProducts > 0 (part-fit fired) | PASS |
| 5 | every score ≤ MAX_SCORE | PASS |
| 6 | results sorted descending by score | PASS |
| 7 | determinism: two runs → identical (shopId, score) tuples | PASS |
| 8 | extraScorers merge into breakdown and score | PASS |

**Result:** `ALL_ENGINE_TESTS_PASSED` (8 assertions)

### Regression checks

| Surface | Method | Result |
|---|---|---|
| Backend boots | `pm2 restart otofine-backend` → tail logs | ✓ `[api] listening { port: 5000, rfq_module: true }` |
| Apex `/api/products` | `curl -w HTTP=%{http_code}` | 200 |
| `pickShopIdsForMatching` (existing dispatch) | grep | unchanged |
| New module imported from production code | `rg "matching/" backend/` | only self-references (1 comment in `rfqAnalytics.service.js`) |

---

## 11. Ops runbook

### Preview a single RFQ

```bash
# Most-recent open RFQ
node /var/www/otofine/scripts/rfq-match-preview.mjs

# Specific id
node /var/www/otofine/scripts/rfq-match-preview.mjs --id 119

# Specific public_id
node /var/www/otofine/scripts/rfq-match-preview.mjs --public e7864f97...

# Top 5 instead of 10
node /var/www/otofine/scripts/rfq-match-preview.mjs --id 119 --top 5

# Raw JSON (pipe to jq for inspection)
node /var/www/otofine/scripts/rfq-match-preview.mjs --id 119 --json | jq .results
```

The CLI runs in the backend cwd (it loads `backend/config/db.js`,
which loads `.env` transitively). It is **read-only** — it never
dispatches, never mutates.

### Roll back

The matching module isn't wired into any production code path, so:

```bash
git revert <commit-sha>     # safe, no-op for the running system
pm2 restart otofine-backend # cosmetic; not strictly required
```

### Run the test suites

```bash
cd /var/www/otofine/backend
node /tmp/p8-scorer-test.mjs    # pure, no DB
node /tmp/p8-engine-test.mjs    # hits live DB
```

---

## 12. What's next (not in P8.1)

The natural follow-on phases now that the foundation is in place:

| Phase | Goal | Risk |
|---|---|---|
| **8.2 — admin preview UI** | render preview output in `/shop-admin/rfq/:id/match-preview`; ops validates quality on real RFQs without touching dispatch | low — read-only |
| **8.3 — shadow dispatch** | call matcher in parallel with `pickShopIdsForMatching`, log divergence; no change to actual dispatched shops | low — log-only |
| **8.4 — gradual cut-over** | env flag `RFQ_DISPATCH_USE_MATCHER=true` swaps the picker; full apex stays on legacy path until score quality validated | medium — flag-gated |
| **8.5 — feedback loop** | ingest quote→close events into `signals` bag for `extraScorers`; deterministic still | medium |
| **8.6 — ML reranker** | train a light linear/GBDT model on shadow-mode + feedback data; expose via `extraScorers` | high — own phase |

Each step is independently reversible and ships behind its own flag.
