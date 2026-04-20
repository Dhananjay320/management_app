# Session 18 — Tasks Restyle + Deep-link Support

**Status: ✅ Build-verified.** Client: 297.87 kB main.js (+166 B), 24.81 kB CSS (+398 B).

Phase E begins. Session 18 restyles the Tasks page with the approved design system, wires up the `?highlight=<id>` deep-link that Session 12 (notifications) and Session 15 (command palette) both set up, and adopts Session 14's `useFetchSafe` + `ErrorState` for consistent loading/error handling.

---

## What's in this zip

```
client/src/pages/
├── Tasks.js                 (patched — restyled shell + deep-link + useFetchSafe)
└── Tasks.restyle.css        (NEW — shell + flash animation)
```

**2 files: 1 patched + 1 new.** Server unchanged.

---

## Approach — "surgical restyle," not rewrite

Tasks.js is 773 lines. Rewriting all of it in one session would be overreach and risk regressions. This session restyles the **shell** (the outer container, header, filters, list wrapper) while keeping `TaskCard`, `TaskDetail`, `CreateTask`, and `TodoList` as-is. Those sub-components work fine; polishing each one is a tiny follow-up.

The rationale: **the shell is what the user sees first**, and it was the most inconsistent piece. Priority-grouped list cards already looked OK.

---

## What changed

### Hero header with gradient title

Before:

```
Tasks                    [Tasks] [To-Do] [+ New Task]
12 tasks
```

Flat typography, no depth.

After:

```
Your TASKS                       [Tasks | To-Do] [+ New task]
12 tasks · 3 done
```

- Large `32px` heading with gradient accent on "tasks" via `<GradientText>`
- Subtitle shows "N tasks · M done" instead of just count
- `SegmentedControl` (design system) for the tab switcher
- `PrimaryButton` (design system) for "New task" — gradient styling with Plus icon

### View filter uses SegmentedControl

Before: `<div className="task-filter-chip active">My Tasks</div>` — bespoke pill buttons.

After: shared `<SegmentedControl>` — same visual language as Meetings, Announcements, etc.

### useFetchSafe + ErrorState

Replaces the raw `useState + useEffect + try/catch` load pattern with Session 14's `useFetchSafe`. Gains:

- Loading / error / success states handled uniformly
- Automatic retry on 5xx/network errors (3 attempts with exponential backoff)
- In-flight request canceled when the filter changes (no stale data race)
- `<ErrorState error={error} onRetry={refetch} />` on failure — friendly message, retry button

### Deep-link support (the big one)

When the user clicks a notification like "Ravi assigned you: Ship Q4 plan", Session 12's notification system navigates to `/tasks?highlight=<taskId>`. Before Session 18, that `?highlight` param was silently ignored.

Now:

1. Tasks page reads `searchParams.get('highlight')` on mount
2. Once tasks are loaded, finds the matching row
3. Automatically opens the detail view for that task
4. Scrolls the source row into view and applies a `flash` animation (purple glow pulse) on the row
5. Strips the `?highlight=` param so back/forward doesn't re-trigger

Same pattern will be used for Meetings (S20), Messages (S19), Email (S21). The flash animation respects `prefers-reduced-motion`.

### Empty state polished

Plain text "No tasks yet" → glass panel with circle-check icon, title + subtitle. Consistent with other modules.

### Mobile responsive

- Hero title shrinks from 32 → 24 px below 760 px
- Head stacks vertically on mobile with action row justified
- Tab + New-task button stretch to fill width

---

## What didn't change

Intentionally kept as-is for now:

- **TaskCard** — the individual task row component (priority badge, due date, assignees, tags). Works and looks fine.
- **TaskDetail** — the expanded view with comments, subtasks, attachments. Large component, needs its own dedicated polish session eventually.
- **CreateTask** — the form for creating a new task. Fine.
- **TodoList** — the quick-capture view. Fine.
- **styles/tasks.css** — the existing CSS for cards, badges, detail view. Still loaded.

---

## How deep-linking works end-to-end

Starting from Session 12:

1. User B assigns user A a task. Server creates a Notification with `entityType: 'task'`, `entityId: <taskId>`.
2. A receives socket event `notification:new`. Toast appears.
3. A clicks the toast → `useNotificationDeepLink` computes path: `/tasks?highlight=<taskId>`.
4. React Router navigates. Tasks page mounts.
5. **Session 18 (this session):** Tasks reads `?highlight=<taskId>`, opens detail view, scrolls + flashes the source row.

Also works from Session 15's command palette — search for a task, hit Enter, same deep-link URL is used.

---

## Integration steps

**Prerequisite:** Sessions 1–17 integrated. Session 14's `useFetchSafe` + `ErrorState` and the Session 12 hooks must exist.

### 1. Copy files

```
client/src/pages/Tasks.js            (replace)
client/src/pages/Tasks.restyle.css   (new)
```

### 2. Restart

```bash
cd client && npm start
```

### 3. Verify

- Go to `/tasks` — new hero header with gradient accent
- Go to `/tasks?highlight=<an-actual-task-id>` — detail view opens, row flashes
- Stop the server → navigate to Tasks → see the `ErrorState` retry card instead of a blank page
- Network tab: rapid-click between "My Tasks" and "All Tasks" — only the final request completes (race protection)

---

## Testing

1. **Visual** — hero header looks right, SegmentedControl style consistent with Announcements / Meetings
2. **Deep-link** — paste `/tasks?highlight=<realTaskId>` → detail opens, row flashes, URL becomes `/tasks` after flash
3. **Error state** — stop backend, click Tasks tab, get the red ErrorState card with "Try again"; click Try again → refetches
4. **Loading** — slow network throttling → see "Loading…" in glass panel briefly
5. **Mobile** — resize < 760 px → header stacks, action row stretches
6. **Notification deep-link** — have someone assign you a task, click the toast → lands on the right task with flash

---

## What's next

Remaining Phase E sessions:

- **S19** Messages restyle + mobile stack + typing indicator polish
- **S20** Meetings restyle + `?highlight=` support + MoM editor polish
- **S21** Email restyle + real HTML rendering + `?highlight=` support
- **S22** Workspace restyle + breadcrumb navigation
- **S23** Salary + Analysis restyle + person calendar view

Each session follows the same pattern: restyle the shell, add deep-link support, adopt `useFetchSafe`, mobile-polish, keep sub-components stable unless they're broken.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| C — Broken repairs | 6, 7, 8, 9 | ✅ Complete |
| D — Cross-cutting | 10–17 | ✅ Complete |
| **E — Module restyles** | **18**, 19, 20, 21, 22, 23 | 🟡 1/6 done |
| F — New features | 24–27 + N3–N8 | Pending |
| G — Electron | 28, 29 | Pending |

Say **"next"** when ready for Session 19 (Messages).
