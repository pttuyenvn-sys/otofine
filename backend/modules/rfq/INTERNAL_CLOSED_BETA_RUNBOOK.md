# RFQ — Internal Closed Beta Runbook

**Mục tiêu:** vận hành beta nội bộ **trên staging/production có kiểm soát**, verify end-to-end với seller/buyer thật — **không** mở rộng feature.

**Đối tượng:** DevOps + Product/Ops + seller pilot.

---

## OUTPUT — chỉ dẫn nhanh

| Deliverable | Section |
|-------------|---------|
| (1) Staging verification report | §1 + biểu mẫu **Staging verification sign-off** |
| (2) Seller onboarding checklist | §2 |
| (3) RFQ simulation results | §3 matrix + bảng **Kết quả chạy** (điền sau khi test) |
| (4) Mobile QA report | §4 + `frontend/app/rfq/CLOSED_BETA_UX_QA.md` |
| (5) Operational tuning notes | §6 |
| (6) Go / no-go recommendation | §8 |

---

## PHẦN 1 — Staging deployment

### Checklist deploy staging

| # | Hạng mục | Mong đợi |
|---|-----------|----------|
| 1 | `RFQ_MODULE_ENABLED` | `true` |
| 2 | `RFQ_ZALO_ESCALATION_ENABLED` | `true` (staging có webhook bridge đã test) |
| 3 | `RFQ_SMS_ESCALATION_ENABLED` | **`false`** |
| 4 | Worker escalation | Process `npm run worker:rfq-escalation` chạy ổn định (systemd/pm2/k8s) |
| 5 | Cron repair | `npm run cron:rfq-escalation-repair` theo lịch (vd mỗi 5–15 phút) |
| 6 | Cron retention (tuỳ chọn) | `npm run cron:rfq-upload-retention` khi `RFQ_UPLOAD_RETENTION_DAYS` > 0 |
| 7 | Admin JWT | User admin có quyền gọi `/api/admin/rfq/*` |
| 8 | Webhook Zalo | `RFQ_ZALO_WEBHOOK_URL` / `RFQ_ZALO_WEBHOOK_SECRET` khớp bridge staging |

### Migrations & schema

Chạy **theo thứ tự** `020 → 021 → 022 → 023`:

```bash
cd backend && npm run migrate:rfq
npm run migrate:rfq:hardening   # 021 nếu script repo map đúng
npm run migrate:rfq:sprint2     # 022
npm run migrate:rfq:closed-beta # 023 — spam_flag + rfq_customer_events
```

Verify nhanh (MySQL):

- Bảng `rfq_escalation_jobs` tồn tại; có job `queued` / `sent` / `dead` khi chạy thử.
- Cột `rfq_requests.spam_flag`, bảng `rfq_customer_events` sau `023`.

### Filesystem & frontend

| Kiểm tra | Cách verify |
|----------|-------------|
| `uploads/rfq/` writable | Tạo RFQ có ảnh guest → file xuất hiện trên disk/Ceph mount |
| Token URL không SEO | Layout `frontend/app/rfq/t/[token]/layout.js`: `robots: { index: false, follow: false }` ✓ |

### Admin analytics routes (JWT admin)

Sau đăng nhập admin, smoke:

- `GET /api/admin/rfq/health`
- `GET /api/admin/rfq/analytics/funnel?days=7`
- `GET /api/admin/rfq/analytics/sellers?days=14&limit=20`
- `GET /api/admin/rfq/analytics/ux?days=7`

### Staging verification sign-off *(điền khi xong)*

| Hạng mục | OK | Người verify | Ngày | Ghi chú |
|----------|:--:|--------------|------|---------|
| Env flags (RFQ ON, Zalo ON, SMS OFF) | ☐ | | | |
| Migrations 020–023 | ☐ | | | |
| Worker escalation | ☐ | | | |
| Cron repair | ☐ | | | |
| Upload retention (nếu bật) | ☐ | | | |
| Admin analytics HTTP 200 | ☐ | | | |
| uploads/rfq writable | ☐ | | | |
| noindex token pages | ☐ | | | |

---

## PHẦN 2 — Test seller setup

### Seller onboarding checklist

- [ ] **5–10 seller thật** đã có tài khoản shop staging/production pilot.
- [ ] Mỗi seller có **sản phẩm/listing thật** (để matching không “ảo”).
- [ ] **Đa hãng xe**: chia cohort ít nhất 3 nhóm xe (VD: Toyota / Honda / Ford hoặc tương đương thị trường VN).
- [ ] **Zalo test**: mỗi shop có SĐT/Zalo nhận được escalation test (staging OA/ZNS hoặc sandbox team).
- [ ] **Mobile-heavy**: khuyến nghị ≥70% thao tác inbox/báo giá trên điện thoại trong tuần pilot.
- [ ] **SLA cam kết nội bộ**: seller đồng ý phản hồi trong khung giờ làm việc pilot (ghi rõ trong nhóm chat pilot).

### Quick reference seller training (1 slide / tin nhắn)

1. Vào `/rfq/shop/inbox` — ưu tiên RFQ có SLA đỏ/cam.
2. Mở RFQ → **Báo giá ngay** (ưu tiên web trước Zalo).
3. Giữ app Otofine mở/alerts để giảm miss escalation.

---

## PHẦN 3 — Real RFQ simulation

### Ma trận kịch bản *(ghi PASS/FAIL sau khi chạy)*

| ID | Kịch bản | Chuẩn bị | Bước chính | Kỳ vọng quan sát | Kết quả | Ngày |
|----|-----------|-----------|------------|------------------|---------|------|
| S1 | RFQ có ảnh | Guest flow | Tạo RFQ + upload ≥1 ảnh → OTP → token buyer | Ảnh hiển thị buyer + seller thấy mô tả đầy đủ | | |
| S2 | RFQ không ảnh | Guest flow | Tạo RFQ không ảnh | Dispatch + inbox vẫn chạy | | |
| S3 | Seller “online” | Shop có `last_seen_at` gần (`RFQ_ONLINE_RECENT_MINUTES`) | Tạo RFQ | Shop online được ưu tiên trong wave (định tính qua analytics sellers) | | |
| S4 | Seller “offline” | Shop không vào app ≥ window online | Tạo RFQ | Vẫn có thể dispatch; có thể phụ thuộc wave/Zalo cao hơn | | |
| S5 | Multiple quotes | ≥2 shop trên cùng RFQ | Hai seller submit quote | Buyer token sort/thấp nhất + ≥2 quote hiển thị | | |
| S6 | Stale RFQ | RFQ gần `expires_at` / SLA dispatch | Theo dõi inbox SLA đỏ | UI SLA + escalation đúng policy | | |
| S7 | Escalation triggered | Không mở web / không quote trước delay | Để quá `RFQ_ZALO_ESCALATION_DELAY_SEC` hoặc T1 timeout | Job `sent` hoặc skip đúng rule; log webhook | | |
| S8 | Replay escalation | Admin có JWT | `POST /api/admin/rfq/ops/replay-escalation/:dispatchId` | Job mới enqueue; không duplicate key collision | | |
| S9 | Append dispatch wave | RFQ còn slot | `POST .../ops/dispatch-append/:rfqRequestId` | Wave mới + audit log | | |
| S10 | Spam RFQ | Admin | `POST .../ops/spam/:rfqRequestId` | `spam_flag`, cancelled; không trong inbox seller | | |

### Kết quả tổng hợp *(điền sau pilot)*

- **Pass rate ma trận:** ___ / 10  
- **Blocker P0:** …  
- **Bug P1:** …  
- **Quyết định:** §8  

---

## PHẦN 4 — Mobile QA

Verify tối thiểu:

| # | Hạng mục | Device | OK |
|---|-----------|--------|:--:|
| M1 | iPhone Safari — inbox + báo giá | | ☐ |
| M2 | Android Chrome — inbox + báo giá | | ☐ |
| M3 | Thời gian báo giá &lt; 60s (mục tiêu UX &lt;10s nhập form) | | ☐ |
| M4 | Keyboard không che ô giá / nút submit | | ☐ |
| M5 | Upload ảnh từ camera / thư viện (`/rfq/new`) | | ☐ |
| M6 | Slow 3G (DevTools throttle) — không crash, có skeleton/feedback | | ☐ |

Chi tiết UI: `frontend/app/rfq/CLOSED_BETA_UX_QA.md`.

---

## PHẦN 5 — Observability verification

| # | Kiểm tra | Nguồn |
|---|-----------|--------|
| O1 | Funnel analytics | `GET .../analytics/funnel` — cohort có dữ liệu sau vài RFQ thật |
| O2 | Seller analytics | `GET .../analytics/sellers` — shop pilot xuất hiện, quote_rate hợp lý |
| O3 | UX analytics | `GET .../analytics/ux` — events buyer sau khi mở token (migration `023`) |
| O4 | Escalation backlog | `GET .../health` → `recent_escalations` / snapshot queue |
| O5 | Dead / skipped jobs | Cùng health JSON + DB `rfq_escalation_jobs` status `dead` |
| O6 | Replay ops | §3 S8 + audit `rfq_status_logs` (`to_status` như `ops_replay_escalation`) |

Logs ứng dụng: dòng có `"svc":"rfq"` (theo code hiện tại).

---

## PHẦN 6 — Operational tuning

Điều chỉnh **chỉ qua env**, sau khi có dữ liệu pilot (latency thật, Zalo dependency):

| Biến | Ý nghĩa | Khi nào tăng/giảm |
|------|---------|-------------------|
| `RFQ_T1_ONLINE_TIMEOUT_MINUTES` | Grace “online-first” trước enqueue Zalo | Seller phản hồi web nhanh → có thể **tăng** để giảm Zalo spam |
| `RFQ_DISPATCH_MAX_SHOPS` | Wave size | Cần coverage rộng → tăng nhẹ; spam inbox → giảm |
| `RFQ_DISPATCH_MAX_PER_RFQ` | Trần dispatch / RFQ | Quá nhiều shop chạm 1 RFQ → giảm |
| `RFQ_ZALO_ESCALATION_DELAY_SEC` | Trễ gửi Zalo | Seller kêu Zalo sớm → **tăng** delay |
| `RFQ_ONLINE_RECENT_MINUTES` | Cửa sổ “online recently” matching | Muốn ưu tiên seller hay vào app → tăng window |
| Sort inbox SLA | Frontend `sort=sla` | Giữ mặc định; đổi `recent` khi debug |

**Ghi chú pilot *(điền)*:**

- Median RFQ → first quote (giây): ___  
- `seller_inbox_open_proxy_pct` (UX analytics): ___  
- `escalation_dependency_rate_pct` trung vị seller: ___  
- Đề xuất env sau tuning: ___  

---

## PHẦN 7 — Internal feedback loop

| Kênh | Tần suất | Nội dung thu thập |
|------|-----------|-------------------|
| Chat seller pilot | Hàng ngày trong tuần 1 | Độ khó inbox, SLA, Zalo có phiền không |
| Form/Messenger buyer | Sau mỗi RFQ đóng (tuỳ chọn) | Hiểu trạng thái, so giá, friction OTP |
| Ops sync | 2×/tuần | Funnel drop bậc nào, dead jobs, spam RFQ |
| UX friction log | Sheet liên tục | Copy không hiểu / nút khó bấm / lỗi mạng |

**Owner:** ___ **Deadline review tuần 1:** ___  

---

## PHẦN 8 — Go / No-go checklist

### GO — mở beta rộng hơn *(ví dụ thêm seller hoặc traffic buyer)*

- [ ] Ma trận §3 đạt ≥ **80%** PASS, **không** P0 mở.
- [ ] Worker + repair cron **ổn định 7 ngày** (không backlog job queued kẹt dài).
- [ ] Zalo webhook staging **tỉ lệ lỗi &lt; ngưỡng team** (ghi số cụ thể).
- [ ] Seller pilot **quote_rate** và **time-to-quote** trong ngưỡng đã thống nhất.
- [ ] Buyer funnel: không có drop bất thường ở bậc “dispatch → seller view” so với baseline pilot.

### NO-GO — tiếp tục tuning / giữ nội bộ

- [ ] Dead jobs tăng đột biến hoặc webhook fail liên tục.
- [ ] Seller churn pilot / không vào inbox mobile.
- [ ] RFQ spam / abuse không kiể soát được (dùng `spam_flag` + review matching).

### Khuyến nghị *(điền sau pilot)*

| | |
|--|--|
| **Khuyến nghị** | ☐ GO rộng hơn · ☐ NO-GO tuning · ☐ Giữ pilot thêm ___ tuần |
| **Lý do ngắn** | |
| **Người ký duyệt** | |

---

*Tài liệu này bổ sung `DEPLOYMENT_CHECKLIST.md` (env, migrations, rollback).*
