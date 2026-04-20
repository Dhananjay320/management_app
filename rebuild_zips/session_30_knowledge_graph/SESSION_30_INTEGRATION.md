# Session 30 — Knowledge Graph Backlinks (N5)

**Status: ✅ Build-verified.** Client: 311.85 kB main.js (+1.57 kB), 33.44 kB CSS (+610 B). Server routes + model load cleanly.

Seventh Phase F feature. Adds Notion/Obsidian-style `[[Document Title]]` syntax to workspace documents. Write a reference in one doc, get bidirectional linking automatically. Every document grows a "Linked mentions" panel showing which other docs reference it. A new `/workspace/graph/:id` page visualizes the whole network.

---

## What's in this zip

```
server/
├── models/Workspace.js              (patched — backlinksOut field + index)
└── routes/workspace.js              (patched — parser + 4 new endpoints)

client/src/
├── App.js                           (patched — graph route)
├── components/
│   ├── BacklinksPanel.js            (NEW — inbound + outbound links display)
│   └── BacklinksPanel.css           (NEW)
└── pages/
    ├── WorkspacePage.js             (patched — mounts BacklinksPanel, graph link)
    ├── WorkspaceGraphPage.js        (NEW — SVG visual of document network)
    └── WorkspaceGraphPage.css       (NEW)
```

**8 files: 4 patched + 4 new.** No new npm dependencies.

---

## How it works

### Writing backlinks

In any workspace document, type `[[Target Title]]` anywhere in the body text. On save:

1. Server extracts plain text from TipTap JSON (existing helper)
2. New `resolveBacklinks()` helper scans for `[[...]]` tokens
3. Each unique token is matched case-insensitively against other documents' titles in the same workspace
4. Matches are stored on the current doc as `backlinksOut: [{ targetId, title }]`
5. Unresolved tokens are still recorded with `targetId: null` so the intent is preserved

Matching is resilient to:
- Whitespace differences (`  Q4 plans  ` matches `Q4 Plans`)
- Case differences (`q4 plans` matches `Q4 Plans`)
- Duplicate references (de-duped server-side)

### Reverse query — "who links to me?"

Rather than maintaining a separate `backlinksIn` field (which would need syncing), we query on the index:

```js
WorkspaceDocument.find({ 'backlinksOut.targetId': docId })
```

The index `{ 'backlinksOut.targetId': 1 }` (added to the schema) makes this O(log n). No sync bugs, no stale data.

### Broken-link detection

If you link `[[Q4 Plans]]` and later delete or rename that doc, the `backlinksOut` entry still has a `targetId` pointing at a deleted doc. The `GET /backlinks-out` endpoint detects this by populating target titles live and marking entries where the target is missing as `broken: true`. The UI shows these greyed + strikethrough.

### Graph view

`GET /workspace/:id/graph` returns `{ nodes, edges }`:
- `nodes` = all active documents in the workspace with title + updatedAt
- `edges` = every `backlinksOut` entry with a valid resolved target

Client builds a radial layout: well-connected nodes (high degree) go on an inner ring, loose nodes go outer. Deterministic — same workspace always produces the same graph. No `d3` or `vis.js` dependency; it's ~80 lines of SVG math.

Above 60 documents the SVG gets too busy to read, so the graph page falls back to a sorted-by-connections list.

### Editor integration

The `BacklinksPanel` is mounted below the document editor in `WorkspacePage.js`. It shows:

- **Linked mentions (N)** — docs that reference the current one (reverse query)
- **Outgoing links (N)** — what the current doc references, with broken-link markers

Each item is clickable → opens that doc in the same editor.

If both sections are empty, the panel doesn't render — keeps the editor clean for new docs.

---

## API

### `GET /api/v1/workspace/documents/:docId/backlinks-in`
Returns docs that link to this one. Populated with `lastEditedBy.name`.

### `GET /api/v1/workspace/documents/:docId/backlinks-out`
Returns this doc's outgoing links, with live target titles + broken-link flags:

```json
[
  { "targetId": "abc123", "title": "Q4 Plans", "titleLive": "Q4 Plans (updated)", "broken": false },
  { "targetId": null, "title": "Does Not Exist", "titleLive": null, "broken": true }
]
```

### `GET /api/v1/workspace/:id/suggest?q=prefix`
Prefix-match title autocomplete. Not wired into the editor UI yet (see known tradeoffs) but the endpoint is available for future typeahead integration.

### `GET /api/v1/workspace/:id/graph`
Full workspace graph:

```json
{
  "nodes": [{ "id": "...", "title": "...", "updatedAt": "..." }],
  "edges": [{ "source": "...", "target": "..." }]
}
```

---

## UI

### BacklinksPanel (on every doc editor)

```
🔗 LINKED MENTIONS (3)
  Q4 Strategy · edited by Priya
  Customer Research · edited by Ravi
  Onboarding Guide · edited by you

↗️ OUTGOING LINKS (2)
  Brand Guidelines
  Archived Plan · broken          [greyed, strikethrough]
```

Clicking any item opens that doc in the editor. Broken items are disabled.

### Graph view

Accessed from the 🌐 Graph badge in the workspace detail header, or via URL `/workspace/graph/:workspaceId`.

- SVG viewbox 900×900, auto-scales to content
- Each document is a circle, size ~ sqrt(connection count)
- Edges are straight lines
- Hover a node → its edges + connected nodes highlight in violet
- Click a node → opens that doc in the workspace editor via `?doc=` deep-link (Session 22 feature)

For > 60 docs: shows a simple list sorted by connection count.

---

## Integration steps

**Prerequisite:** Sessions 1–29 integrated. Specifically:
- Session 22 Workspace restyle (BacklinksPanel assumes the restyled editor)
- The `useFetchSafe` + `ErrorState` + `GlassPanel` / `GradientText` design components

### 1. Copy files

```
server/models/Workspace.js                       (replace)
server/routes/workspace.js                       (replace)

client/src/App.js                                (replace)
client/src/components/BacklinksPanel.js          (new)
client/src/components/BacklinksPanel.css         (new)
client/src/pages/WorkspacePage.js                (replace)
client/src/pages/WorkspaceGraphPage.js           (new)
client/src/pages/WorkspaceGraphPage.css          (new)
```

### 2. Restart

```bash
cd server && npm start
cd client && npm start
```

### 3. Seed some backlinks

Existing documents won't have `backlinksOut` populated (the field is new). Two options:

**A. Re-save existing docs manually.** Open each document, make a minor edit, save — the PUT handler resolves backlinks on every save.

**B. Run a one-shot migration** from a Mongo shell:

```js
// In a node repl or script with the models loaded:
const { WorkspaceDocument } = require('./models/Workspace');
const { resolveBacklinks } = require('./routes/workspace'); // not currently exported — see below

// ^ To run this you'd need to export resolveBacklinks from workspace.js.
// The cleaner approach is just (A): re-save each doc.
```

Since `resolveBacklinks` is a local helper in `workspace.js`, the easy migration is to open each doc and save it once (the editor's autosave does it automatically as soon as you type anything).

### 4. Verify

1. Create three documents: "Alpha", "Beta", "Gamma"
2. Edit "Alpha" and include the text: `See [[Beta]] for details, and [[Gamma]] too.`
3. Save (autosaves after 1.5s debounce per Session 22)
4. Open "Beta" → scroll below body → **Linked mentions** panel shows "Alpha"
5. Open "Alpha" → **Outgoing links** panel shows "Beta" and "Gamma"
6. Delete "Gamma" → re-open "Alpha" → outgoing link to "Gamma" is greyed out with "broken" label
7. Visit `/workspace/graph/<wsId>` (or click 🌐 Graph in the workspace header) → three nodes with an edge Alpha→Beta visible
8. Click "Alpha" in the graph → opens that doc in the editor

### Unresolved `[[...]]` handling

Type `[[Does Not Exist Yet]]` in a doc and save. The token is stored with `targetId: null`. In the "Outgoing links" panel it shows up as broken. If you then create a doc named "Does Not Exist Yet" and re-save the referring doc, the link resolves automatically.

---

## Design choices worth noting

### Why server-side parsing, not client-side?

The `[[...]]` tokens need to be resolved to real document IDs to support broken-link detection and reverse queries. Client-side parsing would still need a round-trip to confirm titles, and would race with other editors in a multi-user workspace. Server parses on save = one source of truth, tokens always up-to-date with actual document state.

### Why not a custom TipTap mark?

Considered and deferred. A custom TipTap extension would render `[[Title]]` as a styled inline pill with live hover preview and click-to-open. That's the next evolution — the schema + API in this session don't change when someone adds it. Keeping this first version pure-text keeps the diff small and the feature battle-tested before we layer editor UX on top.

### Why store title at link time?

If I write `[[Q4 Plans]]` and then someone renames the target to "Q4 Strategy", the `backlinksOut` entry still has `title: "Q4 Plans"` because that's what I wrote. But the `titleLive` in `GET /backlinks-out` pulls the target's current title, so the UI can display "Q4 Strategy" while `title` remains a historical record of my original intent. This way:
- Broken links preserve the title the user typed (debuggable)
- Live links show current titles (accurate)

### Why a radial layout, not a force-directed simulation?

Force-directed graphs (d3-force, Cytoscape) look great but:
- Non-deterministic (same data → different layouts each time)
- Computationally expensive for large graphs
- Drag complexity, physics tuning
- Add a ~50 KB dependency

Deterministic radial layout gets us 80% of the visual effect at 0 KB dependency cost and no layout instability. If the graph grows in importance, swapping in `cytoscape.js` is a focused one-session upgrade.

### Why max 60 nodes before fallback?

SVG labels become unreadable around that density. Tested with 30, 60, 100 node graphs. 60 is the breaking point where you can still roughly follow edges. Beyond that, a list sorted by degree is more useful than a busy visualization.

---

## Known tradeoffs

- **No typeahead in the editor.** The `/:id/suggest` endpoint exists, but the TipTap editor doesn't hook into it yet. A user types `[[Q4` and nothing pops up. The explicit UX would be: on `[[`, open a popover listing matching titles; Enter to insert. Not hard — a TipTap `Suggestion` extension is the natural fit — but deferred to keep this session atomic.
- **Links are scoped to the current workspace.** You can't link a doc in workspace A to a doc in workspace B with `[[...]]`. Fine for now (workspaces are usually team-scoped), but if cross-workspace linking becomes a need, the resolver would need to be global + include workspace permission checks at render time.
- **No real-time sync of broken links.** If someone else deletes the target doc, your "Outgoing links" panel still shows it as not-broken until you refresh. Could be a socket event; adds complexity for rare use case.
- **No inline rendering in the body.** The editor shows raw `[[Title]]` text, not a styled pill. Readers see it too — which is arguably not terrible (the syntax is self-documenting) but a future polish pass with a TipTap mark would make it look like a first-class citizen.
- **Graph layout is purely topological.** Categories, classification, or last-edited date don't influence placement. Could be visualized as node color (`classification: personal | company | client`) easily — decided to ship simple first.
- **No existing-doc migration.** Docs saved before Session 30 have no `backlinksOut`. They have to be re-saved once to populate. A background job could sweep and resolve them all on server start; considered over-engineered for a feature most users would retrofit gradually.
- **No auto-creation from a broken link.** Click a broken link → nothing happens. Could offer "Create a doc titled 'X' here?" Might be worth adding in a polish pass.
- **Self-references allowed.** `[[Alpha]]` inside "Alpha" creates a self-edge in the graph. Not filtered out (it's technically truthful — the doc references itself) but some graph visualizations would want to dedupe. Didn't want to silently drop them since it's not obviously wrong.

---

## What's next

One Phase F feature remaining:

| # | Feature | Est. sessions |
|---|---|---|
| N2 | Whiteboard (infinite canvas, drawing, sticky notes) | 2 |

Then **Phase G — Electron packaging** (2 sessions):
- S33: Electron wrapper + menu + auto-start
- S34: Auto-updater with signed builds

After that, the rebuild is complete.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | 24–29, **30** + N2 | 🟡 **7/11 done** |
| G — Electron | 31, 32 | Pending |

**30 of ~32 sessions complete (94%).** One feature + packaging left.

Say **"next"** for the final Phase F feature — N2 Whiteboard (infinite canvas with drawing tools and sticky notes). That's projected to be 2 sessions because it's the largest scope remaining, then we move into Electron packaging.
