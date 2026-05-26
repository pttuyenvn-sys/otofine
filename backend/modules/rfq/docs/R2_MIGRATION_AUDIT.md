# RFQ Image Storage → Cloudflare R2 — Phase 0 Audit

**Date:** 2026-05-19  
**Status:** Audit complete. Production upload flow **unchanged**. Isolated R2 service + test script added (Phases 2–4 only).

---

## Executive summary

RFQ images today are **100% local disk** under `uploads/rfq/`, served by Express static at `/uploads/`.  
Product catalog images already use **Cloudflare R2** via separate env (`R2_BUCKET`, `R2_KEY_ID`, etc.).  
RFQ must use a **dedicated bucket** (`otofine-rfq`) and **prefixed env vars** (`RFQ_R2_*`) so product R2 is never broken.

---

## Upload entry points

| Flow | Method | Route | Controller / service | Storage helper |
|------|--------|-------|-------------------|----------------|
| Guest create (OTP pending) | POST | `/api/rfq/upload-image` | `rfq.public.controller.rfqUploadImage` | inline `fs.writeFile` → `uploads/rfq/` |
| Buyer/shop chat staging | POST | `/api/rfq/conversations/:dispatchId/upload-image` | `rfq.conversation.controller.uploadMessageImage` → `rfqConversation.service.uploadConversationImage` | `saveConversationImageBuffer()` |
| RFQ create submit | POST | `/api/rfq/create` | `rfqPublic.service.createRfqDraft` | stores `imageUrls[]` in DB only (files already uploaded) |

**Multer:** `modules/rfq/middlewares/rfqMulter.middleware.js`  
- `memoryStorage()` only (no disk multer for RFQ)  
- Field name: `file`  
- Max: `RFQ_UPLOAD_MAX_BYTES` (default 5MB)  
- MIME: jpeg, png, webp, gif  

---

## Sharp pipeline

**File:** `modules/rfq/utils/rfqImageProcess.js`  
**Function:** `processRfqGuestUpload(buffer)`

1. Reject empty / over max bytes  
2. `sharp(buffer).rotate()` (EXIF)  
3. Validate format ∈ {jpeg, png, webp, gif}  
4. Megapixel guard (`RFQ_IMG_MAX_MEGAPIXELS`, default 24MP)  
5. Resize long edge ≤ `RFQ_IMG_MAX_WIDTH` (default 1600px), no upscale  
6. Output JPEG mozjpeg quality ~78  
7. Metric log: `rfq.upload.image_optimized`

Used by:
- Guest upload controller (direct)
- `saveConversationImageBuffer()` (chat)

---

## Where files are saved

```
{process.cwd()}/uploads/rfq/{uuid}.jpg
```

**Writers:**
- `rfq.public.controller.js` — guest upload
- `rfqConversationImageStorage.js` — `saveConversationImageBuffer()`

**URL returned to clients:**
```
/uploads/rfq/{uuid}.jpg
```

Always relative path (not absolute URL).

---

## Static serving

**File:** `backend/server.js`

```js
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
```

**Nginx:** `modules/rfq/NGINX_RFQ_UPLOAD.md` — `/uploads/` must proxy to Express (not Next.js).

**Frontend resolver:** `frontend/lib/rfq/rfqMediaUrl.js` → `rfqImageSrc()` prepends `API_ORIGIN` for relative paths.

---

## DB fields storing image paths

| Table | Column | Format | Notes |
|-------|--------|--------|-------|
| `rfq_requests` | `images_json` | JSON array of strings | e.g. `["/uploads/rfq/uuid.jpg"]` — guest RFQ photos |
| `rfq_message_attachments` | `url` | string | Chat staged/sent images — same path pattern |

**No separate R2 column today.** Quotes do not store image URLs in a separate table (quote text only).

**Validation:** `utils/rfqCreateValidation.js` — max 10 `imageUrls`, must be strings.

**Seed messages:** First conversation load copies `rfq_requests.images_json` into timeline as seed image bubble (`rfqConversation.service.js`).

---

## Retention / cleanup

**Job:** `jobs/rfqUploadRetention.js`  
- Deletes old files in `uploads/rfq/` by mtime  
- Env: `RFQ_UPLOAD_RETENTION_DAYS` (0 = off)  
- Does **not** update DB references

---

## Existing R2 (products only — do not reuse bucket)

| File | Purpose |
|------|---------|
| `config/r2.js` | S3 client for products |
| `utils/r2-sdk.js` | Generic `uploadToR2(buffer, key)` |
| `middlewares/upload.js` | multer-s3 for legacy product flows |
| `services/productImage.service.js` | Product image pipeline |

**Product env (already in production `.env`):**
- `R2_ENDPOINT`, `R2_KEY_ID`, `R2_SECRET`, `R2_BUCKET`, `R2_PUBLIC_URL`

⚠️ **Do not set `R2_BUCKET=otofine-rfq` globally** — that would redirect product uploads.

---

## Frontend contracts (must preserve until Phase 7)

| API response | Shape |
|--------------|-------|
| Guest upload | `{ url: "/uploads/rfq/....jpg" }` |
| Chat upload | `{ attachmentId, url: "/uploads/rfq/....jpg" }` |

Frontend files:
- `lib/rfq/rfqUploadImage.js`
- `lib/rfq/rfqConversationUpload.js`
- `lib/rfq/rfqMediaUrl.js`

---

## Migration phases (checklist)

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Audit (this doc) | ✅ Done |
| 1 | Cloudflare bucket + keys + CDN | ☐ Ops (manual) |
| 2 | Env vars only (`RFQ_R2_*`, disabled) | ✅ `.env.rfq-r2.example` |
| 3 | Isolated `rfqR2Upload.service.js` | ✅ Done (not wired) |
| 4 | `scripts/test-rfq-r2-upload.js` | ✅ Done |
| 5 | Dual-write (local + R2, R2 fail silent) | ✅ Implemented (`RFQ_R2_DUAL_WRITE=true` to enable) |
| 5b | Production observability + verify script | ✅ Counters, startup log, `scripts/verify-rfq-r2-production.js` |
| 6 | Store both URLs (log or JSON metadata) | ☐ Not started |
| 7 | Read path prefers R2, fallback local | ☐ Not started |
| 8 | Disable local write | ☐ Not started |
| 9 | Migrate old files | ☐ Not started |
| 10 | Cleanup local logic | ☐ Not started |

---

## Recommended dual-write insertion points (Phase 5)

1. **`saveConversationImageBuffer()`** — single helper for chat; add R2 upload after local write  
2. **`rfqUploadImage` controller** — guest upload; same pattern  
3. Shared wrapper: `persistRfqImage(jpegBuf) → { localUrl, r2Url? }`

**Rule:** Local write succeeds first; R2 is best-effort when `RFQ_R2_DUAL_WRITE=true`.

---

## Rollback

- Set `RFQ_R2_ENABLED=false` and `RFQ_R2_DUAL_WRITE=false`  
- All reads still use `/uploads/rfq/` paths in DB  
- Zero frontend change required until Phase 7
