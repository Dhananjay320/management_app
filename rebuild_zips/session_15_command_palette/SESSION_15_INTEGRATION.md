# Session 15 — Global Search Palette (C10)

**Status: ✅ Build-verified.** Client: 292.77 kB main.js (+2.3 kB), 22.69 kB CSS (+0.8 kB). Server route loads cleanly.

Closes audit gap **C10**. The topbar search input had been cosmetic — no way to actually search across the app. Session 15 adds a proper ⌘K / Ctrl+K command palette that searches tasks, meetings, messages, workspace docs, email, sticky notes, and people in one place.

---

## What's in this zip

```
server/
└── routes/search.js                                (patched — new /search/global endpoint)

client/src/
├── App.js                                          (patched — mounts CommandPalette globally)
├── components/
│   ├── CommandPalette.js                           (NEW — ⌘K modal overlay)
│   ├── CommandPalette.css                          (NEW)
│   └── layout/AppLayout.js                         (patched — SearchBar opens palette on click)
└── design-system/
    ├── icons.js                                    (patched — added Search icon)
    └── components/
        ├── SearchBar.js                            (patched — new onClick/readOnly trigger mode)
        └── SearchBar.css                           (patched — trigger-mode hover state)
```

**9 files: 6 patched + 3 new.**

---

## Platform handling — important

**Both Mac and Windows/Linux work out of the box.** The palette opens on:

- **Mac:** `⌘K` (Cmd+K)
- **Windows/Linux:** `Ctrl+K`

This is automatic — the keyboard listener checks `e.metaKey || e.ctrlKey`, so either modifier triggers it.

**Visible hints also adapt to the OS:**

- Mac users see `⌘K`, `↵`, `Esc` in the palette footer and search row
- Windows/Linux users see `Ctrl`, `Enter`, `Esc`

Detection uses `navigator.platform` + `navigator.userAgent`. For the rare case where someone is on Linux with a Mac keyboard (or vice versa), the functional shortcut still works either way — only the hint label differs.

---

## What it does

### 1. Opens three ways

- **Keyboard:** `⌘K` / `Ctrl+K` from anywhere in the app
- **Click:** on the topbar search bar (now acts as a trigger button, no longer a dead input)
- **Programmatically:** `window.dispatchEvent(new CustomEvent('cmdk:open'))` — any other component can trigger it without knowing the shortcut

### 2. Searches seven scopes in parallel

Server endpoint `GET /api/v1/search/global?q=TERM&limit=5` runs all of these concurrently:

| Scope | Fields searched | Access-scoping |
|---|---|---|
| Tasks | title | Your tasks + public team tasks; main_admin sees all |
| Meetings | title, agenda | Where you're creator or attendee |
| Messages | content | Only channels you're a member of |
| Workspace | title, tags | Only workspaces you're in |
| Email | subject, fromName, from | Your inbox only |
| Sticky Notes | title | Yours + shared with you |
| People | name, email, jobTitle | All active users |

Same access rules as `/search/normal`. Results don't leak across membership.

### 3. Keyboard navigation

- **↑ ↓** to move the cursor
- **Enter** to open the selected result
- **Escape** to close

Mouse also works — hover selects, click opens.

### 4. Empty state = Recents + Quick jumps

When the query is empty, the palette shows:

- **Recent** — your last 8 selections (saved in localStorage, with a Clear button)
- **Jump to** — quick links to Home, Tasks, Messages, Meetings, Email, Workspace, Sticky Notes, Notifications, Settings

### 5. Results grouped by scope

When you type, results appear in labeled groups (Tasks, Meetings, People, etc.) with type icons. People results show avatars.

### 6. Debounced

180ms debounce on the search input. Previous in-flight request is canceled when you type more. Won't flood the backend.

### 7. Deep-link navigation

Clicking a result goes to the module with a `?highlight=<id>` param (same pattern as Session 12 notifications). Actual scroll-to + highlight is each module's own job in the restyle phase (Sessions 18-23).

---

## SearchBar's new trigger mode

Before Session 15, the topbar `<SearchBar>` was a regular input that nobody had wired up. Now it has two modes:

**Normal mode** (unchanged):
```jsx
<SearchBar value={q} onChange={setQ} onEnter={runSearch} />
```

**Trigger mode** (Session 15):
```jsx
<SearchBar onClick={() => window.dispatchEvent(new CustomEvent('cmdk:open'))} />
```

In trigger mode:
- The input is `readOnly` — you can't type in it
- The whole wrapper is clickable with `role="button"`
- Enter / Space on the wrapper opens the palette
- The wrapper's own ⌘K handler is disabled (the CommandPalette owns the shortcut)
- Hover state is on the wrapper, not `focus-within`

Existing callers of `<SearchBar>` elsewhere in the app (e.g. page-level filters) don't need changes — they just don't pass `onClick`.

---

## Integration steps

**Prerequisite:** Sessions 1–14 integrated.

### 1. Copy new files

```
client/src/components/CommandPalette.js
client/src/components/CommandPalette.css
```

### 2. Replace patched files

```
server/routes/search.js                            (replace)

client/src/App.js                                  (replace)
client/src/components/layout/AppLayout.js          (replace)
client/src/design-system/icons.js                  (replace — adds Search icon)
client/src/design-system/components/SearchBar.js   (replace — adds onClick/readOnly)
client/src/design-system/components/SearchBar.css  (replace — adds trigger styles)
```

### 3. Restart

```bash
cd server && npm start
cd client && npm start
```

### 4. Verify

- Press `⌘K` (Mac) or `Ctrl+K` (Windows/Linux) → palette opens
- Click the topbar search bar → palette opens
- Type a few letters → results appear after ~180ms
- Arrow keys navigate, Enter opens, Escape closes
- Pick a result → you land on that page with `?highlight=<id>` in the URL, and it's saved to Recent

---

## Testing

### On Mac
1. Press `⌘K` → palette opens with "⌘K" hint in footer
2. Type `meeting` — results from multiple scopes appear
3. Arrow down to a meeting, press Enter → navigates

### On Windows / Linux
1. Press `Ctrl+K` → palette opens with "Ctrl" hints
2. Same flow as above

### Access scoping
1. Have user A create a private task. User B shouldn't see it in their palette results.
2. Have user A write a message in a channel user B isn't in. User B shouldn't see that message.
3. Public tasks, meetings where you're an attendee, and everyone (for people search) are visible to anyone.

### Empty query
1. Open palette without typing → see Recent (if any) and Jump to sections
2. Click a quick jump → navigates, palette closes
3. Click "Clear" next to Recent → recents are wiped (confirms localStorage write)

### Debounce + cancel
1. Type fast (e.g. "meetingreport"). Watch network tab — only one request fires after you stop, not one per character.

---

## What this session doesn't do

- **No server-side indexing.** Search uses `$regex` on mongoose fields. Fine for ~10k records per scope; won't scale to millions. Session 16 (C6 — deep-search real indexing) replaces the stub worker with a real full-text index.
- **No filters inside the palette.** Can't say "only show tasks." You can filter by typing more specific words. Advanced filtering UI is a later addition if needed.
- **No scheduled/saved searches.** LocalStorage recents only.

---

## About the scheduled messages question

Noted — I'll add it to **Phase F** as **N3 — Scheduled messages** (the two existing new features are N1 draggable notes and N2 whiteboard). Scheduled messages will need:

- `ScheduledMessage` model with `sendAt`, `channel`, `content`, `sender`, `status`
- A node-cron job (or tick in `startSchedulers`) that sweeps every 30s for due messages
- "Schedule for later" button in the message composer with datetime picker
- "Scheduled" tab in Messages showing pending sends with edit/cancel

Doing it after Phase D finishes means the scheduled-message feature automatically inherits: error boundaries around the composer, deep-linking from the "your message was sent" notification, mobile-responsive layout, team membership enforcement, and the Session 18 Messages restyle.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| C — Broken repairs | 6, 7, 8, 9 | ✅ Complete |
| **D — Cross-cutting** | 10, 11, 12, 13, 14, **15**, 16, 17 | 🟡 6/8 done |
| E — Module restyles | 18–23 | Pending |
| F — New features | 24–27 + N3 scheduled messages | Pending |
| G — Electron | 28, 29 | Pending |

## Next — Session 16

**C6 — Deep-search real indexing.** The current `/search/normal` uses mongoose `$regex`, which is slow at scale and can't do phrase matching, typo tolerance, or rank by relevance. Session 16 replaces it with proper MongoDB text indexes + a background re-index job.

Say "**next**" when ready.
