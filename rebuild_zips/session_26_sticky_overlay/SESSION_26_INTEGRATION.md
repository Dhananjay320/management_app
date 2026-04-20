# Session 26 — Draggable Sticky Notes Overlay (N1)

**Status: ✅ Build-verified.** Client: 303.55 kB main.js (+1.06 kB), 29.29 kB CSS (+410 B). Server routes load cleanly.

Third Phase F feature. Sticky notes can now be "pinned to screen" — they float as draggable/resizable cards that stay visible across every page of the app.

---

## What's in this zip

```
server/
├── models/StickyNote.js                    (patched — 5 new overlay fields)
└── routes/stickyNotes.js                   (patched — 3 new endpoints)

client/src/
├── components/
│   ├── DraggableStickyOverlay.js           (NEW — floating overlay layer)
│   ├── DraggableStickyOverlay.css          (NEW)
│   └── layout/AppLayout.js                 (patched — mounted overlay)
└── pages/StickyNotesPage.js                (patched — pin/unpin button)
```

**6 files: 4 patched + 2 new.** No new npm dependencies.

---

## What it does

**User flow:**
1. On the Sticky Notes page, hover over any note you own
2. Click 📌 → note becomes a floating card on top of every page
3. Drag it anywhere on screen by clicking the title bar or padding
4. Resize from the bottom-right corner
5. Edit content inline in the textarea (auto-saves after 800 ms idle)
6. Click the × (or press Esc while focused) to unpin

**Persistence:** position, size, and content changes all save to the server so your pinned layout comes back after a browser restart.

**Cross-page:** The overlay is mounted once at the root of AppLayout, so pinned notes stay visible while you navigate between Messages, Tasks, Meetings, etc.

---

## How it works

### Schema additions

Five new fields on `StickyNote`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `overlayPinned` | Boolean | `false` | Is this note pinned to the overlay? |
| `overlayX` | Number | `120` | Pixel offset from viewport left |
| `overlayY` | Number | `120` | Pixel offset from viewport top |
| `overlayWidth` | Number | `220` | Width in pixels (clamped 140–600) |
| `overlayHeight` | Number | `160` | Height in pixels (clamped 100–600) |

All owned by the note creator only. Shared viewers see the note in the main Sticky Notes page but can't pin it to their own overlay (that would require a per-user overlay-state join table — deferred pending need).

### Three new endpoints

- `PUT /api/v1/sticky-notes/:id/pin` — toggles `overlayPinned`. Body: `{ pinned: boolean }` (omit to toggle)
- `PUT /api/v1/sticky-notes/:id/overlay` — saves `{ x, y, width, height }`. Clamps values server-side
- `GET /api/v1/sticky-notes/pinned` — returns just my pinned notes

### Frontend architecture

**`DraggableStickyOverlay`** mounts in `AppLayout` just below `<NotificationToast />`, so it renders on every route. The overlay is a `position: fixed; inset: 0` container with `pointer-events: none` so clicks pass through to the app beneath — only the note cards themselves intercept pointer events.

**Each note is its own `<OverlayNote>` subcomponent** with:
- Local `{x, y}` + `{w, h}` state for smooth drag/resize (server syncs happen in the background)
- `onMouseDown` on the card → drag gesture (skips textarea / buttons / resize handle)
- `onMouseDown` on the bottom-right handle → resize gesture
- Keyboard handler: arrow keys nudge 10 px, Esc unpins
- Debounced API writes: ~250 ms during drag + immediate flush on drop; 800 ms after typing stops

**Viewport clamping:** drag math is clamped to `[0, window.innerWidth - 40]` × `[0, window.innerHeight - 40]` so notes can never get lost off-screen.

**Cross-component communication:** when you pin/unpin from the main Sticky Notes page, it dispatches a custom event `stickynote:pin-changed` on `window`. The overlay listens and refetches. No Redux/Context needed.

### Mobile behavior

Hidden below 640 px — drag UX is poor on touch and pinned notes would block limited screen real estate. Users on mobile still see and edit their notes normally on the Sticky Notes page; only the floating overlay is suppressed.

---

## Integration steps

**Prerequisite:** Sessions 1–25 integrated.

### 1. Copy files

```
server/models/StickyNote.js                       (replace)
server/routes/stickyNotes.js                      (replace)

client/src/components/DraggableStickyOverlay.js   (new)
client/src/components/DraggableStickyOverlay.css  (new)
client/src/components/layout/AppLayout.js         (replace — adds import + mount)
client/src/pages/StickyNotesPage.js               (replace — adds pin button + togglePin)
```

### 2. Restart

```bash
cd server && npm start
cd client && npm start
```

### 3. Verify

- Visit `/sticky-notes`, create a new note, type something
- Click the 📌 icon on the note → it flips to 📍 (pinned indicator)
- Navigate to `/tasks` or any other page → the note appears floating on top
- Drag it around — moves smoothly
- Resize from bottom-right corner
- Edit the text inline → changes save after 800 ms idle
- Refresh the browser → note is still floating at the same position
- Focus the note (tab to it), press arrow keys → 10 px nudges
- Press Esc → note unpins
- Resize browser < 640 px → overlay disappears (mobile fallback)

---

## Design rationale

### Why "poll once then event-based refresh"?

The overlay fetches `/sticky-notes/pinned` once on mount. After that, it only refreshes when the main Sticky Notes page dispatches `stickynote:pin-changed`. We don't socket-push pin changes because they're infrequent user actions and the overlay doesn't need real-time cross-device sync for pinned state. If that becomes important later, a `pin_changed` socket event is a 10-line add.

### Why not react-draggable / react-rnd?

Those libraries add ~30 KB combined. The drag + resize logic here is ~40 lines of vanilla mouse-event code. Keeping it hand-written avoids a dependency and matches the app's "no extra libs unless truly needed" ethos.

### Why is overlay state per-note-creator, not per-user?

Sticky notes can be shared. If I share my "Q4 Goals" note with 10 people, do they all pin it to the same position? Clearly no — each viewer would want their own layout. But allowing per-viewer overlay state requires a join table or a map indexed by userId, which is more schema complexity than the MVP warrants. For now: **only the creator can pin.** Shared viewers still see the note in the main page and can read/edit if granted — they just can't float it on their own screen.

If this becomes a common request, the upgrade is:
```js
// StickyNote.js
overlayState: [{
  user: ObjectId,
  pinned: Boolean,
  x, y, width, height
}]
```

---

## Known tradeoffs

- **Z-index collisions.** The overlay is z-index 9990. If a future modal ever uses z-index > 9990, pinned notes will appear on top of it. The command palette (z-index 10000) is already correctly above the overlay.
- **Position doesn't adapt to window resize.** If you pin a note near the right edge, then shrink the browser, the note stays at its pixel coordinate — could end up off-screen. Workaround: next drag will clamp it back. Could add a window-resize handler that rescales positions proportionally, but felt over-engineered for v1.
- **No z-order between pinned notes.** If two notes overlap, the DOM order determines which is on top. Drag-to-front isn't implemented. Good enough for a few pinned notes; would need focus-raises-z-index if people stack many.
- **Rubber-banding across many notes.** If you have 20 pinned notes and drag one rapidly, each mousemove triggers a debounced save. The 250 ms throttle + 250 ms drop flush means ~4 API calls/sec per active drag — fine for realistic use but could be tightened if someone pins way too many.

---

## What's next

Remaining Phase F features:

| # | Feature | Est. sessions | Why now? |
|---|---|---|---|
| N6 | Wellness (daily quote, meditation, mood) | 1 | Short, adds positive tone |
| N7 | Content hub (tutorials, feeds) | 1–2 | Extends Team Feed |
| N8 | Gamification (XP, badges, leaderboard) | 2 | Profile page has slots for badges already |
| N5 | Knowledge graph (backlinks in docs) | 2 | Workspace ready for it |
| N2 | Whiteboard | 2 | Largest effort — save for last |

Recommended next: **N6 Wellness module** — daily quote, meditation timer, mood check-in. Quick win, positive energy.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | 24, 25, **26**, 27 + N2/N5–N8 | 🟡 **3/11 done** |
| G — Electron | 28, 29 | Pending |

Say **"next"** when ready for Session 27 — N6 Wellness module.
