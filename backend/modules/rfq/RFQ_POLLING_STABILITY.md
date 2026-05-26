# RFQ conversation polling stability

## Symptom

Buyer (and shop) chat visibly blinks/refreshes every ~5s on mobile during silent poll.

## Root cause (exact)

Silent poll **did call merge**, but `mergeSortedMessages` **always**:

1. Overwrote every message with a **new API object reference** (`map.set(key, incoming)`)
2. Returned a **new sorted array** even when content was identical

Downstream effects each poll tick:

| Layer | What happened |
|-------|----------------|
| `setItems` | New array reference → hook re-render |
| `enrichMessagesForDisplay` | New wrapper object per row |
| `RfqConversationTimeline` | All `<li>` + bubbles re-render |
| `RfqConversationImageGallery` | Re-sorted attachments, `<img>` repaint on mobile |
| `useLayoutEffect` | Re-ran on `displayItems` identity change |
| Unread counters | `setState` even when value unchanged |

Keys were stable (`dispatchId-id`); **object identity was not**.

## Before → after flow

```
BEFORE (every 5s silent poll)
  fetch → map incoming with new objects
       → mergeSortedMessages → NEW array, ALL new message refs
       → setItems → React re-render timeline
       → enrichMessagesForDisplay → NEW display wrappers
       → all bubbles + images repaint → visible blink

AFTER
  fetch → mergeSortedMessages
       → per message: if content equal → KEEP prev ref
       → if nothing changed → return prev array (no setState)
       → enrichMessagesForDisplay → cache / reuse wrappers
       → React.memo bubbles skip render
       → memo gallery skips render
       → layout effect keyed by tail signature only
```

## Render-count analysis (expected)

| Event | Before | After |
|-------|--------|-------|
| Noop poll (no new messages) | Timeline + N bubbles + images | **0** (bail out at `setItems`) |
| New message at tail | Full list + 1 new bubble | Full list reconcile, **N-1 memo skips** |
| Unread-only poll change | Timeline + unread badge | **Unread badge only** |

## Fixes (minimal-risk)

1. **`conversationMessageEqual` + stable merge** — preserve refs on noop poll; return `prev` when unchanged
2. **`enrichMessagesForDisplay` cache** — reuse enriched rows when source messages unchanged
3. **Guarded unread `setState`** — skip when counts equal
4. **`React.memo`** on timeline bubble components (compare `msg` ref)
5. **`memo` + `attachmentsStable`** on image gallery
6. **Scroll effect** — depend on `tailSignature`, not full `displayItems` array
7. **Mark-read hooks** — depend on tail signature + `itemsRef`, not `items` identity

## Regression risks

| Risk | Notes |
|------|-------|
| Stale message after server edit | Merge updates when `conversationMessageEqual` is false |
| Missed attachment update | Compared by id/url/sort_order signature |
| enrich cache module state | Cleared on content change; safe for single timeline instance |
| New message not scrolling | Tail signature still changes → scroll logic unchanged |

## QA scenarios

1. **Idle thread (mobile Safari)** — open buyer chat, wait 30s → no visible blink
2. **Reading mid-thread** — scroll up, poll 20s → position preserved, no flash
3. **At bottom** — receive new message via other device → single new bubble, auto-scroll once
4. **Image messages** — thread with photos, noop poll → thumbnails do not reload/spinner
5. **Shop + buyer** — both roles, same checks
6. **Tab hidden** — no poll; visible again → one fetch, no double blink
7. **Send message** — optimistic append still works; tail updates

## Debug

In devtools React profiler: during noop poll, `RfqConversationTimeline` should **not** commit.

Optional: log when merge bails out (temporary):

```js
if (!changed) return prev; // silent poll noop
```

## Second-level fix: buyer page parent rerenders (2026-05)

### Additional root causes

| Issue | Effect every ~5s |
|-------|------------------|
| `timelineRefreshKey = sortedQuotes.length + lastSyncedAt` | **Full conversation reload** with `loading=true` → skeleton flash |
| `setData(res.data)` on RFQ poll | Entire page rerender; new quotes/options arrays |
| `sortedQuotes` spread+sort | New array ref even when quotes unchanged |
| Inline `buyerConversationHeaders()` / `onSend` | Composer rerender |
| RFQ + chat both polling at 5s | Double network + render pressure |

### Fixes

1. **Removed `timelineRefreshKey`** — conversation hook no longer hard-reloads on RFQ poll
2. **`stabilizeRfqByTokenData`** — noop RFQ poll returns previous `data` ref
3. **Stable derived state** — `mergeStableSortedQuotes`, `mergeDispatchOptions`, `mergeQuotesByDispatch`
4. **Split poll intervals** — chat 5s, RFQ detail **15s**
5. **`RfqBuyerChatPanel`** — memo shell; stable callbacks/headers
6. **Memo** — `RfqBuyerChatHeader`, `RfqBuyerShopTabs`
7. **Render debug** — `sessionStorage.rfq_debug_render=1` → `[rfq-render]` logs

### Debug

```js
sessionStorage.rfq_debug_render = '1'
// Reload buyer page — idle 30s
// Expect: NO RfqBuyerChatPanel / RfqTokenPage logs during chat noop polls
// RFQ detail poll at 15s should also skip logs when data unchanged
```

### Files added

- `frontend/lib/rfq/rfqBuyerDataStable.js`
- `frontend/lib/rfq/rfqRenderDebug.js`
- `frontend/components/rfq/RfqBuyerChatPanel.jsx`

- `frontend/hooks/useRfqConversationMessages.js`
- `frontend/hooks/useRfqConversationMarkRead.js`
- `frontend/components/rfq/RfqConversationTimeline.jsx`
- `frontend/components/rfq/RfqConversationImageGallery.jsx`
- `frontend/lib/rfq/rfqConversationMessages.test.js`
