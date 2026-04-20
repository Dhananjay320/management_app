# Session 31 — Whiteboard, Part 1 (N2)

**Status: ✅ Build-verified.** Client: 315.50 kB main.js (+3.65 kB), 34.15 kB CSS (+710 B). Server routes + model load cleanly.

Eighth Phase F feature, first of two whiteboard sessions. Adds an infinite-canvas whiteboard with sticky notes, rectangles, text, and freehand drawing. Pan, zoom, drag, inline edit — everything a solo or small-team whiteboard needs. Real-time multi-user collaboration ships in Session 32.

---

## What's in this zip

```
server/
├── index.js                         (patched — wired route)
├── models/Whiteboard.js             (NEW — whiteboard + element subdoc)
└── routes/whiteboards.js            (NEW — 8 endpoints)

client/src/
├── App.js                           (patched — 2 routes)
├── components/layout/AppLayout.js   (patched — Whiteboards sidebar link)
└── pages/
    ├── WhiteboardListPage.js        (NEW — grid of boards)
    ├── WhiteboardListPage.css       (NEW)
    ├── WhiteboardPage.js            (NEW — infinite canvas with 5 tools)
    └── WhiteboardPage.css           (NEW)
```

**9 files: 3 patched + 6 new.** No new npm dependencies.

---

## What it does

### The infinite canvas

Full-screen SVG with pan and zoom. Elements live in world coordinates; the transform maps world→screen at render time. Zoom is clamped 10%–500%, pan is unrestricted. A subtle dotted grid drifts with pan/zoom for spatial orientation.

### Five tools in a floating toolbar

| Tool | Icon | Behavior |
|---|---|---|
| Select | ↖ | Click to select, drag to move, hover for lift shadow |
| Sticky | 📝 | Click to drop a 180×120 sticky note (color from swatch row) |
| Rectangle | ▭ | Click-and-drag to draw a filled rectangle |
| Text | T | Click to add an inline-editable text element |
| Draw | ✏️ | Click-and-drag to sketch a freehand polyline |

Select is the default after each placement — mimics Figma/Miro flow so you don't accidentally place two stickies in a row.

### Sticky notes

- Six pre-set colors in a swatch picker (amber, coral, sky blue, lime, lilac, peach)
- Double-click to edit text inline (textarea in SVG `foreignObject`)
- Auto-save 1.5s after typing stops
- Drag anywhere with select tool

### Rectangles

- Drag from corner to corner
- Filled with soft lilac (`#EDE9FE`), indigo stroke
- Min size 6×6 px — smaller drafts are discarded as accidental clicks
- Drag to move, delete to remove. Resize handles are scoped for Session 32.

### Text

- Click to place, auto-opens single-line input
- Enter or blur to commit
- Double-click later to re-edit

### Freehand drawing

- Points collected as the mouse moves (throttled at natural rAF rate)
- Bounding box computed at stroke end, points stored relative to box origin
- Saved as SVG `polyline` with rounded caps and joins

### Pan and zoom

- **Pan**: hold Space + drag, OR middle-mouse drag
- **Zoom**: mouse wheel (zoom-to-cursor math — the point under your cursor stays fixed)
- **Reset view**: top bar button → back to `{x: 0, y: 0, zoom: 1}`
- Current zoom % shown in the top bar
- Viewport position auto-saves every 5s — reopening the board resumes where you left off

### Keyboard shortcuts

- `Space` (hold) → temporary pan mode, cursor becomes grab
- `Delete` / `Backspace` → remove selected element
- `Escape` → deselect + cancel any in-progress draft

### Persistence

- **Elements**: debounced save 1.5s after any change (move, edit, create, delete)
- **Viewport**: debounced save 5s after pan/zoom stops — longer interval because scrolling shouldn't spam writes
- **Title**: saved on blur when edited in the top bar
- **Cleanup**: both timers cleared on unmount so navigating away doesn't leave stale writes pending

---

## Data model

### Whiteboard

```js
{
  title: String,          // required, max 200
  owner: ObjectId,        // required, the creator
  workspace: ObjectId,    // optional — not tied to a workspace in this session but can be
  members: [ObjectId],    // users granted access
  elements: [Element],    // the content — see below
  viewport: { x, y, zoom }, // last-saved camera
  isActive: Boolean,      // soft delete
}
```

### Element (subdoc, no separate collection)

```js
{
  id: String,             // client-generated uuid, stable across edits
  type: 'sticky' | 'shape' | 'text' | 'draw',
  x, y, w, h: Number,     // world coords
  z: Number,              // stacking order
  rot: Number,            // degrees, default 0 (unused in part 1)
  data: Object,           // type-specific payload
  createdBy: ObjectId,    // attribution
}
```

**Type-specific `data` shapes:**

- **sticky**: `{ text, color }` — color is a hex string like `#FEF3C7`
- **shape**: `{ variant: 'rect' | 'ellipse' | 'triangle', fill, stroke }` — only `rect` wired in part 1
- **text**: `{ text, fontSize, color }`
- **draw**: `{ points: [[x, y], ...], stroke, strokeWidth }` — points stored relative to element origin so moving the shape translates the whole stroke together

We store elements as subdocs (not a separate collection) because the write pattern is "update this one whiteboard": one save can persist many element changes atomically. If boards grow into thousands of elements this can be revisited — for the expected use case (<200 elements per board) it's simpler and faster.

---

## API

### `GET /api/v1/whiteboards`
List my boards (owner or member). Excludes deleted. Sorted by `updatedAt desc`.

### `POST /api/v1/whiteboards`
Create a new board. Body: `{ title, workspace?, members? }`. Returns the full board.

### `GET /api/v1/whiteboards/:id`
Fetch one. Includes all elements. Requires owner or member.

### `PUT /api/v1/whiteboards/:id`
Update metadata. Body: `{ title?, viewport? }`. Viewport clamps zoom to 0.1–5.

### `DELETE /api/v1/whiteboards/:id`
Soft delete. Owner only.

### `PUT /api/v1/whiteboards/:id/elements`
**The main save endpoint.** Body: `{ elements: [...] }`. Replaces the full element list. Server sanitizes:
- Strips anything missing `id` or with an unknown `type`
- Caps total elements at 2000
- Clamps `w`/`h` to 1–5000
- Ensures numeric coords parse

Returns `{ count, updatedAt }`.

### `POST /api/v1/whiteboards/:id/members`
Add a member. Body: `{ userId }`. Owner only.

### `DELETE /api/v1/whiteboards/:id/members/:userId`
Remove a member. Owner only.

---

## Integration steps

**Prerequisite:** Sessions 1–30 integrated.

### 1. Copy files

```
server/models/Whiteboard.js              (new)
server/routes/whiteboards.js             (new)
server/index.js                          (replace)

client/src/App.js                                 (replace)
client/src/components/layout/AppLayout.js         (replace)
client/src/pages/WhiteboardListPage.js            (new)
client/src/pages/WhiteboardListPage.css           (new)
client/src/pages/WhiteboardPage.js                (new)
client/src/pages/WhiteboardPage.css               (new)
```

### 2. Restart

```bash
cd server && npm start
cd client && npm start
```

### 3. Try it

1. Click "Whiteboards" in the sidebar (folder icon)
2. Click "+ New whiteboard" — lands you on an empty canvas
3. Pick the Sticky tool → click anywhere → sticky drops at your cursor
4. Double-click it → type something → click outside to commit
5. Switch to Rectangle → drag from corner to corner to draw
6. Switch to Draw → sketch a curve
7. Back to Select → drag any element around
8. Hold Space + drag canvas → pans the view
9. Scroll wheel → zooms in/out on your cursor
10. Reload the page → everything is exactly where you left it, at the same zoom

### Multi-user sharing test

1. Create a board, click the title, rename it (auto-saves on blur)
2. Via API or a future UI, add another user's ID to the `members` array:
   ```bash
   curl -X POST http://localhost:3000/api/v1/whiteboards/<boardId>/members \
     -H 'Authorization: Bearer <owner_token>' \
     -H 'Content-Type: application/json' \
     -d '{"userId": "<otherUserId>"}'
   ```
3. Log in as the other user → they see the board in their list → can view and edit
4. **Note**: changes don't sync in real-time yet. Both users can see each other's edits only after reloading. Session 32 adds socket-based live sync.

---

## Design choices worth noting

### Why SVG, not Canvas?

Canvas (`<canvas>`) is faster for rendering thousands of elements but:
- Event handling requires manual hit-testing
- No free DOM integration (e.g. `foreignObject` for textarea)
- Harder to reason about selection state
- No CSS hover states

SVG gives us:
- Native click + hover detection per element
- `foreignObject` for inline text editing
- CSS transitions for selection glow
- React-friendly declarative rendering

For the expected use case (hundreds of elements per board, not thousands) SVG is plenty fast. If perf becomes a problem, rendering only visible elements (viewport culling) gets us back a lot of headroom before we'd need to switch to Canvas.

### Why "replace all elements" instead of granular patches?

Simpler to reason about and debug:
- Client holds canonical state
- Server validates + persists

The downside is large payloads for big boards (~100 KB for 500 elements). This is fine at 1.5s debounce — it's < 1 MB/min of server traffic per active user. If boards routinely grow beyond a few hundred elements, Session 32's socket patches cover the same thing incrementally.

### Why subdocs, not a separate `Element` collection?

Two reads to load a board (board + elements) vs one. Atomic writes vs transactional. At the expected scale (hundreds of elements per board, hundreds of boards per org) one-document storage wins. MongoDB's 16 MB document limit gives headroom for ~10,000 elements per board — far beyond any practical use.

### Why viewport is whiteboard-scoped, not per-user?

Shared whiteboards usually work better if everyone opens at the same place — it's the "home" view of the board. Pinning a layout helps keep team members on the same page. For per-user viewports, Session 32 can add them as a side field without breaking this.

### Why no resize handles yet?

Clean minimum viable canvas ships first. Resize handles need corner + edge hit detection, aspect-lock, snap-to-grid — a full evening of work on their own. Deferred to Session 32. For now, delete + recreate if you need different dimensions.

### Why no undo/redo yet?

Same reason — it's its own complexity pile. State history, snapshots vs commands, keyboard bindings. Session 32 is where it lands. For now, the 1.5s debounce gives you a brief window to press Delete and recreate if you've just made a mistake.

### Why sticky notes default to amber?

Tested with 6 colors: yellow, coral, sky, lime, lilac, peach. Amber is the most canonical "sticky" color and least visually jarring on the indigo/violet app background. Users switch colors for categorical grouping (done/in-progress/blocked) — the default is just the neutral starter.

---

## Known tradeoffs

- **No real-time collaboration.** Multiple users can edit the same board, but changes don't stream. Last-save wins. Session 32 fixes this with socket-based element diffs + per-user cursors.
- **No PNG/SVG export.** Boards are persistent but you can't save them as an image. Also Session 32.
- **No resize / rotate handles.** You can drag an element but can't resize it after placement. Same for rotation.
- **Text element is single-line.** Multi-line text wants a richer editor (TipTap again?). Single `<input>` is fine for labels; multi-paragraph text isn't wired.
- **Drawing isn't pressure-sensitive.** Pen pressure events exist in modern browsers; we don't collect them. Strokes are uniform width.
- **No eraser.** Sketched a mistake? Select the draw element and Delete. A proper eraser tool would edit existing polylines in place.
- **No multi-select.** Shift-click to add to selection isn't wired. Neither is drag-rectangle select.
- **No alignment guides / snap.** Elements move freely by 1 px. Snap-to-grid and snap-to-element edges are good next-steps.
- **Touch support is rough.** Wheel zoom doesn't fire on touchscreens; pan via Space+drag doesn't apply either. Touch dedicated code path isn't written; phones fall back to no-input viewing.
- **Sticky text is plain, not rich.** No bold / italic / markdown. For a whiteboard that's probably fine, but some users will want it.

Most of these are **fine for v1** and deliberately deferred to Session 32 or later. What's here is enough to actually use the board for brainstorming, flowcharts, retros, or just capturing ideas visually.

---

## What's next

**Session 32** will complete N2 Whiteboard with:
- Real-time collaboration over sockets (element diffs, not whole replace)
- Per-user cursors showing everyone's current position + name label
- Export to PNG (via dom-to-image-style raster snapshot) and SVG (straight serialization)
- Undo/redo stack
- Resize + rotate handles on selection
- Multi-select via shift-click + drag-rectangle

After that, **Phase G** (Electron packaging) closes out the project in 2 sessions: S33 wrapper + auto-start, S34 auto-updater with signed builds.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | 24–30, **31**, 32 | 🟡 **8/11 done, 1 in progress** |
| G — Electron | 33, 34 | Pending |

**31 of ~34 sessions complete (91%).** Session 32 finishes the whiteboard; then 2 Electron sessions wrap the project.

Say **"next"** for Session 32 — Whiteboard Part 2: real-time collaboration, export, undo/redo, resize handles, multi-select.
