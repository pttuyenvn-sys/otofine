# SEARCH-MOBILE-KEYBOARD-UX-01

**Date:** 2026-06-22  
**Objective:** Improve mobile search UX — overlay on focus, dismiss keyboard on scroll/tap, lock body scroll so only results scroll.

**Build:** `npm run build` — **PASS**

---

## Problem

On mobile, the on-screen keyboard stayed open while browsing search results. Results were hidden behind the keyboard, and scrolling the list did not dismiss it.

---

## Solution

| Trigger | Behavior |
|---------|----------|
| Search input focused (mobile) | Full-screen **search overlay** (`of-mobile-search-overlay`); body scroll locked (`of-mobile-search-overlay-active`) |
| User scrolls result list | `blur()` on input + `document.activeElement.blur()` — keyboard hides |
| User touches/moves finger on results | `touchmove` on dropdown → same dismiss |
| User taps a result | Immediate keyboard dismiss before navigation |
| Submit / clear / Escape | Keyboard dismissed |

---

## Implementation

### Shared helper

`frontend/lib/search/dismissMobileSearchKeyboard.js` — blurs the search ref and any focused element.

### `HomeSearch.jsx`

- `mobileOverlayActive = isMobile && suggestPanelOpen`
- Body lock effect: `position: fixed` + saved `scrollY` restore on exit
- Scroll + `touchmove` listeners on `.home-search-dropdown` and inner scroll panels
- `dismissKeyboardIfMobile()` on product pick, category pick, submit, clear, Escape

### `Home.css` (mobile `@media`)

- `body.of-mobile-search-overlay-active` — `overflow: hidden`, `position: fixed`, full width
- `.of-mobile-search-overlay` — fixed full viewport, flex column; `.home-search-dropdown` flex-grows and scrolls (`overscroll-behavior: contain`)

### `Home.jsx`

- `handleQuickProductClick` also calls `dismissMobileSearchKeyboard(ofSearchInputMobileRef)` when `fromMobileSearch`

---

## Validation

```bash
cd frontend && npm run build
pm2 restart otofine-frontend
node frontend/scripts/validate-search-mobile-keyboard-ux-01.mjs
```

Playwright iPhone 13 viewport (`390×844`):

| Check | Result |
|-------|--------|
| Body lock class + `overflow: hidden` on focus | **PASS** |
| Mobile overlay class on search panel | **PASS** |
| Scroll / touchmove blurs input | **PASS** |
| Result tap blurs input | **PASS** |

**Manual targets:** Android Chrome, Samsung Internet, iPhone Safari — overlay + scroll-dismiss behavior should match (native keyboard cannot be asserted in headless).

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/search/dismissMobileSearchKeyboard.js` | **NEW** — shared blur helper |
| `frontend/components/pages/home/HomeSearch.jsx` | Overlay mode, body lock, scroll/touch dismiss |
| `frontend/components/pages/Home.css` | Mobile search overlay + body lock styles |
| `frontend/components/pages/Home.jsx` | Dismiss keyboard on mobile product navigation |
| `frontend/scripts/validate-search-mobile-keyboard-ux-01.mjs` | **NEW** — automated checks |

---

## Deploy

```bash
pm2 restart otofine-frontend
```
