# Shop Zalo Unification — Bug-Fix Phase A.1

**Status:** SHIPPED
**Scope:** storefront ↔ unified settings Zalo number drift
**Compatibility:** fully backward — no API contract, column, or route changes

---

## 1. The drift, in one shop row

After the Phase A settings merge, the legacy `/api/shop/me` write
(used by the Basic tab) populated `shops.zalo`, while the public-page
`/api/shop/public-page` write (used by the Storefront tab)
populated `shops.zalo_phone`. The storefront read was
`COALESCE(zalo_phone, zalo)` — so a fresh save in the Basic tab
could be silently overridden by a stale value in the public-page tab.

Observed in production:

```
id=2  slug=phutungoto355
  zalo       = 0847770777   ← saved via /shop/settings (Basic tab)
  zalo_phone = 0914489595   ← stale value from the public-page tab
```

The storefront kept rendering `0914489595` while `/shop/settings`
clearly showed `0847770777`. Drift survey across all 8999 shop rows
revealed exactly **one** drifted row + 8998 with both columns empty.

---

## 2. Root cause

Three independent contributors:

| # | Where | Problem |
|---|---|---|
| 1 | `backend/.../shopPublic.repository.js` | `COALESCE(s.zalo_phone, s.zalo)` — wrong precedence: the secondary column wins over the unified canonical |
| 2 | `backend/controllers/shop.controller.js` `updateMyShop` | writes `zalo` but never mirrors to `zalo_phone` |
| 3 | `backend/.../sellerPublicPage.service.js` `updateMyPublicPage` | writes `zalo_phone` but never mirrors to `zalo` |

Compounded by: `/api/shop/me` never invalidated the storefront LRU+TTL
cache (5 min TTL), so even when the new value did surface in the DB,
the storefront could keep serving the stale cached row.

---

## 3. The single source of truth — `resolveShopZalo()`

Two copies of the same tiny pure helper:

```text
backend/utils/resolveShopZalo.js          ← server-side canonical
frontend/lib/shopsite/resolveShopZalo.js  ← client mirror
```

**Priority (identical in both):**

1. `shop.zalo`            — unified `/shop/settings` canonical
2. `shop.zalo_phone`      — public-page legacy fallback
3. `shop.phone`           — only when caller passes `{ phoneFallback: true }`

Empty strings count as missing. Always returns a string (possibly
`""`), never `null`/`undefined` — so call sites can drop their guards.

**Why duplicate?** The frontend bundle must not import from
`/backend`; keeping two ~30-line files in lockstep is cheaper than
introducing a shared package.

---

## 4. The fix, surface by surface

### Backend — reads (every SQL projection now prefers `zalo`)

```sql
-- Before
COALESCE(s.zalo_phone, s.zalo) AS zalo

-- After (3 repos: shopPublic, shopDirectory, rfqShopSpecialization)
COALESCE(NULLIF(s.zalo, ''), NULLIF(s.zalo_phone, '')) AS zalo
```

`NULLIF` is critical: an empty string in `zalo` no longer beats a
populated `zalo_phone`. The DTO projection (`toPublicDto`,
`toSellerDto`) additionally runs `resolveShopZalo(row)` for defense
in depth — any code path that bypasses the repo (tests, future
refactors) still gets the canonical answer.

### Backend — writes (bidirectional mirror, both endpoints)

Both save paths now persist BOTH columns from a single user input.

**`/api/shop/me`** (`backend/controllers/shop.controller.js`)

```js
if (data.zalo != null) {
  const normalized = String(data.zalo).trim() || null;
  data.zalo = normalized;
  data.zalo_phone = normalized;   // mirror
}
// + invalidateShop(shop.slug) after Shop.update
```

**`/api/shop/public-page`** (`backend/.../sellerPublicPage.service.js`)

```js
if (data.zalo_phone !== undefined) {
  const normalized = String(data.zalo_phone).trim() || null;
  data.zalo_phone = normalized;
  data.zalo = normalized;         // mirror
}
// invalidateShop() was already wired here
```

`Shop.model.js` `update()` ALLOWED list gained `zalo_phone`; the
public-page repo's `PATCHABLE_COLUMNS` gained `zalo` — both are
additive, the existing PATCH semantics are preserved.

### Backend — `Shop.create()`

New shops now insert into BOTH columns in a single statement so they
start in-sync. No more "I'll fill in Zalo later from the public-page
tab" silent fork.

### Backend — `/api/shop/me` GET response

```js
res.json({ ...shop, zalo: resolved, zalo_phone: resolved });
```

So the Basic tab on `/shop/settings` hydrates from the resolved value
the storefront will render. Any pre-existing drift on rows that have
not yet been re-saved is masked at the response boundary.

### Frontend — `/shop/settings` linked inputs

The two Zalo fields (Section A and Section E) now share state via a
client-side mirror in their `onChange` handlers:

```jsx
<FieldText label="Zalo (số/link)"
  value={basic.zalo}
  onChange={(v) => { setB("zalo", v); setP("zaloPhone", v); }}
  hint="Đồng bộ với mục E (Liên hệ & mạng xã hội) — chỉ cần điền một nơi." />

<FieldText label="Zalo (số/link — storefront)"
  value={pub.zaloPhone}
  onChange={(v) => { setP("zaloPhone", v); setB("zalo", v); }}
  hint="Đồng bộ với Zalo ở mục A — sửa ở đâu cũng được." />
```

On data load, both fields hydrate from `resolveShopZalo({ zalo, zaloPhone })`
so they start in lockstep, never showing the user two different
"current" values.

### Frontend — storefront read sites

All three places that derive a Zalo from a shop DTO now route through
the helper:

| File | Function | Before | After |
|---|---|---|---|
| `app/(shopsite)/shops/[slug]/layout.js` | `mapToHeaderShape` | `shop.zalo \|\| shop.phone` | `resolveShopZalo(shop, { phoneFallback: true })` |
| `app/(shopsite)/shops/[slug]/layout.js` | `mapToCtaShape` | same | same |
| `app/(shopsite)/shops/[slug]/page.js` | `toContactShape` | `shop.zalo \|\| shop.phone` | `resolveShopZalo(shop, { phoneFallback: true })` |

`ShopHeader.jsx`, `ShopFloatingMobileCTA.jsx`, `ShopContactCard.jsx`
already read `shop.zalo` from the DTO — they automatically pick up
the corrected value once their input source is normalized.

JSON-LD (`buildShopJsonLd.js`) only writes `telephone: shop.phone` — no
explicit Zalo field — so no change required.

### DB — Migration 042 (idempotent backfill)

`backend/migrations/042_shop_zalo_sync_backfill.sql`

Two-pass UPDATE that aligns every drifted or one-sided row:

```sql
UPDATE shops SET zalo_phone = zalo
 WHERE zalo IS NOT NULL AND TRIM(zalo) <> ''
   AND (zalo_phone IS NULL OR TRIM(zalo_phone) = '' OR zalo_phone <> zalo);

UPDATE shops SET zalo = zalo_phone
 WHERE (zalo IS NULL OR TRIM(zalo) = '')
   AND zalo_phone IS NOT NULL AND TRIM(zalo_phone) <> '';
```

Pre-migration: `1 drifted, 0 only_zalo, 0 only_zalo_phone, 0 in_sync, 8998 both_empty`
Post-migration: `8999 in_sync, 0 still_drifted, 8999 total`

Migration is idempotent — re-running is a no-op.

---

## 5. Verification matrix

### Backend (16/16 PASS) — `/tmp/zalo-sync-test.mjs`

| # | Assertion |
|---|---|
| 1 | baseline.in.sync — shop #2 zalo == zalo_phone after migration |
| 2 | legacy.write.zalo — `Shop.update({zalo: 'X'})` writes zalo column |
| 3 | legacy.write.mirror — same update also writes zalo_phone |
| 4 | publicpage.write.ok — `updateMyPublicPage({zalo_phone: 'Y'})` returns ok |
| 5 | publicpage.write.phone — zalo_phone column written |
| 6 | publicpage.write.mirror.zalo — zalo column ALSO written |
| 7 | clear.zalo_phone — empty string → both columns NULL |
| 8 | clear.zalo.mirror — same |
| 9..15 | resolveShopZalo helper: prefers zalo, falls back to zalo_phone, phoneFallback opt-in, handles null, trims whitespace, accepts camelCase |
| 16 | restore — final state preserved for next run |

### Cache invalidation (4/4 PASS) — `/tmp/zalo-cache-invalidation-test.mjs`

| # | Assertion |
|---|---|
| 1 | cache.stale.before.invalidation — pre-fix bug is reproducible |
| 2 | cache.refreshed.after.invalidation — `invalidateShop(slug)` evicts |
| 3 | controller.flow.fresh.value — full controller mirror + invalidate succeeds |
| 4 | restore — original value preserved |

### End-to-end (read-path audit)

```
$ curl /api/public/shops/phutungoto355         → zalo = "0847770777"  ✓
$ curl /api/public/shops/phutungoto355/contact → zalo = "0847770777"  ✓
$ SELECT zalo, zalo_phone FROM shops WHERE id=2 → both "0847770777"   ✓
```

### Storefront screenshot

`audit/screenshots/zalo-fix/storefront-contact.png` — every Zalo
surface on `/shops/phutungoto355/lien-he` renders `0847770777`:

- Top utility bar phone display
- Hero "Nhắn tin" / "Gọi ngay" CTAs
- Contact card → "Điện thoại" row
- Contact card → "Zalo" row
- "Hỗ trợ nhanh" panel → `Gọi ngay: 0847770777`
- "Nhắn Zalo" button → `https://zalo.me/0847770777`

The stale `0914489595` no longer appears anywhere in the DOM.

---

## 6. Compatibility guarantees

- **No columns dropped or renamed.** `shops.zalo` and `shops.zalo_phone` both retained.
- **No API contracts changed.** `/api/shop/me`, `/api/shop/public-page`, `/api/public/shops/<slug>`, `/api/public/shops/<slug>/contact` all return the same JSON shape they did before. Older API clients that read only `zalo` or only `zalo_phone` keep working — both now carry the same value.
- **Migration is additive.** No `ALTER TABLE`, just `UPDATE` on existing rows. No downtime, no lock contention (single small table, ~9k rows).
- **`zalo.service.js` (RFQ OA escalation) unaffected.** It already only reads `shops.zalo`; with the new write-side mirror it sees the same canonical value the storefront does.

---

## 7. Operational rollback (if ever needed)

Pure code revert restores the pre-fix behaviour — the columns are
left as-is, both still populated, so the new code can be redeployed
later without DB work. The migration itself is non-destructive and
needs no rollback.

```bash
git revert <bug-fix-sha>
pm2 restart otofine-backend otofine-frontend --update-env
```
