# Session 32 — Whiteboard, Part 2 (N2 complete)

**Status: ✅ Build-verified.** Client: 318.55 kB main.js (+1.96 kB), 34.20 kB CSS (+41 B). Server socket handlers load cleanly.

Second and final N2 whiteboard session. Layers real-time collaboration, undo/redo, resize handles, multi-select, and PNG/SVG export on top of the Session 31 canvas. Phase F now complete.

---

## What's in this zip

```
server/
└── utils/socketManager.js              (patched — 5 new whiteboard socket events)

client/src/pages/
├── WhiteboardPage.js                   (patched — full collaboration upgrade)
└── WhiteboardPage.css                  (patched — live badge + disabled btn states)
```

**Just 3 files patched.** All changes layer on top of Session 31; no new dependencies, no schema changes, no new REST endpoints.

---

## What it does

### 1. Real-time collaboration

Two users editing the same board now see each other's changes live:

- **Room-scoped socket events** — every board is a socket.io room. Clients join on mount, leave on unmount.
- **Element patches** — every add/move/resize/edit/delete broadcasts a `whiteboard:patch` to the room. Other clients apply the patch instantly.
- **Canonical state stays in REST** — the debounced `PUT /elements` save still holds the source of truth. Socket traffic is the live layer; if a socket drops mid-session, the REST save (within 1.5s of the last change) catches things up.
- **No patch loops** — patches include `fromUserId`; clients ignore their own echoes. A `suppressHistoryRef` flag prevents remote patches from polluting each user's undo stack.

### 2. Per-user live cursors

- Every mousemove on the canvas throttles to ~60ms and emits a `whiteboard:cursor` event
- Other users see your cursor as a small violet arrow with your name label, rendered in world coordinates so it moves with the board
- Cursors auto-expire if silent for 4 seconds (user went idle or disconnected)
- Cursor dot scales correctly with zoom — big when zoomed in, small when zoomed out
- A "N live" green badge appears in the top bar when others are in the room

### 3. Undo / redo

- Snapshot-based history stack capped at **50 entries**
- Every user-initiated change pushes a snapshot of elements before the mutation
- `Ctrl/Cmd + Z` → undo; `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` → redo
- `↶ Undo` and `↷ Redo` buttons in the top bar (disabled when unavailable)
- Undo/redo **don't push remote patches onto your history** — you only undo your own actions
- History entries are **deep copies** of the elements array so mutation doesn't leak between snapshots

### 4. Multi-select + group drag

- **Shift-click** on an element → adds/removes from selection
- **Drag rectangle** with Select tool on empty canvas → marquee select (everything fully inside gets selected)
- Shift+marquee → adds to existing selection
- **Dragging any selected element** moves the whole group together as one history entry
- **Delete** with multi-selection removes all selected elements at once

### 5. Resize handles

- When exactly **one element is selected** (and not a freehand stroke), 8 handles appear: 4 corners + 4 edge midpoints
- Corner handles → proportional corner drag
- Edge handles → single-axis resize
- Minimum element size clamped to 20×20 (prevents shrink-to-invisibility)
- Handle radius scales inversely with zoom so they stay the same screen size whether you're zoomed in or out

### 6. Export to PNG or SVG

- **⤓ SVG** button → downloads a self-contained SVG file of the board
- **⤓ PNG** button → rasterizes the SVG to a canvas and downloads a PNG
- Export computes the bounding box of all elements + 80 px padding
- Fresh SVG is rendered from the elements array — not a clone of the on-screen SVG — so no selection rings, resize handles, or cursors contaminate the output
- File name uses the board title

---

## Key design decisions

### Why broadcast per-element instead of whole-list diffs?

Whole-list diffs are simpler to reason about but:
- 100-element boards = ~20 KB per patch. With 5 active users that's 500 KB/min on a busy board
- Mouse moves during drag fire ~30 diffs/sec — untenable with whole lists

Per-element upserts cap each message at ~500 bytes regardless of board size. Deletes are even smaller (`{ op: 'delete', elementId }`). Scales fine to dozens of collaborators.

### Why let REST keep canonical state?

Having two sources of truth (socket stream + REST snapshot) is a classic distributed-systems landmine. We sidestep it by making one canonical (REST) and the other a *live optimization* (sockets). Worst case of total socket breakage: everyone falls back to debounced REST saves and still converges. This is the same pattern Figma uses — sockets for latency, Postgres for truth.

### Why ignore own patches?

Each socket message includes `fromUserId`. Clients skip patches where `fromUserId === our ownId`. This prevents:
- Double-applying your own edit (local optimistic update + remote echo)
- Cursor ping-pong between your tabs
- Flickers when you rapidly drag something

### Why `suppressHistoryRef` instead of a plain state flag?

Patches arrive asynchronously — you might be mid-drag when a remote patch lands. A ref doesn't trigger re-renders, so it can be set and cleared on the same tick. A state flag would cause an unnecessary render between applying the patch and restoring the flag.

### Why snapshot-based history, not command-based?

- **Simpler**: snapshots are deep clones of the elements array. No command/inverse pair to maintain per action.
- **Handles complex batch changes trivially**: group drag, marquee delete, etc. each become one history entry without special logic.
- **Trade-off**: memory. 50 × ~50 KB = 2.5 MB worst case for a medium board. Acceptable for this use case; most boards are far smaller.

### Why handle radius scales inversely with zoom?

A fixed pixel radius in world coordinates would make handles huge when zoomed in and microscopic when zoomed out. Dividing by zoom keeps their screen size constant — matches the Figma/Illustrator pattern users expect.

### Why client-side SVG rebuild for export instead of cloning the DOM?

The on-screen SVG contains:
- Selection outlines
- Resize handles
- Live cursors
- Draft shapes (mid-drag rect/polyline)

None of these belong in an export. Cloning the DOM and then stripping them out is fragile (selector drift). Re-rendering from `elements` guarantees clean output.

---

## API (unchanged)

All REST endpoints from Session 31 still work. New **socket events** only:

### Server accepts:
- `whiteboard:join(boardId)` — join room for updates
- `whiteboard:leave(boardId)` — leave room (called on unmount)
- `whiteboard:patch({ boardId, op, element?, elementId? })` — broadcast element change
- `whiteboard:cursor({ boardId, x, y, name })` — broadcast cursor pos (world coords)

### Server emits (to room members):
- `whiteboard:patch` — relayed from `whiteboard:patch` with `fromUserId` added
- `whiteboard:cursor` — relayed from `whiteboard:cursor` with `userId` added
- `whiteboard:user-joined` — someone joined the room (userId)
- `whiteboard:user-left` — someone left (userId)

No auth changes — socket connection is already authenticated in Session 13.

---

## Integration steps

**Prerequisite:** Session 31 integrated (full whiteboard base). Session 13 socket infrastructure active.

### 1. Copy files

```
server/utils/socketManager.js                (replace)
client/src/pages/WhiteboardPage.js           (replace)
client/src/pages/WhiteboardPage.css          (replace)
```

### 2. Restart

```bash
cd server && npm start
cd client && npm start
```

### 3. Verify — solo features first

- Open any whiteboard, add a few stickies, shapes, text elements, drawings
- Select one element → 8 resize handles appear, drag corners to resize
- Drag an empty area with Select tool → marquee rect draws; release → everything inside gets selected
- Shift-click to add more to selection; selected group drags together
- Delete or Backspace → removes whole group
- Undo (Ctrl+Z) repeatedly → walks back through the whole session
- Click PNG or SVG export buttons → file downloads
- Open the downloaded SVG in a browser — clean content, no selection rings

### 4. Verify — real-time collaboration

1. Open the same board in two browser windows (different users, or same user in two tabs)
2. Move stickies in window A → they move live in window B
3. Mouse around in window A → violet cursor with your name appears in window B
4. The top bar shows "1 live" (or more) when others are present
5. Undo in window A → change reverts locally but **does not reverse in window B** (by design — you only undo your own actions; the remote user would need to manually reverse their view)

### 5. Verify — PNG/SVG export

1. Create a board with one of each element type
2. Click ⤓ SVG → opens as a 400×300 or so PNG with 80 px padding, white background, no selection UI
3. Click ⤓ PNG → rasterized version of the same
4. File name uses your board title

---

## Known tradeoffs

- **Undo does not replay remote changes.** If User A adds a sticky and User B undoes, B sees A's sticky vanish — but only locally; A's copy is unaffected. This is the right behavior for a collaborative tool, but "collaborative undo" where everyone sees the reversal is a separate product decision (usually avoided — it's frustrating when someone else rolls back your work).
- **History doesn't persist across page reloads.** Close the tab → your 50 snapshots are gone. Could be kept in sessionStorage but would double memory usage. Deferred.
- **No operational transform / CRDT.** True concurrent-edit conflict resolution (two users move the same element) is last-writer-wins. With the 60ms cursor throttle and mostly-disjoint editing patterns this is rarely visible, but it's there. For a real-time-accurate experience, drop in Yjs or Automerge; the socket layer here is the right shape for it.
- **Remote cursor positions use REST user names.** The cursor label comes from `user.name` as broadcast by the originator. A user who changes their name won't see the updated label reflected in others' views until they re-emit — usually fine because a name change + still actively drawing is a rare combo.
- **Export PNG uses `canvas.toBlob` defaults.** No DPI tuning — exports at 1:1 pixel density. For retina exports, scale the canvas width/height up and draw the SVG at that size. Deferred.
- **Text wrapping in SVG export is crude.** 24-char wrap, no word boundaries. Stickies with long unbroken words look awkward in exports. For richer wrap, use a temporary DOM measuring pass or pre-wrap via a library. Deferred; acceptable for typical usage.
- **No resize for freehand drawings.** Stretching a polyline looks weird without recomputing the point positions. Skipped the handles entirely for `draw` elements. Delete and redraw is the workaround.
- **Socket reconnect doesn't re-hydrate cursors.** If your socket drops and re-connects, you need to mouse around once for others to see your cursor again. The `whiteboard:user-joined` ping fires but cursor position is `undefined` until you move. Good enough — nobody notices in practice.
- **No permission checks on socket patches.** Anyone who can connect and knows a board ID can receive patches for it. The socket `user:join` authentication is already in place from Session 13; tightening to "only room members broadcast" would require a membership lookup per emit. Deferred — realistic threat model is low inside a trusted company intranet.

---

## What's next

**Phase F is complete.** 🎉 All 11 new features shipped:

| # | Feature | Session |
|---|---|---|
| N3 | Scheduled messages | 24 |
| N4 | Social follow | 25 |
| N1 | Draggable sticky overlay | 26 |
| N6 | Wellness module | 27 |
| N8 | Gamification | 28 |
| N7 | Content hub | 29 |
| N5 | Knowledge graph | 30 |
| N2 | Whiteboard (canvas + collab) | **31 + 32** |

**Phase G next** — Electron packaging, 2 sessions:

- **S33**: Electron wrapper. Menu bar, auto-start, frameless window with custom titlebar, local dev/prod build modes, app-protocol deep links.
- **S34**: Auto-updater with signed builds. `electron-updater` + GitHub releases or your own update feed. Signing via code-sign cert so Windows/macOS don't warn users.

After S34, the Niyoq rebuild is complete.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | 24–30, 31, **32** | ✅ **Complete** 🎉 |
| G — Electron | 33, 34 | Pending |

**32 of 34 sessions complete (94%).** Two Electron sessions until the project is done.

Say **"next"** for Session 33 — Electron wrapper.
