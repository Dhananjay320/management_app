# Session 14 — Error Boundaries + Retry UX (C11)

**Status: ✅ Build-verified.** Client: 290.47 kB main.js (+0.6 kB), 21.93 kB CSS (+0.5 kB).

This session closes audit gap **C11**. Unhandled errors used to do one of two bad things:

1. **White-screen the whole app** when a component threw during render
2. **Silently fail** when a fetch rejected — the page just stayed blank or showed stale data

Session 14 adds:
- Top-level React `ErrorBoundary` so render crashes show a friendly fallback
- Per-module boundaries so a crash in one page doesn't take down the whole shell
- `useRetry()` + `retryWithBackoff()` for flaky network calls (exponential backoff, transient-only retry)
- `useFetchSafe()` hook — the "load data with loading/error/retry" pattern wrapped up
- `ErrorState` component for inline error display with retry button

---

## What's in this zip

```
client/src/
├── App.js                              (patched — wraps Routes with <ErrorBoundary scope="root">)
├── components/
│   ├── ErrorBoundary.js                (NEW — top-level + module-level React error boundary)
│   ├── ErrorBoundary.css               (NEW)
│   ├── ErrorState.js                   (NEW — inline error UI for data-load failures)
│   ├── ErrorState.css                  (NEW)
│   └── layout/
│       └── AppLayout.js                (patched — wraps Outlet with compact boundary)
└── hooks/
    ├── useRetry.js                     (NEW — retry helper + hook with exponential backoff)
    └── useFetchSafe.js                 (NEW — load-with-retry + error state wrapper)
```

**8 files: 2 patched + 6 new.** Server unchanged.

---

## The two failure modes, fixed

### 1. Render crashes → ErrorBoundary

**Before:** a typo in any component (e.g. `const x = undefined; return x.y`) blanked the entire app. Reload required.

**After:**
- **Top-level boundary** wraps `<Routes>` — catches anything so severe the route itself fails to render. Shows "Something went wrong" with Try Again / Go Home buttons.
- **Per-module boundary** wraps `<Outlet />` inside `AppLayout` — if Tasks crashes, the rest of the shell (sidebar, topbar, notifications) keeps working. Shows a compact "This section ran into a problem" card instead of taking down the navigation.
- **Pathname-keyed reset** — when the user navigates to a different route, the per-module boundary resets automatically (via `key={location.pathname}`). No manual "reset" logic needed per page.

### 2. Data-fetch failures → useFetchSafe + ErrorState

**Before:** `api.get('/tasks').then(setTasks).catch(...)` patterns missed network drops and showed blank sections forever.

**After:**
```js
const { data: tasks, error, loading, refetch } = useFetchSafe(
  async () => (await api.get('/tasks')).data,
  [filterType],  // deps — refetches when filter changes
);

if (loading) return <Spinner />;
if (error)   return <ErrorState error={error} onRetry={refetch} />;
return <TaskList tasks={tasks} />;
```

Internal behavior:
- Retries up to 3 times with exponential backoff (500 ms → 5 s cap, ±30 % jitter)
- Retries only transient errors (5xx + network). 4xx errors don't retry — they're genuine "don't do that" signals
- Unmount during retry → cleanly aborts, no state-update warnings
- Dep change → cancels in-flight retry, starts fresh

---

## API reference

### `<ErrorBoundary>`

```jsx
<ErrorBoundary scope="tasks" compact onReset={() => refetch()}>
  <TasksPage />
</ErrorBoundary>
```

| Prop | Type | Notes |
|---|---|---|
| `scope` | string | Used in console log grouping + optional analytics hook |
| `compact` | boolean | Smaller inline mini-card (module) vs full-page (root) |
| `fallback` | ReactNode | Fully custom fallback, overrides default |
| `onReset` | function | Called when user clicks "Try again" |
| `onError` | function | `(error, errorInfo, scope)` — pluggable for Sentry etc. |

Dev-only shows a collapsible `<details>` block with stack trace.

### `useFetchSafe(fetcher, deps, opts)`

```js
const { data, error, loading, refetch } = useFetchSafe(
  async () => (await api.get('/meetings')).data,
  [userId]
);
```

`opts` pass through to `retryWithBackoff` (see below).

### `retryWithBackoff(fn, opts)` / `useRetry()`

```js
import { retryWithBackoff, useRetry } from '../hooks/useRetry';

// One-shot (e.g. in a submit handler):
await retryWithBackoff(
  () => api.post('/tasks', payload),
  { retries: 2, onRetry: (err, n) => console.log(`retry ${n}`) }
);

// Hook form (auto-cancels on unmount):
const retry = useRetry();
const data = await retry(() => api.get('/tasks'));
```

| Option | Default | Notes |
|---|---|---|
| `retries` | 3 | Max extra attempts after the first |
| `initialDelay` | 500 | ms for first backoff |
| `maxDelay` | 5000 | ms cap |
| `factor` | 2 | Exponential factor |
| `shouldRetry` | `isTransientError` | Custom predicate `(err, attempt) => bool` |
| `onRetry` | — | Callback `(err, attempt, delay)` |
| `signal` | — | AbortSignal |

**Transient errors** (auto-retried):
- Network failures (no response, fetch TypeError)
- HTTP 5xx responses

**Permanent errors** (never retried):
- HTTP 4xx (401, 403, 404, 422, etc.) — these aren't transient

### `<ErrorState>`

```jsx
if (error) return <ErrorState error={error} onRetry={refetch} />;
```

Renders a friendly message based on HTTP status (401 → session expired, 403 → no permission, 404 → not found, 5xx → server trouble, network → connection issue). Falls back to a generic "Couldn't load this" for unknowns. Passes through `error.response.data.error` as supplemental detail if available.

Use **ErrorState** for data-load errors. Use **ErrorBoundary** for render crashes.

---

## Integration steps

**Prerequisite:** Sessions 1–13 integrated.

### 1. Copy new files

```
client/src/components/ErrorBoundary.js
client/src/components/ErrorBoundary.css
client/src/components/ErrorState.js
client/src/components/ErrorState.css
client/src/hooks/useRetry.js
client/src/hooks/useFetchSafe.js
```

### 2. Replace patched files

```
client/src/App.js                                (replace)
client/src/components/layout/AppLayout.js        (replace)
```

### 3. Restart

```bash
cd client && npm start
```

### 4. Adopt gradually

The two error boundaries catch render crashes automatically — nothing to wire per-page.

For fetch errors, migrate pages to `useFetchSafe` at your own pace. Old `useEffect(()=>{api.get()...})` patterns still work. The new pattern just makes loading/error states uniform.

---

## Testing

### Render crash

1. Temporarily add `throw new Error('kaboom')` to the top of `CalendarHome.js`.
2. Reload. You should see the per-module compact boundary: "This section ran into a problem" with a "Try again" button.
3. **Sidebar, topbar, notifications still work.** That's the point of per-module boundaries.
4. Click "Try again" → error re-throws (since the bug is still there) → same state.
5. Navigate to another page (e.g. Tasks) → compact boundary resets automatically.
6. Remove the throw and reload — all normal.

### Retry behavior

1. Open DevTools → Network → set Offline.
2. Navigate to a page that uses `useFetchSafe`. (If you haven't migrated any yet, `useNotificationCounts` from Session 12 still uses a plain try/catch — safe.)
3. The page's error state should appear after ~3 seconds (retries took that long to give up).
4. Set back to Online, click "Try again" — data loads.

### Transient vs permanent

1. Force a 500 response from any endpoint → retries.
2. Force a 403 → does NOT retry, fails immediately with clear message.
3. Force a 401 → interceptor refresh runs once, then fails permanently.

---

## Why two hooks (useRetry + useFetchSafe)?

- **`useRetry()`** is the atomic building block — wraps any async function with retry + abort.
- **`useFetchSafe()`** is the declarative "load data for a component" pattern — calls `retryWithBackoff` internally and manages React state.

You want `useRetry` for save-button handlers, form submits, and one-off calls. You want `useFetchSafe` for initial data loads and anything that should refetch on dep changes.

---

## What this session doesn't do

- **No adoption across existing pages yet.** Migrating `TasksPage`, `MeetingsPage`, etc. to `useFetchSafe` is Session 18-23 work (module restyles).
- **No Sentry / error-tracking wiring.** The `onError` prop on `ErrorBoundary` is a hook for whatever service you eventually want; nothing is shipped by default.
- **No offline queue.** If a save fails while offline, the retry gives up after 3 attempts. A queue-and-retry-on-reconnect pattern is out of scope here.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| C — Broken repairs | 6, 7, 8, 9 | ✅ Complete |
| **D — Cross-cutting** | 10, 11, 12, 13, **14**, 15–17 | 🟡 5/8 done |
| E — Module restyles | 18–23 | Pending |
| F — New features | 24–27 | Pending |
| G — Electron | 28, 29 | Pending |

## Next — Session 15

**C10 — Global search UI (⌘K palette).** The existing SearchBar in the topbar currently navigates to `/search?q=...` but there's no global search palette. Session 15 builds one:
- ⌘K / Ctrl+K opens a modal overlay
- Search across tasks, meetings, messages, people, files (hitting the existing `/api/v1/search` endpoint)
- Arrow key navigation, Enter to select, Escape to close
- Recent searches + quick-jump suggestions

Say "**next**" when ready.
