# RFQ R2 Mirror Coverage — Production Verification

**Phase:** Production validation (pre–Phase 7)  
**Rule:** LOCAL = source of truth · R2 = async mirror only

---

## Mirrored flows (dual-write when `RFQ_R2_ENABLED=true` + `RFQ_R2_DUAL_WRITE=true`)

| Flow | HTTP route | Category key | R2 path prefix | Buyer/Shop |
|------|------------|--------------|----------------|------------|
| Guest RFQ create images | `POST /api/rfq/upload-image` | `request` | `rfq/request/YYYY/MM/` | Buyer (pre-OTP) |
| Chat staged images | `POST /api/rfq/conversations/:dispatchId/upload-image` | `chat` | `rfq/chat/YYYY/MM/` | Buyer **and** Shop (same handler) |

Both use:
1. `processRfqGuestUpload()` (sharp)
2. `persistRfqJpegLocally()` → `/uploads/rfq/{uuid}.jpg`
3. `scheduleRfqR2Mirror()` (fire-and-forget)

---

## NOT mirrored (by design)

| Flow | Reason |
|------|--------|
| `POST /api/rfq/create` with `imageUrls[]` | URLs already uploaded via `/upload-image`; no new bytes |
| Quote messages | No image upload endpoint for quotes |
| Request image seed in timeline | Reads existing `images_json` URLs; no new upload |
| Product / shop catalog R2 | Separate product bucket + pipeline |
| Historical local-only files | Migrated in Phase 9 (future) |

---

## Observability

### Startup (PM2 / server boot)
When `RFQ_MODULE_ENABLED=true`, logs:
```
[RFQ R2] RFQ R2 enabled: true/false
[RFQ R2] RFQ R2 dual write: true/false
[RFQ R2] RFQ R2 local fallback: true/false
...
```

### Runtime counters (in-process, reset on restart)
| Counter | Meaning |
|---------|---------|
| `rfq_r2_uploads_total` | Local saves completed |
| `rfq_r2_mirror_attempts` | Async mirror jobs started |
| `rfq_r2_mirror_success` | R2 PUT succeeded |
| `rfq_r2_mirror_failed` | R2 PUT failed (any reason) |
| `rfq_r2_mirror_timeout` | Subset of failed — timeout |
| `rfq_r2_mirror_skipped` | Dual-write inactive at upload time |

### Admin API
`GET /api/admin/rfq/health` → `r2` object with metrics snapshot.

### Debug timing (optional)
Set `RFQ_R2_DEBUG=true` for extra logs:
- mime, input/processed bytes
- sharp / local / total upload duration
- R2 mirror duration

---

## Verification script

```bash
cd /var/www/otofine/backend

# Config + public URL + byte consistency (needs R2 enabled)
RFQ_R2_ENABLED=true RFQ_R2_DUAL_WRITE=true node scripts/verify-rfq-r2-production.js

# Failure safety — local must succeed even if R2 fails
node scripts/verify-rfq-r2-production.js --failure-safety

# Public URL check only
node scripts/verify-rfq-r2-production.js --curl-url https://cdn.otofine.com/rfq/...
```

---

## Phase 7 gate (do NOT enable until)

- [ ] Several days zero upload failures
- [ ] `mirror_failed / mirror_attempts` near zero
- [ ] Public curl checks pass
- [ ] No PM2 memory/latency regression
- [ ] Local + R2 byte consistency spot-checks pass
