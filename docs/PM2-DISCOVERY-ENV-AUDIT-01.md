# PM2-DISCOVERY-ENV-AUDIT-01

**Mode:** READ ONLY — không sửa file, không build, không restart, không export env, không chỉnh PM2  
**Audit date:** 2026-06-28  
**Host:** production server (`180.93.1.24`)  
**Context:** Discovery phases A1/A2/B1/B2 hoàn thành, build PASS; nghi ngờ PM2 không nhận `DISCOVERY_*` nên homepage không render Discovery Nav.

---

## Tóm tắt điều hành

| Kiểm tra | Kết quả |
|----------|---------|
| `pm2 env 0 \| grep DISCOVERY` | **Không có** (xác nhận) |
| `DISCOVERY_*` trong `/proc/<next-pid>/environ` | **Không có** |
| `frontend/.env.local` | **Có** cả 3 flag = `true` |
| `.next/server/app/index.html` (build local) | **12** discovery `<a href>` |
| `curl -A Googlebot https://otofine.com/` (live) | **12** discovery `<a href>`, size **22 269 B** (khớp build) |
| `curl … \| grep "<a " \| wc -l` | **1** (do HTML 1 dòng — **không phải** số link) |

**Kết luận ngắn:** PM2 **không** inject `DISCOVERY_*` vào OS environment — đúng như nghi ngờ. Tuy nhiên Next.js đọc `frontend/.env.local` từ disk lúc **build** và **start**. Homepage `/` được **prerender tĩnh** lúc build; sau rebuild lúc 14:17 (sau khi bật flag trong `.env.local` lúc 14:11), production **đã có** Discovery Nav trong SSR HTML. Lệnh kiểm tra `grep "<a " \| wc -l` **sai phương pháp** — luôn trả ~1 dù có 12 link vì HTML minified một dòng.

---

## 1. PM2 process — `pm2 show otofine-frontend`

| Field | Value |
|-------|-------|
| **name** | `otofine-frontend` |
| **status** | online |
| **cwd** (`exec cwd`) | `/var/www/otofine/frontend` |
| **script** | `/usr/bin/npm` |
| **script args** | `start` |
| **interpreter** | `/usr/bin/node` |
| **interpreter args** | `--trace-uncaught` |
| **exec mode** | `fork_mode` |
| **namespace** | `default` |
| **node.js version** | 20.20.2 |
| **watch & reload** | ✘ (tắt) |
| **node env** (PM2 field) | N/A |
| **ecosystem file** | **Không có** cho frontend (chỉ `backend/ecosystem.config.cjs` cho API/worker) |
| **env block tùy chỉnh** | Không — PM2 chỉ kế thừa shell env lúc start (Cursor/SSH session vars) |

**PID chain tại thời điểm audit:**

```
PM2 pid 3197958 → npm start
  └─ sh -c next start
       └─ next-server (v15.5.15) pid 3197978 — listen *:3000
```

---

## 2. Process thực tế — `ps -ef`

Frontend production chạy đúng chuỗi:

```
/usr/bin/npm start          (cwd: /var/www/otofine/frontend)
  → sh -c next start
    → next-server (v15.5.15) port 3000
```

Không có process `next dev`. Có các `next-server` orphan/test trên port 3005/3006/3010 từ session trước — **không** phải process phục vụ `otofine.com` (nginx proxy tới `:3000`).

---

## 3. `frontend/package.json` — scripts

| Script | Command |
|--------|---------|
| `build` | `next build` |
| `start` | `next start` |

**Kết luận:** PM2 chạy `npm start` → **`next start`** (production server, không phải `next dev`).

---

## 4. Nguồn env files

| File | Tồn tại | `DISCOVERY_*` |
|------|---------|---------------|
| `frontend/.env` | ❌ Không | — |
| `frontend/.env.local` | ✅ Có (sửa **2026-06-28 14:11**) | `DISCOVERY_NAV_ENABLED=true`<br>`DISCOVERY_CATEGORY_BRAND_ENABLED=true`<br>`DISCOVERY_CATEGORY_BRAND_VEHICLE_ENABLED=true` |
| `frontend/.env.production` | ❌ Không | — |
| `frontend/.env.production.local` | ❌ Không | — |
| `frontend/.env.example` | ✅ Có | Chỉ comment (default off) |

**Ghi chú:** Không có `.env.production` — mọi flag Discovery chỉ nằm trong `.env.local`.

---

## 5. PM2 có đọc env không? — `pm2 env 0`

| Biến | Có trong `pm2 env 0`? |
|------|----------------------|
| `DISCOVERY_*` | **Không** |
| `NODE_ENV` | **Không** |
| `NEXT_PUBLIC_*` | **Không** |

PM2 env 0 có ~63 dòng — chủ yếu shell/Cursor/PM2 metadata (`PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=true` là ngoại lệ duy nhất liên quan app).

**Kết luận mục 5:** PM2 process **không** mang `DISCOVERY_*`, `NODE_ENV`, hay `NEXT_PUBLIC_*` trong environment snapshot mà `pm2 env` hiển thị.

---

## 6. Ecosystem config

| File | Scope |
|------|-------|
| `backend/ecosystem.config.cjs` | `otofine-api`, `governance-risk-worker` — **không** có `otofine-frontend` |
| `frontend/ecosystem.config.*` | **Không tồn tại** |

Frontend được start thủ công: `pm2 start npm --name otofine-frontend -- start` (hoặc tương đương) — **không** qua ecosystem với `env` / `env_production`.

---

## 7. Next build — `.next/server/app/page.js`

| Kiểm tra | Kết quả |
|----------|---------|
| `DISCOVERY_NAV_ENABLED` trong bundle | ✅ Có — inlined check runtime: `String(process.env.DISCOVERY_NAV_ENABLED??"")...` |
| `isDiscoveryNavEnabled` symbol | ❌ Không (đã inline/tree-shake tên hàm) |
| `DISCOVERY_CATEGORY_*` trong `page.js` | ❌ Không (chỉ homepage bundle) |
| Prerender `index.html` | ✅ **12** `<a href>` discovery + `aria-label="Danh mục phụ tùng phổ biến"` |
| Tree-shaking flag → constant `true` | ❌ Không — vẫn đọc `process.env` trong server chunk |
| Prerender HTML | ✅ Đã generate **có nav** (build sau khi bật flag) |

**`[slug]/page.js`:** có `DISCOVERY_CATEGORY_BRAND_ENABLED` và `DISCOVERY_CATEGORY_BRAND_VEHICLE_ENABLED` (dynamic routes).

**Build timestamps:**

| Artifact | Modify time |
|----------|-------------|
| `.env.local` | 2026-06-28 **14:11** |
| `.next/BUILD_ID` | 2026-06-28 **14:17** |
| `.next/server/app/index.html` | 2026-06-28 **14:17** |

Build xảy ra **6 phút sau** khi bật flag trong `.env.local`.

**Homepage routing:** `prerender-manifest.json` — route `/` có `initialRevalidateSeconds: 3600` (ISR/static prerender, không phải fully dynamic).

---

## 8. Runtime env — `/proc/3197978/environ`

Đọc environ của `next-server` (pid 3197978):

| Biến | Có? |
|------|-----|
| `DISCOVERY_*` | **Không** |
| `NODE_ENV` | **Không** |
| `NEXT_PUBLIC_*` | **Không** |

**Lưu ý kỹ thuật:** `/proc/<pid>/environ` chỉ phản ánh env **lúc exec**; Next.js có thể gán `process.env` từ `.env.local` sau khi process khởi động — các biến đó **không** xuất hiện trong `/proc/environ`. Tuy nhiên absence trong PM2 + absence trong `/proc` xác nhận **không ai inject DISCOVERY qua PM2/shell**.

---

## 9. Build env source

Next.js load order (production):

1. `.env.production.local` — không tồn tại  
2. `.env.local` — **có**, chứa `DISCOVERY_*=true`  
3. `.env.production` — không tồn tại  
4. `.env` — không tồn tại  

**Kết luận:** Build lúc 14:17 dùng **`frontend/.env.local`** làm nguồn duy nhất cho `DISCOVERY_*`. Không có bằng chứng build dùng file env khác.

PM2 log (`/root/.pm2/logs/otofine-frontend-out.log`) chỉ ghi `next start` — không log env source.

---

## 10. Deploy / restart workflow

Từ các audit doc trong repo (pattern lặp lại):

```
cd frontend && npm run build
pm2 restart otofine-frontend
```

**Không** dùng `pm2 reload ecosystem.config.js --env production` cho frontend (không có ecosystem frontend).

PM2 log cho thấy nhiều lần `npm start` / `next start` restart; lần gần nhất trùng build 14:17.

**Rủi ro vận hành đã xác định:** `pm2 restart` **không** tái-build `.next`. Nếu chỉ sửa `.env.local` rồi restart → homepage prerender **không đổi** cho đến khi `npm run build`.

---

## 11. Kiểm tra production live (Googlebot UA)

### Homepage `/`

```
curl -s -A "Googlebot" https://otofine.com/ | wc -c
→ 22269  (khớp .next/server/app/index.html)

Discovery links (grep -o):
→ /ma-phanh-truoc-o-to, /can-truoc-o-to, … (12 links)

aria-label "Danh mục phụ tùng phổ biến" → present
```

### Lệnh kiểm tra của operator (sai phương pháp)

```bash
curl -A "Googlebot" https://otofine.com | grep "<a " | wc -l
# → 1

curl -A "Googlebot" https://otofine.com | grep -o '<a ' | wc -l
# → 12  (đúng số link discovery)
```

**Nguyên nhân:** HTML response là **1 dòng** (minified). `grep` đếm **dòng khớp**, không đếm **occurrence**. Một dòng chứa 12 `<a href` vẫn cho `wc -l = 1`.

### Category page B1 (dynamic) — `/ma-phanh-o-to`

```
HTTP 200, size 34114 B
Brand discovery hrefs: /ma-phanh-toyota, /ma-phanh-kia, /ma-phanh-mazda, …
```

Dynamic routes (`export const dynamic = "force-dynamic"` trong `app/[slug]/page.js`) đọc env lúc request — Next load `.env.local` lúc server start từ project root.

---

## 12. Phân tích root cause

### Hai hiện tượng tách biệt

| Hiện tượng | Giải thích có bằng chứng |
|------------|--------------------------|
| `pm2 env 0 \| grep DISCOVERY` rỗng | PM2 start `npm` không có ecosystem `env`; DISCOVERY không export qua shell → **đúng, luôn rỗng** dù Next đọc `.env.local` |
| `grep "<a " \| wc -l` = 1 | HTML 1 dòng → **false negative**; thực tế có 12 link discovery **ngay cả khi Discovery đang bật** |
| Discovery không có trước build 14:17 | Homepage **static prerender** — flag trong `.env.local` chỉ có hiệu lực sau `next build`; restart alone không đủ (audit trước GOOGLE-INDEXABILITY-FINAL ghi nhận 0 discovery href) |

---

## 13. Đề xuất fix (không sửa source Discovery)

### Cách sửa chuẩn, ít rủi ro

1. **Giữ flag trong `frontend/.env.local`** (hoặc tạo `frontend/.env.production.local` cho prod-only — tách khỏi dev).
2. **Mỗi lần đổi `DISCOVERY_NAV_ENABLED`:** bắt buộc chạy:
   ```bash
   cd /var/www/otofine/frontend && npm run build && pm2 restart otofine-frontend
   ```
3. **Verify đúng:**
   ```bash
   curl -s -A "Googlebot" https://otofine.com/ | grep -o '<a href="/[^"]*"' | wc -l
   # kỳ vọng ≥ 12

   curl -s -A "Googlebot" https://otofine.com/ | grep -c 'Danh mục phụ tùng phổ biến'
   # kỳ vọng ≥ 1
   ```
4. **Không dùng `pm2 env | grep DISCOVERY`** làm health check — biến này **không** được PM2 inject; đó là hành vi bình thường.

### Tùy chọn hardening (ops, không đụng code Discovery)

- Tạo `frontend/ecosystem.config.cjs` với `env_production` mirror flags + `NODE_ENV=production` — giúp `pm2 env` visible và explicit.
- Hoặc export flags trong deploy script **trước** `npm run build` để build và runtime đồng bộ.

### Rollback

```bash
# Tắt trong .env.local
DISCOVERY_NAV_ENABLED=false
DISCOVERY_CATEGORY_BRAND_ENABLED=false
DISCOVERY_CATEGORY_BRAND_VEHICLE_ENABLED=false

cd /var/www/otofine/frontend && npm run build && pm2 restart otofine-frontend
```

---

ROOT CAUSE:
Homepage Discovery Nav được **prerender tĩnh lúc `next build`**; `DISCOVERY_*` chỉ có trong `frontend/.env.local` (không qua PM2 ecosystem). Trước rebuild 2026-06-28 14:17 (sau khi bật flag 14:11), artifact `.next` cũ không chứa nav. **`pm2 restart` alone không cập nhật prerender.** Đồng thời, lệnh kiểm tra `grep "<a " | wc -l` báo **1** do HTML minified một dòng — **không phản ánh** số link thực (12 link đã có sau rebuild).

EVIDENCE:
- `pm2 show otofine-frontend`: cwd `/var/www/otofine/frontend`, script `npm start` → `next start`, không ecosystem frontend, không env block DISCOVERY.
- `pm2 env 0 | grep DISCOVERY` → rỗng; `/proc/3197978/environ` → không có DISCOVERY/NODE_ENV/NEXT_PUBLIC.
- Chỉ `frontend/.env.local` chứa 3 flag `=true` (modify 14:11); không có `.env.production*`.
- `.next/BUILD_ID` + `index.html` modify **14:17** (sau env); `index.html` có 12 discovery `<a href>`.
- Live `curl -A Googlebot https://otofine.com/` → 22 269 B, 12 discovery hrefs, label `Danh mục phụ tùng phổ biến` present — khớp build artifact.
- `grep "<a " | wc -l` = **1** nhưng `grep -o '<a ' | wc -l` = **12** (HTML 1 newline).
- `prerender-manifest.json`: `/` static/ISR — không dynamic per-request.
- Deploy pattern repo: `npm run build` → `pm2 restart` (restart không rebuild).

FIX:
Sau mỗi thay đổi `DISCOVERY_*`: `cd frontend && npm run build && pm2 restart otofine-frontend`. Verify bằng `grep -o '<a href=' | wc -l` hoặc grep label discovery, **không** dùng `grep "<a " | wc -l`. Tùy chọn: thêm `frontend/ecosystem.config.cjs` với `env_production` để PM2/env audit rõ ràng (ops-only, không sửa source Discovery).

CONFIDENCE:
**92%**
