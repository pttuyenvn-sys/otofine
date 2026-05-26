# RFQ conversational media messaging

Additive image chat on top of existing RFQ create uploads and text conversations.

## Architecture

```
Client (composer)
  → POST /api/rfq/conversations/:dispatchId/upload-image  (stage)
  → POST /api/rfq/conversations/:dispatchId/messages      { text?, attachmentIds[] }
  → rfq_messages (message_type=image) + rfq_message_attachments
  → GET  …/messages (attachments joined)
  → OneSignal push (async, active-view suppression)
```

| Layer | Responsibility |
|--------|----------------|
| `rfq_message_attachments` | Normalized URLs per message; staging rows have `message_id` NULL until send |
| `rfq_messages` | `message_type` `image` / `text`; caption in `message_text` |
| `rfqImageProcess.js` | Same sharp pipeline as guest create |
| `rfqConversationPush.service.js` | Buyer + shop push for text and images |
| Seed `rfq_request_images` | First `GET …/messages` copies `rfq_requests.images_json` into timeline once per room |

## API (additive)

| Method | Path | Body |
|--------|------|------|
| POST | `/api/rfq/conversations/:dispatchId/upload-image` | multipart `file` → `{ attachmentId, url }` |
| POST | `/api/rfq/conversations/:dispatchId/messages` | `{ text?, attachmentIds? }` (unchanged text-only calls) |
| GET | `/api/rfq/conversations/:dispatchId/messages` | items include `attachments[]` |

Auth: same as text — shop JWT or `x-rfq-viewer-token`.

Limits: 6 attachments/message, 5MB pre-sharp, 24h staging expiry.

## Migration

```bash
cd backend && npm run migrate:rfq:message-attachments
```

## Rollout order

1. Run migration `032`
2. Deploy backend (routes + seed + push)
3. Deploy frontend (picker UX + composer + timeline)
4. Verify nginx `/uploads/` → Express (see `NGINX_RFQ_UPLOAD.md`)

## Backward compatibility

- Guest `POST /api/rfq/upload-image` + `publicId` unchanged
- Text-only `POST …/messages` unchanged
- Quote timeline unchanged
- Polling / read cursors unchanged

## Production concerns

| Risk | Mitigation |
|------|------------|
| Orphan staged attachments | 24h expiry on send; optional cron cleanup later |
| CPU on concurrent chat uploads | Client max 2 parallel; same as create |
| Push while viewing thread | `last_read_at` + cursor check (~20s) |
| Initial image seed on every poll | Idempotent `metadata_json.seed` |
| WebSocket later | `message_created` event can reuse same payload shape |

## Audit notes

- **Create picker:** camera input has `capture=environment`; gallery input does not — fixes forced camera on mobile.
- **Submit block:** explicit reasons (`uploading`, `upload_failed`, `invalid_form`, `pending_draft`).
- **Preview URLs:** `rfqImageSrc()` + nginx `/uploads/` proxy.
- **Future WS:** emit `{ dispatchId, message }` after commit; no API contract change.
