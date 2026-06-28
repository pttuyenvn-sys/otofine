# UNDO-MOBILE-RESTORE-IMPLEMENT-01

**Mode:** IMPLEMENT (undo via Git only)  
**Date:** 2026-06-28  
**Status:** **STOP — Git cannot recover the pre-restore state automatically**

---

## Executive summary

**MOBILE-RESTORE-IMPLEMENT-01 was not undone.** The repository cannot be returned to the state immediately before that restore using Git alone (`reflog`, `reset`, `checkout`, `restore`, or `revert`).

The pre-restore Mobile UX work existed only as **uncommitted working-tree changes** and **untracked files**. MOBILE-RESTORE-IMPLEMENT-01 overwrote modified tracked files with `git checkout 28effe4 -- <file>` and **permanently deleted** untracked Mobile UX files from disk. That state was never committed, stashed, or branched, so Git has no snapshot to restore.

Per task instructions: **no manual reconstruction was attempted.**

---

## Git investigation

### Commands run

```bash
git reflog -20
git log -5 --oneline
git status
git stash list
git branch -a
git log --all --oneline -- frontend/components/pages/home/hooks/useVehicleQuickPanel.js
git log --all --oneline -- frontend/components/pages/home/sections/MobileDrawers.jsx
git fsck --lost-found
git fsck --unreachable
```

### Reflog entry restored

**None.** No Git operation was performed for the undo.

### HEAD before / after (unchanged)

| | Commit | Message |
|---|--------|---------|
| **Previous HEAD** (before MOBILE-RESTORE-IMPLEMENT-01) | `28effe4` | `refactor: modularize Home.jsx orchestration rendering` |
| **Current HEAD** | `28effe4` | `refactor: modularize Home.jsx orchestration rendering` |

MOBILE-RESTORE-IMPLEMENT-01 did **not** move HEAD. It only changed the working tree and index for selected paths via checkout, then deleted untracked files outside Git.

Latest reflog entries:

```
28effe4 HEAD@{0}: commit: refactor: modularize Home.jsx orchestration rendering
19497f5 HEAD@{1}: commit: extract: ListingHero presentation
508a4a3 HEAD@{2}: checkout: moving from refactor/homejsx-safe-steps to fix/numeric-slug-routing
```

### Stash

```
(empty)
```

### Branches

No branch contains Mobile UX commits. Current branch: `fix/numeric-slug-routing` at `28effe4`.

### Unreachable objects (`git fsck`)

Only two unreachable blobs found — both are `.env`-style database config fragments (84 and 79 lines). **No Home.jsx, MobileDrawers, or hook blobs** were recoverable.

---

## What MOBILE-RESTORE-IMPLEMENT-01 did

Documented in `docs/MOBILE-RESTORE-IMPLEMENT-01.md`:

1. **`git checkout 28effe4 --`** on 13 tracked frontend files (Home surface + import dependencies).
2. **Manual deletion** of 12 Mobile UX files that did not exist at `28effe4` (untracked at that revision).

This is **not reversible** with `git reset --hard HEAD@{n}` or `git revert`, because HEAD never changed and the lost content was never in the object database.

---

## Git operation used for undo

**None — blocked.**

Recommended automatic undo (if a snapshot had existed) would have been one of:

- `git checkout HEAD@{n} -- <files>` from a reflog entry capturing pre-restore index/worktree, or
- `git stash pop` / `git reset --hard` to a commit containing Mobile UX.

Neither applies: **no such snapshot exists.**

---

## Files that could not be recovered

### Overwritten tracked files (pre-restore uncommitted Mobile UX edits lost)

These now match commit `28effe4` exactly (~2741-line `Home.jsx`, pre–Mobile UX UI):

| File |
|------|
| `frontend/components/pages/Home.jsx` |
| `frontend/components/pages/Home.css` |
| `frontend/components/pages/home/VehicleQuickPanel.jsx` |
| `frontend/components/pages/home/HomeSearch.jsx` |
| `frontend/components/pages/home/HomeHeader.jsx` |
| `frontend/components/pages/home/LeftNav.jsx` |
| `frontend/components/pages/home/PopularCategoriesBox.jsx` |
| `frontend/components/pages/home/ProductGridWrapper.jsx` |
| `frontend/components/pages/home/SeoContent.jsx` |
| `frontend/components/pages/home/FilterBar.jsx` |
| `frontend/components/pages/home/ListingHero.jsx` |
| `frontend/components/pages/home/SearchSuggestPanel.jsx` |

Pre-restore characteristics (from MOBILE-RESTORE-IMPLEMENT-01 audit): ~1339-line modular `Home.jsx`, bottom nav **Danh mục**, Phase 3B shop rail, `useVehicleQuickPanel` hook, mobile sheets via `MobileDrawers.jsx`.

### Permanently deleted untracked files (not in Git history)

| File | Phase |
|------|-------|
| `frontend/components/pages/home/listing/PopularVehicleModelsSection.jsx` | 1 |
| `frontend/components/pages/home/listing/LeftNav.jsx` | 1 / 2 |
| `frontend/components/pages/home/listing/PopularCategoriesSection.jsx` | 2 |
| `frontend/components/pages/home/listing/PopularCategoriesBox.jsx` | 2 |
| `frontend/components/pages/home/sections/MobileDrawers.jsx` | 1 / 2 / 3B |
| `frontend/components/pages/home/sections/MobileShopSellerSection.jsx` | 3B |
| `frontend/components/pages/home/sections/ShopRecommendSection.jsx` | 3B |
| `frontend/components/pages/home/sections/RightRail.jsx` | 3B |
| `frontend/components/pages/home/shop/mapMarketplaceToShopDirectoryParams.js` | 3B |
| `frontend/components/pages/home/shop/buildShopDirectoryFetchUrl.js` | 3B |
| `frontend/components/pages/home/hooks/useVehicleQuickPanel.js` | 1* |
| `frontend/components/pages/home/header/HomeHeader.jsx` | Cleanup |

\*Hook extraction was part of the Mobile UX working tree but never committed.

Confirmed absent on disk: `MobileDrawers.jsx`, `useVehicleQuickPanel.js` (glob search returns 0 files).

### Untouched (as required)

Backend, database, SEO, Discovery, sitemap, and canonical paths were **not modified** by MOBILE-RESTORE-IMPLEMENT-01 and were **not modified** by this undo attempt.

---

## Build result (current state — restore **not** undone)

```bash
cd frontend && npm run build
```

**Result:** PASS (exit 0), Next.js 15.5.15

Current home surface reflects **post–MOBILE-RESTORE-IMPLEMENT-01** (`28effe4` baseline), not pre-restore Mobile UX.

Compile warning (unchanged from restore doc):

```
export 'buildHomePageTitle' was not found in '@/lib/seo/homePageTitle'
```

---

## Verification checklist (not satisfied — undo blocked)

| Check | Expected (pre-restore) | Actual (now) |
|-------|------------------------|--------------|
| Desktop matches pre-restore Mobile UX state | Yes | **No** — `28effe4` inline drawers |
| Hero section (current Mobile UX) | Restored | **No** — baseline hero |
| Current Home page (modular ~1339 lines) | Restored | **No** — ~2741 lines at `28effe4` |
| Desktop vehicle panel (Mobile UX behaviour) | Works | Baseline `28effe4` behaviour only |
| Desktop category panel (Mobile UX behaviour) | Works | Baseline only |
| Current Search UI | Restored | **No** — pre–search-refactor UI |
| Current Shop rail (Phase 3B) | Restored | **No** — `.of-shop-rec` absent |
| Discovery still present | Yes | **Yes** — not touched |
| Canonical still present | Yes | **Yes** — not touched |

---

## Why Git cannot undo automatically

1. **Target state was never a commit.** Mobile UX Phases 1, 2, 3B, and Cleanup lived in uncommitted edits on branch `fix/numeric-slug-routing` at `28effe4`.
2. **`git checkout 28effe4 -- <file>` discards uncommitted diffs** without creating a reflog entry for the discarded content.
3. **Deleted Mobile UX files were untracked** — never `git add`’d — so they were never stored as Git objects and cannot be restored with `git checkout` or `git restore`.
4. **No stash, no backup branch, no dangling blob** contains the lost Home.jsx or Mobile UX module content.

---

## Possible recovery paths (out of scope for this task)

Only if the user explicitly approves **non-Git** recovery:

1. **Re-implement** Mobile UX from phase docs (`docs/MOBILE-UX-PHASE-*.md`, `docs/MOBILE-CLEANUP-01.md`).
2. **IDE local history** (Cursor/VS Code) if snapshots exist on the deployment machine.
3. **Filesystem backup** outside this repository, if one exists.

This deliverable intentionally does **not** perform any of the above.

---

## Conclusion

**UNDO-MOBILE-RESTORE-IMPLEMENT-01 is blocked.** Git has no automatic path to the state immediately before MOBILE-RESTORE-IMPLEMENT-01. Manual file reconstruction was not attempted per instructions.
