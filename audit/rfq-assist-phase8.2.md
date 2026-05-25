# Phase 8.2 — Live RFQ Assist (Soft Rollout)

**Status:** SHIPPED (soft-rollout — gated OFF by default)
**Scope:** assistive only; preserves all existing RFQ behavior
**Out of scope:** no auto-routing, no dispatch wiring, no RFQ UI redesign

---

## 1. Guarantees (read first)

This phase surfaces the Phase 8.1 matching engine on the post-OTP
buyer viewer page (`/rfq/t/[token]`) as an **assistive suggestion
panel**. It is observational + behavioural: buyers can see which
shops the system thinks are best for their RFQ, and can mark which
ones they want, but **no actual dispatch logic is affected** in
Phase 8.2.

| Surface | Status after 8.2 |
|---|---|
| Existing `pickShopIdsForMatching` dispatch picker | unchanged |
| `runDispatchForOpenRequest` / wave logic | unchanged |
| `/api/rfq/by-token`, `/verify-otp`, `/create`, shop inbox, history | unchanged |
| Buyer chat panel, dispatches list, RFQ status flow | unchanged |
| Auth, middleware, nginx, wildcard rollout, SEO | unchanged |
| Product detail pages, storefront routing | unchanged |

Three independent kill switches make rollback a single env flip:

1. `RFQ_ASSIST_ENABLED=false` → universal kill (panel hides everywhere, 1ms response, no engine call).
2. `RFQ_ASSIST_ROLLOUT_PCT=0` → percentage rollout zeroed (allowlist still works).
3. Frontend component is fully self-hiding — if backend returns `{ rollout: { inRollout: false } }` OR `suggestions: []` the panel renders nothing.

---

## 2. Assistive rollout strategy

### Layer 1 — Master kill (`RFQ_ASSIST_ENABLED`)

| Value | Behaviour |
|---|---|
| `false` (default) | Endpoint returns `{ rollout: { inRollout: false, reason: "killed" }, suggestions: [] }` in ~1ms. No engine call. No DB read other than the viewer-auth lookup. |
| `true` | Layer 2 takes over. |

### Layer 2 — Per-buyer rollout (priority order, evaluated per request)

| Path | Trigger | Reason code |
|---|---|---|
| **Allowlist hit** | `RFQ_ASSIST_ALLOWED_PHONES` contains the buyer's E.164 phone | `allowlist` |
| **Full rollout** | `RFQ_ASSIST_ROLLOUT_PCT=100` | `full-rollout` |
| **Zero rollout** | `RFQ_ASSIST_ROLLOUT_PCT=0` | `percent-out` |
| **Bucket-in** | `SHA-256(salt + phone + rfqId) mod 100 < RFQ_ASSIST_ROLLOUT_PCT` | `percent-in` |
| **Bucket-out** | bucket ≥ rollout pct | `percent-out` |

The bucketing is **buyer-stable**: same phone + same RFQ always lands
in the same bucket across page reloads, server restarts, and
deployments. Changing `RFQ_ASSIST_SALT` atomically re-shuffles
everyone (staging re-bucket without touching percentages).

### Layer 3 — Per-shop allowlist (`RFQ_ASSIST_ALLOWED_SHOPS`)

When set to a comma-separated list of shop slugs, suggestions are
**filtered IN** to that set BEFORE projection to the DTO. The
matcher still ranks the full universe — we just hide non-allowlisted
shops from the buyer. Lets ops dry-run the panel with only premium
or QA'd shops while still validating the ranker's quality on real RFQs.

### Suggested rollout cadence

| Day | `RFQ_ASSIST_ENABLED` | `RFQ_ASSIST_ROLLOUT_PCT` | `ALLOWED_PHONES` |
|----|---|---|---|
| Day 0 | `true` | `0` | Internal QA phones (3–5) |
| Day 3 | `true` | `5` | (cleared) |
| Day 7 | `true` | `25` | — |
| Day 14 | `true` | `100` | — |

Any day, ops can flip `RFQ_ASSIST_ENABLED=false` and the panel
disappears within one viewer refresh.

---

## 3. End-to-end pipeline

```
                      ┌────────────────────────────┐
                      │ Buyer lands on             │
                      │ /rfq/t/[token]             │
                      └──────────────┬─────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────┐
                    │ React component mounts:          │
                    │ <RfqAssistSuggestions>           │
                    │   - reads rfqId + viewerToken    │
                    │   - sessionStorage dismissed?    │
                    └──────────────┬───────────────────┘
                                   │ fetch
                                   ▼
                ┌───────────────────────────────────────┐
                │ GET /api/rfq/assist/suggestions       │
                │   (rfqViewerAuth)                     │
                │   → evaluateRollout()                 │
                │   → if !inRollout → return empty      │
                │   → matchRfqToShops() [Phase 8.1]     │
                │   → filter by ALLOWED_SHOPS           │
                │   → projectToSuggestion()             │
                │   → log rfq.assist.rendered           │
                └──────────────┬────────────────────────┘
                               │
                               ▼
                    ┌────────────────────────────┐
                    │ Component renders top-N    │
                    │ cards w/ score / tier /    │
                    │ reasons / verified badge   │
                    └──────────────┬─────────────┘
                                   │
                  ┌────────────────┼─────────────────┐
                  ▼                ▼                 ▼
        IO impression       Toggle "Chọn"      Dismiss panel
        (one per card)      (select/deselect)  (sessionStorage)
                  │                │                 │
                  └────────────────┴─────────────────┘
                                   │
                                   ▼
                ┌───────────────────────────────────────┐
                │ POST /api/rfq/assist/events           │
                │   {action, shopId?, matchScore,       │
                │    matchTier, source, metadata}       │
                │   → recordAssistEvent()               │
                │   → INSERT rfq_assist_events          │
                │   → log rfq.assist.{action}           │
                └───────────────────────────────────────┘
                                   │
                                   ▼
                ┌───────────────────────────────────────┐
                │ FUTURE (8.3+):                        │
                │   - shadow dispatch comparing matcher │
                │     vs. legacy picker                 │
                │   - reranker trained on selected/     │
                │     dismissed feedback                │
                │   - quote-quality / supplier-rep      │
                │     signals merged via extraScorers   │
                └───────────────────────────────────────┘
```

---

## 4. Files (all additive)

### Backend

```
backend/migrations/041_rfq_assist_events.sql          ← new analytics table

backend/modules/rfq/assist/
  rfqAssistRollout.js         ← evaluateRollout() + getShopAllowlist()
  rfqAssistEvents.repo.js     ← insertAssistEvent() + per-RFQ cap
  rfqAssist.service.js        ← getSuggestionsForRfq() + recordAssistEvent()

backend/modules/rfq/controllers/
  rfq.assist.controller.js    ← HTTP wrappers; never-throw fallbacks

backend/modules/rfq/routes/
  rfq.assist.routes.js        ← GET /suggestions, POST /events

backend/modules/rfq/index.js  ← mounts assistRouter under /api/rfq/assist
backend/config/rfq.config.js  ← adds rfqLimits.assist{Suggestions,Events}PerMinute
```

### Frontend

```
frontend/lib/rfq/rfqAssistApi.js          ← graceful axios wrappers
frontend/lib/rfq/rfqAssistAnalytics.js    ← impression dedup + dual-sink (CustomEvent + POST)
frontend/components/rfq/RfqAssistSuggestions.jsx   ← the panel component
frontend/app/rfq/t/[token]/page.js        ← +1 import, +1 JSX mount point
frontend/app/rfq/rfq-scope.css            ← appended .rfq-assist-* styles
```

Nothing outside `rfq/assist/`, the assist controller/route files,
the assist frontend files, and the two single-line/single-block
edits to `rfq/index.js` and `t/[token]/page.js` was modified.

---

## 5. Public API contract

### `GET /api/rfq/assist/suggestions`

**Auth:** `X-RFQ-Viewer-Token` header (reuses existing viewer middleware).
**Cache:** `Cache-Control: private, no-store, max-age=0`.
**Rate limit:** 60/min per viewer (env: `RFQ_RL_ASSIST_SUGGEST_MIN`).

**Response (rollout ON):**
```json
{
  "rollout": { "inRollout": true, "reason": "full-rollout" },
  "suggestions": [
    {
      "shopId": 2,
      "slug": "phutungoto355",
      "name": "Phụ tùng ô tô 355",
      "score": 70,
      "max": 100,
      "tier": "warm",
      "reasons": [
        { "key": "brandSpecialization", "label": "Chuyên Kia", "points": 20, "max": 20 },
        { "key": "modelExact", "label": "Khớp đúng model Morning", "points": 10, "max": 10 },
        { "key": "yearOverlap", "label": "Đời xe 2018 nằm trong dải sản phẩm", "points": 10, "max": 10 }
      ],
      "specialization": [
        { "brand": "Kia", "productCount": 1602, "share": 0.57 },
        { "brand": "Mazda", "productCount": 1100, "share": 0.39 }
      ],
      "signals": { "brandProducts": 1602, "partProducts": 0, "totalProducts": 2806 },
      "storefront": { "verified": true, "provinceId": 169, "lastSeenAt": "2026-05-24T..." }
    }
  ],
  "stats": { "candidates": 1, "scored": 1, "returned": 1, "dur_ms": 87, "request_dur_ms": 92 }
}
```

**Response (rollout OFF):**
```json
{
  "rollout": { "inRollout": false, "reason": "killed" },
  "suggestions": [],
  "stats": { "candidates": 0, "scored": 0, "returned": 0, "dur_ms": 1, "request_dur_ms": 1 }
}
```

### `POST /api/rfq/assist/events`

**Auth:** `X-RFQ-Viewer-Token` header.
**Body limit:** 8kb (`express.json({ limit: "8kb" })`).
**Rate limit:** 120/min per viewer (env: `RFQ_RL_ASSIST_EVENT_MIN`).

**Body:**
```json
{
  "action": "impression" | "click" | "selected" | "deselected" | "dismissed",
  "shopId":     123,           // optional; null for panel-level events
  "matchScore": 95,            // optional; tinyint(0..255)
  "matchTier":  "hot",         // optional; one of hot|warm|cold
  "source":     "viewer",      // optional; default "viewer"
  "metadata":   { ... }        // optional; ≤ 4kb serialised
}
```

**Responses:**
- `200 { ok: true, id }` — event recorded.
- `200 { ok: false, reason }` — soft reject (e.g. rfq-cap-exceeded after 200 events).
- `400 { ok: false, reason: "invalid-action"|"invalid-tier" }` — strict reject.
- `429 { code: "RATE_LIMIT", … }` — viewer over the per-minute cap.

---

## 6. Analytics feedback loop

The viewer's interactions feed two streams in parallel:

### Stream A — Backend table (`rfq_assist_events`)

Persistent. Read by future ops dashboards and ML training pipelines.
Per-RFQ soft cap of 200 events prevents single-RFQ floods.

Example real session (RFQ #119):

| id | action | shop_id | match_score | match_tier | source | created_at |
|---:|---|---:|---:|---|---|---|
| 13 | selected   |  2 | 70 | warm | viewer | 2026-05-25 09:41:19 |
| 12 | impression |  2 | 70 | warm | viewer | 2026-05-25 09:41:18 |
| 11 | impression |  2 | 70 | warm | viewer | 2026-05-25 09:39:42 |
| 10 | impression |  2 | 70 | warm | viewer | 2026-05-25 09:39:40 |
|  9 | dismissed  | NULL | NULL | NULL | viewer | 2026-05-25 09:20:17 |
|  8 | selected   |  2 | 95 | hot  | viewer | 2026-05-25 09:20:17 |
|  7 | impression |  2 | 95 | hot  | viewer | 2026-05-25 09:20:17 |

Note the impression / selected scores match what the matcher returned
at render time — analytics queries don't need to re-run the engine
to reconstruct what the buyer actually saw.

### Stream B — `window.CustomEvent('shopsite:event')`

Same payload, fired on the page before the network POST. Any global
analytics tap (existing storefront listener, future GA bridge, future
ML feedback collector) sees the event in real time even if the
network beacon never lands.

### Future feedback inputs

| Signal | Source | Downstream use |
|---|---|---|
| Impression → no selection | `impression` without subsequent `selected` for the same shopId | Negative training signal — matcher's score was high but buyer rejected. |
| Dismiss after impressions | `dismissed` with N>0 `impression`s in same RFQ | Panel utility / confidence signal. |
| Selected → quote received | join `selected` ⨝ `rfq_quotes` on shop+RFQ | Conversion signal — feeds supplier-reputation score. |
| Selected → quote accepted | join above ⨝ `rfq_quotes.status='accepted'` | Strongest positive signal — buyer's selection led to a closed deal. |

None of these consumers exist yet (Phase 8.4+); the table schema is
designed so they can be added without migration.

---

## 7. Fallback behaviour

The buyer's flow MUST work even when every part of this phase is
broken. Verified paths:

| Failure mode | Buyer experience |
|---|---|
| `RFQ_ASSIST_ENABLED=false` | Panel renders nothing; chat unaffected. |
| `RFQ_ASSIST_ROLLOUT_PCT=0` and buyer not allowlisted | Same — panel hidden. |
| Backend `/suggestions` returns 500 | `fetchRfqAssistSuggestions` resolves with `{ rollout: { reason: "fetch-failed" }, suggestions: [] }`; panel hidden. |
| Backend `/suggestions` times out (>4s) | axios timeout → same as 500. |
| Phase 8.1 engine throws | Service catches in `try/catch`, logs `rfq.assist.engine-failed`, returns empty suggestions. |
| `POST /events` returns 500 | Resolved promise with `{ ok: false }`; UI shows no error toast. |
| `INSERT` into `rfq_assist_events` fails | Service logs `rfq.assist.event-failed`; user sees no impact. |
| Per-RFQ event cap (200) exceeded | Subsequent writes return `{ ok: false, reason: "rfq-cap-exceeded" }`; UI continues to work. |
| Buyer dismissed panel earlier this session | `sessionStorage` flag prevents re-render; no API call. |
| Browser blocks 3rd-party cookies / blocks IO | Impression event simply doesn't fire; other events still work. |
| `rollout.reason: "no-buyer"` (RFQ has no phone) | Panel hidden; safe default. |

**Never breaks the buyer flow.** Confirmed by E2E tests across 4
rollout permutations and 3 failure-injection scenarios.

---

## 8. Observability

Both streams that ops uses are emitted:

| Event | Trigger | Where |
|---|---|---|
| `rfq.assist.rendered` | `getSuggestionsForRfq` returns ≥ 0 suggestions | `rfqLog.info` (JSON stream) |
| `rfq.assist.skipped` | rollout off (kill switch / percent-out / no-buyer) | `rfqLog.info` |
| `rfq.assist.engine-failed` | Phase 8.1 matcher threw | `rfqLog.error` |
| `rfq.assist.impression` | client POST with `action=impression` | `rfqLog.info` per event |
| `rfq.assist.click` | client POST with `action=click` | `rfqLog.info` per event |
| `rfq.assist.selected` | client POST | `rfqLog.info` |
| `rfq.assist.deselected` | client POST | `rfqLog.info` |
| `rfq.assist.dismissed` | client POST | `rfqLog.info` |
| `rfq.assist.event-dropped` | repo soft cap hit | `rfqLog.warn` |
| `rfq.assist.event-failed` | INSERT exception | `rfqLog.error` |

Plus the matcher's own `rfq.match.{started,completed,top-suppliers}`
events from Phase 8.1 fire on every suggestion call.

---

## 9. Test matrix

### Backend E2E (`/tmp/p82-assist-e2e.mjs`)

Run against the live dev backend with both `RFQ_ASSIST_ENABLED=true`
and `=false` permutations.

| # | Test | Result |
|---:|---|---|
| 1 | Auth: no token → 401 | PASS |
| 2 | Auth: valid token → 200 with rollout object | PASS |
| 3 | Rollout ON: ≥ 1 suggestion, score number, valid tier | PASS |
| 4 | Suggestion has ≤ 3 reason chips (UI cap) | PASS |
| 5 | Suggestion `reasons.length > 0` for real RFQ | PASS |
| 6 | Rollout OFF: `inRollout: false`, suggestions empty | PASS |
| 7 | POST impression → 200 `{ok:true}` | PASS |
| 8 | POST selected → 200 `{ok:true}` | PASS |
| 9 | POST dismissed (no shopId) → 200 `{ok:true}` | PASS |
| 10 | POST invalid action → 400 `{reason:"invalid-action"}` | PASS |
| 11 | DB rows landed with correct shopId/score/tier | PASS |

**Result:** ALL_TESTS_PASSED across both rollout states.

### Regression checks

| Surface | Method | Result |
|---|---|---|
| Apex `/api/products` | curl | 200 |
| Backend boots clean | `pm2 restart` + log tail | ✓ `[api] listening { port: 5000, rfq_module: true }` |
| RFQ create flow | not exercised — code unchanged | n/a |
| RFQ dispatch picker | grep | `pickShopIdsForMatching` unchanged |
| Frontend build | `npm run build` | clean; `/rfq/t/[token]` grew to 10.5kB |
| `/rfq/t/[token]` page renders chat | Playwright capture | ✓ identical to pre-8.2 |

### Screenshots

- `audit/screenshots/phase8.2/viewer-desktop-rollout-on.png` — panel above chat, score chip "70/100 PHÙ HỢP" amber (warm tier), trust badge, 3 reason chips.
- `audit/screenshots/phase8.2/viewer-mobile-rollout-on.png` — full-width responsive card, dismiss button top-right.
- `audit/screenshots/phase8.2/viewer-desktop-selected.png` — green "✓ Đã chọn" button after click, matching DB event row 13.

---

## 10. Future hooks (not implemented)

| Hook | Mechanism |
|---|---|
| **Automatic routing** | When confidence is high (tier=hot, score ≥ 90), feed `selected` shops directly into `runDispatchForOpenRequest`. Flag-gated. |
| **Conversion feedback loop** | Join `rfq_assist_events` ⨝ `rfq_quotes` ⨝ `rfq_dispatches` to compute per-shop "selected → quoted → accepted" funnel. |
| **Supplier reputation** | Aggregate weekly response time + accept rate from `rfq_quotes`; expose via Phase 8.1 `extraScorers`. |
| **Quote quality scoring** | Score quote responses (price reasonability, completeness, response time); fold into `extraScorers`. |
| **ML reranking** | Train GBDT or linear model on impression / selected / dismissed labels; expose via Phase 8.1 `extraScorers` hook (no scorer changes needed). |

The `rfq_assist_events` schema, the analytics dual-sink, and the
matcher's `extraScorers` hook were all designed so these can ship
incrementally without further migrations.

---

## 11. Ops runbook

### Enable internal QA only

```bash
# backend/.env
RFQ_ASSIST_ENABLED=true
RFQ_ASSIST_ROLLOUT_PCT=0
RFQ_ASSIST_ALLOWED_PHONES=+84988877766,+84988877700
# optional: restrict suggestions to QA'd shops only
RFQ_ASSIST_ALLOWED_SHOPS=phutungoto355,autopt
```

```bash
pm2 restart otofine-backend --update-env
```

### Ramp to N% of buyers

```bash
# Day 3 — 5% sample
RFQ_ASSIST_ROLLOUT_PCT=5
# Day 7 — 25%
RFQ_ASSIST_ROLLOUT_PCT=25
# Day 14 — full
RFQ_ASSIST_ROLLOUT_PCT=100
```

Each ramp is a single env flip + `pm2 restart`. Buyer bucketing is
deterministic; a buyer who was in the 5% sample stays in for 25%
and 100% (monotonic rollout).

### Emergency rollback

```bash
sed -i 's/^RFQ_ASSIST_ENABLED=.*/RFQ_ASSIST_ENABLED=false/' backend/.env
pm2 restart otofine-backend --update-env
```

Panel disappears for everyone on the next viewer page load. No
data lost — `rfq_assist_events` rows from prior interactions are
retained for retrospective analysis.

### Drop the schema (full revert)

```bash
mysql ... -e "DROP TABLE IF EXISTS rfq_assist_events;"
git revert <phase-8.2-sha>
pm2 restart otofine-backend otofine-frontend --update-env
```

---

## 12. What's next (8.3+)

| Phase | Scope | Risk |
|---|---|---|
| **8.3 — shadow dispatch** | Call matcher in parallel with `pickShopIdsForMatching`; log divergence; no actual dispatch change. | low — log-only |
| **8.4 — feedback-aware reranker** | Aggregate `rfq_assist_events` into per-shop weights; expose via `extraScorers`. | medium |
| **8.5 — guided routing** | When buyer `selected` a HOT shop, prepend that shop to the next wave's dispatch. Flag-gated. | medium |
| **8.6 — full ML rerank** | Train + serve a model on the accumulated label set. | high — own phase |
