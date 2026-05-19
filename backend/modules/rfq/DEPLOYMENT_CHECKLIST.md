# RFQ Sprint 1 — deployment & rollback checklist

## Env (defaults must be OFF in production)

- `RFQ_MODULE_ENABLED=false` — master gate
- `RFQ_ZALO_ESCALATION_ENABLED=false`
- `RFQ_SMS_ESCALATION_ENABLED=false`
- `RFQ_OTP_DEV_RETURN=false` (enable only on staging to return OTP JSON)
- `RFQ_VIEWER_SECRET` — optional; falls back to `JWT_SECRET`
- `RFQ_OTP_SECRET` — optional; falls back to `JWT_SECRET`
- `RFQ_DEDUPE_WINDOW_HOURS` — fingerprint cooldown window for active RFQs (default `24`)
- `RFQ_RL_VIEWER_TOKEN_IP_MIN` — cap `GET /api/rfq/by-token` per IP per minute (default `90`)
- `RFQ_RL_SHOP_QUOTE_MIN` — cap `POST …/quote` per shop per minute (default `40`)
- `RFQ_UPLOAD_MAX_BYTES` — guest image upload limit (default `5242880`)
- **Sprint 2:** `RFQ_ZALO_WEBHOOK_URL` / `RFQ_ZALO_WEBHOOK_SECRET` — webhook bridge → Zalo OA/ZNS (staging first)
- **Sprint 2:** `RFQ_ZALO_ESCALATION_DELAY_SEC` (default `300`), `RFQ_ESCALATION_MAX_ATTEMPTS`, `RFQ_ESCALATION_BACKOFF_BASE_SEC`, `RFQ_ESCALATION_WORKER_POLL_MS`
- **Sprint 2:** `RFQ_IMG_MAX_WIDTH`, `RFQ_IMG_MAX_HEIGHT`, `RFQ_IMG_MAX_MEGAPIXELS`
- **Sprint 2:** `RFQ_TOUCH_DEBOUNCE_MINUTES` — `shops.last_seen_at` debounce (default `2`)
- **Sprint 2:** `RFQ_ONLINE_RECENT_MINUTES` — boost shops trong dispatch matching (default `15`)
- **Sprint 2:** `RFQ_UPLOAD_RETENTION_DAYS` — cron xóa file `uploads/rfq/` (default `0` = tắt; khuyến nghị staging ≥ `90`)

## Migrations

1. Backup DB snapshot.
2. `cd backend && npm run migrate:rfq`
3. **Sprint 1.5 hardening:** `cd backend && npm run migrate:rfq:hardening`
4. **Sprint 2:** `cd backend && npm run migrate:rfq:sprint2`
5. Verify tables/columns: Sprint 1–1.5 columns **plus** `rfq_escalation_jobs`, `rfq_quotes.line_type`.
6. **Buyer web push (`rfq_push_subscriptions`)** — run in order when using `POST /api/rfq-push/register` or quote push deep links:
   - `npm run migrate:rfq:push-subscriptions` — `025` (base table)
   - `npm run migrate:rfq:push-viewer-token` — `026` (`viewer_link_token`, legacy/unused by current app code)
   - `npm run migrate:rfq:push-viewer-path` — `027` (`viewer_path`, required by register + notify)

### Rollback — push subscription `viewer_path` (`027`)

- **Production already has column:** `027` is a no-op; safe to run anytime.
- **Rollback (only if reverting app code that writes `viewer_path`):**  
  `ALTER TABLE rfq_push_subscriptions DROP COLUMN viewer_path;`  
  Do **not** drop while `rfqPush.controller.js` / `rfqShop.service.js` still INSERT/SELECT `viewer_path` — register will return 500 and quote pushes may skip notify.
- **Do not drop `viewer_link_token`** unless explicitly deprecating; harmless NULL column.

## Rollback DB (manual)

See comment block at bottom of `migrations/020_rfq_sprint1_mvp.sql`. Sprint 1.5 rollback hints: bottom of `migrations/021_rfq_hardening_sprint15.sql`.

## Sprint 1.5 — RFQ hardening (anti-spam, integrity, observability)

### Hardening changes (summary)

| Area | Change |
|------|--------|
| Dedup | SHA-256 fingerprint on phone + normalized vehicle key + keyword snippet; transactional lock (`FOR UPDATE`) + soft-merge pending OTP rows |
| Quotes | One submitted quote per dispatch row (`UNIQUE(dispatch_id)`); `SELECT … FOR UPDATE` + insert + duplicate-key fallback for races |
| Views | Atomic bump under transaction: `first_viewed_at`, `web_viewed_at`, `view_count`; audit distinguishes first vs repeat |
| Viewer token | IP rate limit on `GET /by-token`; in-memory brute-force tiers per IP / token-prefix; structured logs on invalid token |
| Upload | MIME whitelist + sharp decode validation + JPEG re-encode (EXIF stripped); UUID `.jpg` filenames only |
| Audit | Same `rfq_status_logs` rows mirrored to structured JSON logs (`rfq.audit`) |
| Metrics | JSON metric lines: `rfq.request.created`, `rfq.dispatch.wave_completed`, `rfq.dispatch.view`, `rfq.quote.submitted`, etc. |

### Security improvements

- **Spam / duplicate RFQ**: cooldown HTTP 429 `DEDUPE_COOLDOWN` when an active RFQ (`open` \| `dispatching` \| `quoted`) shares the same fingerprint within `RFQ_DEDUPE_WINDOW_HOURS` (default 24). Terminal rows (`closed` \| `expired` \| `cancelled`) do not block new drafts.
- **Token entropy**: viewer tokens use `crypto.randomBytes(32)` (256-bit). Prefer dedicated secrets **≥32 characters**: `RFQ_VIEWER_SECRET` / `JWT_SECRET`.
- **Brute-force**: tune `RFQ_VIEWER_BRUTE_IP_MAX`, `RFQ_VIEWER_BRUTE_LOCK_MS`, `RFQ_VIEWER_BRUTE_TOKEN_MAX` (see `utils/rfqViewerThrottle.js`).
- **Upload abuse**: multer cap (`RFQ_UPLOAD_MAX_BYTES`), MIME filter, sharp verifies bitmap formats; metadata stripped via JPEG recompression.

### DB constraints added (`021_rfq_hardening_sprint15.sql`)

- `rfq_requests.dedupe_fingerprint` (`CHAR(64)` nullable) + index `(dedupe_fingerprint, created_at)`.
- `rfq_dispatches.first_viewed_at`, `view_count`.
- `rfq_quotes.dispatch_id` → **NOT NULL**, **UNIQUE `uq_quote_dispatch`**, FK `fk_quote_dispatch` → `rfq_dispatches(id)`.
- Migration removes duplicate legacy quotes (same `rfq_request_id` + `shop_id`) and orphan quotes without a dispatch row match **before** constraints — validate on non-empty environments.

### Internal QA checklist

1. **Spam / dedupe**: Same phone + vehicle + description twice within window → second returns `429` + `existingPublicId`; duplicate pending OTP → merges (`dedupeMerged: true`).
2. **Duplicate quote**: Double-submit `POST …/quote` → first `201`, second `200` + `{ idempotent: true }`; DB single quote per `dispatch_id`.
3. **Stale dispatch**: Concurrent quotes → UNIQUE + transaction prevents double active quote per dispatch.
4. **Invalid viewer token**: Wrong token → `404` + log `rfq.viewer.invalid`; burst → `429` VIEWER_LOCKED / VIEWER_TOKEN_BRUTE.
5. **Upload abuse**: Oversized → `UPLOAD_TOO_LARGE`; wrong type → rejected; output always normalized `.jpg`.
6. **Auth edge cases**: Shop APIs use `req.shop.id`; PATCH view scoped by dispatch ownership under row lock.

### Risk report

| Risk | Severity | Note |
|------|----------|------|
| Dedupe fingerprint race (two simultaneous creates) | Low | Rare; no partial unique index in MVP |
| Migration deletes orphan quotes | Medium if legacy data messy | Backup before `021` |
| In-memory limits / brute counters | Medium multi-instance | Redis recommended when scaling horizontally |
| Setting global RFQ status `quoted` on first shop quote | Product | Existing MVP semantics |

### Staging readiness (`RFQ_MODULE_ENABLED=true`)

- [ ] Migrations `020` + **`021`** applied.
- [ ] Strong secrets (`JWT_SECRET`, `RFQ_VIEWER_SECRET`, `RFQ_OTP_SECRET`).
- [ ] Logs aggregated (JSON lines with `"svc":"rfq"`).
- [ ] `/uploads/rfq` writable; smoke path create → verify → viewer → shop view → quote idempotent → upload.

### Optional — token rotation (design)

Single-column `viewer_token_hash`: rotating invalidates prior links immediately — acceptable only if UX confirms replacement token delivery (SMS/profile). Prefer TTL + dedupe cooldown over frequent rotation.

## API (when module ON)

- `POST /api/rfq/create`
- `POST /api/rfq/upload-image` (multipart `file` + `publicId`)
- `POST /api/rfq/verify-otp`
- `GET /api/rfq/by-token` + header `X-RFQ-Viewer-Token`
- Shop: `GET /api/shop/rfq/inbox`, `PATCH /api/shop/rfq/:dispatchId/view`, `GET /api/shop/rfq/:dispatchId`, `POST /api/shop/rfq/:dispatchId/quote`

## Frontend

- Guest: `/rfq/new` → `/rfq/success` → `/rfq/t/[token]`
- Seller: `/rfq/shop/inbox` → `/rfq/shop/[dispatchId]`

## QA manual

1. Flag OFF → `/api/rfq/create` returns 404 (routes not mounted).
2. Flag ON + migration → create → OTP in server log → verify → token page loads quotes.
3. Shop login → inbox lists dispatches → open detail marks viewed → submit quote → customer token page shows quote.

## Tests

`cd backend && npm run test:rfq`

Workers / cron (Sprint 2):

- `npm run worker:rfq-escalation` — process riêng (không nhúng vào `server.js`)
- `npm run cron:rfq-escalation-repair` — stale lock + enqueue missed jobs (timer systemd/cron)
- `npm run cron:rfq-upload-retention` — dọn file RFQ cũ khi `RFQ_UPLOAD_RETENTION_DAYS` > 0

---

## Sprint 2 — Seller inbox optimization & real Zalo escalation

### OUTPUT — Inbox UX changes

- API `GET /api/shop/rfq/inbox` — query `filter` (`all`|`unread`|`quoted`|`expired`), `sort` (`sla`|`recent`), `limit`, `offset`; SLA-first sorting + unread highlight fields (`first_viewed_at`).
- API `GET /api/shop/rfq/inbox/summary` — `unreadCount` badge.
- Frontend `/rfq/shop/inbox` — chips filter, SLA countdown, pagination “Tải thêm”, CTA “Báo giá nhanh”, layout mobile-first; CSS chỉ trong `.rfq-scope` (`rfq-scope.css`).
- Frontend `/rfq/shop/[dispatchId]` — quick quote (giá + loại hàng + ghi chú), loading / double-submit guard (`submitLock` + disabled), sticky/hẹp quote bar mobile.

### OUTPUT — Queue architecture

- Bảng `rfq_escalation_jobs`: delayed `run_at`, status (`queued`|`processing`|`sent`|`skipped`|`dead`), `idempotency_key` UNIQUE per dispatch wave1 Zalo, `locked_until` cho stale recovery.
- Worker `jobs/rfqEscalation.worker.js`: poll `FOR UPDATE SKIP LOCKED`, xử lý batch, backoff reschedule / dead letter sau max attempts.
- Repair `jobs/rfqEscalation.repair.js`: unlock stale `processing`, enqueue missed rows (điều kiện giống processor skip rules).

### OUTPUT — Zalo escalation implementation

- Provider abstraction `providers/zaloEscalation.provider.js` — POST JSON signed (`X-Rfq-Zalo-Signature` HMAC) tới `RFQ_ZALO_WEBHOOK_URL` (team nối sang Zalo OA/ZNS). Không hard-code HTTP Zalo OA trong repo.
- Điều kiện gửi (processor): **không** gửi nếu `web_viewed_at` đã set; skip nếu đã quoted / dispatch terminal / RFQ hết hạn / đã `zalo_notified_at`.
- Enqueue sau mỗi dispatch wave (`rfqEscalation.schedule.js`) khi `RFQ_ZALO_ESCALATION_ENABLED=true`.

### OUTPUT — Metrics dashboard

- Counter process-local `rfqObservability.service.js` (`rfqCounterInc`) — song song `rfqLog.metric`.
- Admin `GET /api/admin/rfq/metrics` — funnel 24h (viewed rate, quote rate, zalo_dependency_rate), backlog, latency trung bình 7 ngày.

### OUTPUT — Admin visibility plan

- API `GET /api/admin/rfq/health` — snapshot queue + funnel + recent skipped/dead jobs JSON (JWT **admin**).
- FE `/rfq/admin/health` — đọc JSON (đăng nhập `/admin/login`).

### OUTPUT — Image pipeline integration

- Không nhân đôi pipeline product/R2 — RFQ guest vẫn `uploads/rfq/`.
- `utils/rfqImageProcess.js` — sharp decode, guard megapixel (`RFQ_IMG_MAX_MEGAPIXELS`), resize bounded (`RFQ_IMG_MAX_*`), JPEG + strip metadata (như pattern production sharp hiện có).
- Cron retention `jobs/rfqUploadRetention.js` + env `RFQ_UPLOAD_RETENTION_DAYS`.

### OUTPUT — Staging rollout checklist

- [ ] Migrate `022`.
- [ ] `RFQ_MODULE_ENABLED=true` staging only initially.
- [ ] `RFQ_ZALO_ESCALATION_ENABLED=true` staging + webhook bridge đã verify.
- [ ] `RFQ_SMS_ESCALATION_ENABLED=false`.
- [ ] Chạy worker + cron repair trong systemd/timer.
- [ ] Theo dõi JSON logs `svc":"rfq"` + `/api/admin/rfq/health`.
- [ ] Rollback: tắt flags → worker noop; DB jobs có thể giữ hoặc purge manual.

### OUTPUT — Operational risk report

| Risk | Note |
|------|------|
| Single-instance counters | `rfqCounterInc` không đồng bộ multi-pod — dùng log/metrics collector cho SLA chính xác |
| Webhook reliability | Retry exponential đến `dead`; repair cron tái enqueue chỉ khi **không** có job row |
| `line_type` column | Code assumes migration `022` deployed before quote submissions |
| Worker không chạy | Zalo delay chờ worker — repair cron giảm miss |

---

## Closed Beta — Operations & tuning (023)

**Internal Closed Beta (staging + seller thật + ma trận test + go/no-go):** xem chi tiết [`INTERNAL_CLOSED_BETA_RUNBOOK.md`](./INTERNAL_CLOSED_BETA_RUNBOOK.md).

### Migrate & env

- [ ] Chạy `npm run migrate:rfq:closed-beta` sau `022` (thêm `spam_flag`, `rfq_customer_events`).
- [ ] Dispatch tuning (đã có trong `rfq.config.js`): `RFQ_DISPATCH_MAX_SHOPS`, `RFQ_DISPATCH_MAX_PER_RFQ`, `RFQ_DISPATCH_RESPOND_BY_HOURS`, `RFQ_ONLINE_RECENT_MINUTES`, `RFQ_T1_ONLINE_TIMEOUT_MINUTES`.

### Admin APIs (JWT admin)

| Method | Path |
|--------|------|
| GET | `/api/admin/rfq/analytics/funnel?days=7` |
| GET | `/api/admin/rfq/analytics/sellers?days=30&limit=40` |
| GET | `/api/admin/rfq/analytics/ux?days=7` |
| POST | `/api/admin/rfq/ops/replay-escalation/:dispatchId` |
| POST | `/api/admin/rfq/ops/dispatch-append/:rfqRequestId` |
| POST | `/api/admin/rfq/ops/spam/:rfqRequestId` (+ JSON `{ "reason": "..." }`) |
| POST | `/api/admin/rfq/ops/close/:rfqRequestId` (+ optional reason) |
| GET | `/api/admin/rfq/ops/seller/:shopId/activity?days=30` |

---

### OUTPUT (1) Operational analytics plan

- **Funnel cohort**: RFQ tạo trong cửa sổ thời gian, không spam (`spam_flag`).
- **Stages**: created → có dispatch → seller đã `first_viewed_at` → có báo giá submitted → buyer event `customer_quotes_surface_view` → RFQ `quoted`/`closed` (proxy accept).
- **Metrics**: `% conversion` và `% drop-off` giữa hai bậc liền kề; latency trung bình RFQ→dispatch đầu, RFQ→view seller đầu, RFQ→quote đầu; chất lượng phản hồi seller qua `% quote đúng hạn vs respond_by`.

### OUTPUT (2) Seller metrics plan

- Rollup theo `shop_id` trên dispatch có `web_notified_at` trong cửa sổ: **avg first view time**, **avg quote time**, **quote rate**, **viewed-no-quote rate**, **escalation dependency** (`zalo_notified_at`), **success proxy** (dispatch có quote).
- Dùng `/analytics/sellers` + `/ops/seller/:id/activity` để lọc seller inactive / phụ thuộc Zalo.

### OUTPUT (3) Dispatch tuning plan

- Toàn bộ **env-driven** trong `rfqDispatchTuning` + `rfqT1OnlineTimeoutMinutes()`; không magic number trong service dispatch (wave cap, max dispatch/RFQ, SLA hours, online boost window, T1 timeout escalation).

### OUTPUT (4) Internal tooling plan

- Replay escalation (job Zalo idempotency key mới), append wave dispatch, spam+cancel RFQ, đóng RFQ tay, inspection hoạt động seller — có audit log (`rfq_status_logs`).

### OUTPUT (5) Beta rollout checklist

- **Seller onboarding**: batch mời + whitelist shop_ids matching trước khi mở traffic rộng.
- **Training nội bộ**: SLA inbox, quick quote, khi nào chờ Zalo vs web.
- **Traffic staged**: bật RFQ cho % buyer hoặc segment địa lý; theo dõi funnel + backlog escalation jobs.
- **RFQ quality**: spam flag operations + dashboard funnel drop sau OTP verify.

### OUTPUT (6) Conversion optimization plan

- Giảm drop **seller_web_viewed**: chỉnh `RFQ_ONLINE_RECENT_MINUTES`, wave size, `RFQ_T1_ONLINE_TIMEOUT_MINUTES`.
- Giảm **viewed-no-quote**: cohort seller training + inbox SLA UI đã có Sprint 2.
- Tăng **user_viewed_quotes**: thông báo buyer khi có quote mới (channel hiện có); đo `quote_surface_when_quotes_exist_pct` qua `/analytics/ux`.
- **Buyer notification CTR**: cần deeplink tracking — xem note trong payload `/analytics/ux`.

