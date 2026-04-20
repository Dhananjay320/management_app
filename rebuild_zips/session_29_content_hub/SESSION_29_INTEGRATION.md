# Session 29 — Content Hub (N7)

**Status: ✅ Build-verified.** Client: 310.28 kB main.js (+3.12 kB), 32.83 kB CSS (+1.37 kB). Server routes + model load cleanly.

Sixth Phase F feature. Adds a central "Learn" hub where admins and editors publish internal learning materials: tutorials, product updates, industry insights, guides, best practices, and team spotlights. Anyone can browse and read; only users with the `content.publish` power can create and feature.

---

## What's in this zip

```
server/
├── index.js                             (patched — wired route)
├── models/
│   ├── User.js                          (patched — content.publish power)
│   └── ContentItem.js                   (NEW)
└── routes/content.js                    (NEW — 8 endpoints)

client/src/
├── App.js                               (patched — 4 routes)
├── components/layout/AppLayout.js       (patched — Learn sidebar link)
└── pages/
    ├── ContentHubPage.js                (NEW — browse with filter/search)
    ├── ContentHubPage.css               (NEW)
    ├── ContentDetailPage.js             (NEW — reader view)
    ├── ContentDetailPage.css            (NEW)
    ├── ContentEditorPage.js             (NEW — create/edit form)
    └── ContentEditorPage.css            (NEW)
```

**12 files: 4 patched + 8 new.** No new npm dependencies.

---

## What it does

**`/content` (sidebar "Learn")** — a browsable feed with three visual layers:

1. **Featured hero** — highlighted articles at the top (up to 4) with larger thumbnails. Empty if nothing is featured yet.
2. **Category chips + search** — filter by category (Getting Started, Product Updates, Industry Insights, How-to Guides, Best Practices, Team Spotlights) or full-text search by title/excerpt/body.
3. **Latest grid** — auto-fill responsive cards sorted by publish date. Replaced with "Results" when a filter/search is active.

**`/content/:id`** — reader view:
- Title hero with type + category kicker
- Excerpt subtitle
- Author + date + read time + view count meta
- Paragraph body (plain text, blank lines = paragraph breaks)
- Tag pills
- Like button (❤️ / 🤍, toggle on click)
- Edit/Delete buttons if you're the author or have `content.publish`

**`/content/new` and `/content/:id/edit`** — shared creation/edit form:
- Title, excerpt, category select, type select
- Emoji thumbnail picker (12 options)
- Plain-text body textarea with live read-time estimate ("~4 min read")
- Tags input (comma-separated, up to 10)
- Featured checkbox (only shown to users with `content.publish`)

### Article types & categories

**Types** (with accent colors):
- `tutorial` — indigo, 📚 default thumb
- `update` — green
- `insight` — amber
- `guide` — purple
- `resource` — cyan (typically has an `url` for external link)

**Categories** (seeded, fixed list):
- Getting Started
- Product Updates
- Industry Insights
- How-to Guides
- Best Practices
- Team Spotlights

If you want more categories later, it's a one-line change in `models/ContentItem.js`.

### Engagement

- **Views** — incremented with atomic `$inc` on every `GET /content/:id` call
- **Likes** — stored as an array of user IDs; toggle endpoint adds/removes in one call, returns new count + `likedByMe` for instant UI update
- **Read time** — auto-computed from body word count on save (`pre('save')` hook), clamped 1–30 min

### Permissions

- **Read** — any authenticated user, no further check
- **Create / Edit featured flag** — requires `content.publish` power (new) or `main_admin` role
- **Edit existing** — own articles OR `content.publish` OR `main_admin`
- **Delete** — same as edit; soft delete (sets `isActive: false`, keeps the row)
- **Like** — any authenticated user

---

## API

### `GET /api/v1/content/categories`
Returns `{ categories: [...6 strings], types: [...5 strings] }`. Used by the UI filter chips and editor dropdowns.

### `GET /api/v1/content/featured`
Returns `{ featured: [...up to 4], recent: [...up to 6] }`. Featured items are de-duplicated out of the recent list. Used by the Hub homepage hero.

### `GET /api/v1/content`
List with filters:

| Param | Behavior |
|---|---|
| `category` | Exact match against the 6 seeded categories |
| `type` | Exact match against the 5 types |
| `tag` | Case-insensitive exact match against the tag array |
| `q` | MongoDB `$text` search across title (weight 10), excerpt (weight 5), body (weight 1) |
| `limit` | Default 50, max 100 |

When `q` is set, results are sorted by relevance score; otherwise by `publishedAt desc`.

### `GET /api/v1/content/:id`
Fetch one article. Atomically increments `views`.

### `POST /api/v1/content`
Create. Required: `title`, `category`. Optional: `excerpt`, `body`, `type`, `url`, `thumbnail`, `tags` (array), `featured` (ignored unless you have `content.publish`).

### `PUT /api/v1/content/:id`
Edit. Same shape as POST. Only author/publisher/admin. `featured` ignored unless you have the power.

### `DELETE /api/v1/content/:id`
Soft delete. Row stays in DB with `isActive: false`.

### `POST /api/v1/content/:id/like`
Toggle like. Returns `{ likes: <new count>, likedByMe: <boolean> }`.

---

## Integration steps

**Prerequisite:** Sessions 1–28 integrated. Specifically the design-system components (`GlassPanel`, `PrimaryButton`, `GradientText`, `Icon`) and `useFetchSafe` + `ErrorState`.

### 1. Copy server files

```
server/models/User.js                  (replace — adds content.publish power)
server/models/ContentItem.js           (new)
server/routes/content.js               (new)
server/index.js                        (replace — one new line)
```

### 2. Copy client files

```
client/src/App.js                                     (replace)
client/src/components/layout/AppLayout.js             (replace)
client/src/pages/ContentHubPage.js                    (new)
client/src/pages/ContentHubPage.css                   (new)
client/src/pages/ContentDetailPage.js                 (new)
client/src/pages/ContentDetailPage.css                (new)
client/src/pages/ContentEditorPage.js                 (new)
client/src/pages/ContentEditorPage.css                (new)
```

### 3. Grant the publishing power to at least one user

The `content.publish` power is **off by default** — so nobody (except `main_admin`) can create articles until you grant it. Options:

- Via the existing powers UI (Session 10's PowersEditor) — navigate to any user → Powers → Content → Publish ✓
- Or directly in MongoDB:
  ```js
  db.users.updateOne({ email: 'ravi@example.com' }, { $set: { 'powers.content.publish': true } })
  ```

### 4. Restart

```bash
cd server && npm start
cd client && npm start
```

### 5. Seed a test article

As a publisher or `main_admin`, visit `/content` → click "+ New article" → fill out:
- Title: "Welcome to Avadeti Team"
- Excerpt: "A quick tour of the features you'll use every day."
- Category: "Getting Started"
- Type: "tutorial"
- Body: a few paragraphs separated by blank lines
- Thumbnail: 👋
- Featured: ✓

Click Publish → lands on the detail page → shows up in the featured hero when you return to `/content`.

### 6. Verify

- **Non-publisher flow:** log in as a regular user → visit `/content` → Learn hub appears, no "+ New article" button → click an article → read it, like it → no Edit/Delete buttons
- **Publisher flow:** log in with `content.publish` → same page has "+ New article" → open article you wrote → Edit/Delete buttons appear
- **Own-article edit flow:** log in as the author of an article without `content.publish` → open the article → Edit/Delete still appear (author can always manage their own)
- **Search:** type a word into the search box → grid filters to matching articles, "Latest" header becomes "Results"
- **Category filter:** click "Product Updates" chip → grid filters
- **Like toggle:** click 🤍 → turns to ❤️ and count increments; click again → back to 🤍
- **View counter:** reload a detail page twice → `views` increases by 2

---

## Design choices worth noting

### Why plain textarea, not TipTap?

The app already uses TipTap for workspace documents (Session 22) and meeting notes (Session 20). Reusing it here would add rich text for content hub articles. But:

- It bundles ~30 KB more JS for a feature that could be fine with plain text
- Images/embeds would need a storage backend if we let authors upload
- Plain markdown-style paragraphs are enough for most tutorials/updates

Starting simple. If authors demand headers/bold/images later, the upgrade is swap the `<textarea>` for `<DocumentEditor>` in `ContentEditorPage.js` — ~10 lines of change — and add a `tiptapJSON` field to `ContentItem` alongside the existing `body` string.

### Why categories are enum, not free-text?

A growing category list would become a mess — seven similar-sounding categories after six months, each with one article. Enum forces intentionality at the schema level. When you genuinely need a new one, edit `models/ContentItem.js`.

### Why separate `excerpt` field instead of auto-truncating `body`?

Truncating loses context — the best summary isn't always the first two sentences. Having authors write a deliberate one-line summary is also healthier editorial practice and makes the card grid read better.

### Why `isActive: false` instead of hard delete?

Authors sometimes regret deletes. Easy to restore with one `updateOne({ isActive: true })` query. No user-facing "restore" UI yet — kept out of scope. Would take ~30 minutes to add an admin archive view if requested.

### Why featured is a boolean, not a number/ordering?

Up to 4 items show in the featured row, sorted by `publishedAt desc`. Explicit ordering (drag to reorder) would be a richer feature; for six categories × a moderate publication pace, "most recently featured" works fine.

---

## Known tradeoffs

- **No draft state.** Creating an article instantly publishes it. Standard CMS pattern would add a `status: 'draft' | 'published'` field + "Save as draft" button. Deferred — most internal publishers write their article in one sitting anyway.
- **No comments / threading.** Articles get likes but not comments. Could add a `ContentComment` model later; pairs with the existing message/reaction patterns.
- **No subscription / "notify me on new articles".** Users have to check the Learn hub manually. Pairs naturally with a future integration with Session 12's notification deep-link.
- **No analytics beyond views + likes.** Could track time-on-page, scroll depth, etc. — deliberately excluded from MVP.
- **Tag autocomplete missing.** Authors type tags freely; no suggestion from existing tags. One-line API addition (`GET /content/tags` → distinct tags) + typeahead on the input would do it.
- **No image uploads in the body.** Plain text only. External image URLs could be rendered as `<img>` if we wanted, but then we'd need sanitization — punted.
- **`content.publish` is a single power.** A more granular model might split into `content.create` vs `content.featureOthers` vs `content.deleteOthers`. Single power is simpler for now.

---

## What's next

Remaining Phase F features:

| # | Feature | Est. sessions |
|---|---|---|
| N5 | Knowledge graph (Notion-style backlinks in docs) | 2 |
| N2 | Whiteboard (infinite canvas, sticky notes, drawing) | 2 |

Recommended next: **N5 Knowledge graph** — adds inline `[[Title]]` backlink syntax to workspace documents that resolves to a real link, plus a backlinks panel showing which other docs reference the current one. Pairs well with the existing Workspace module (Session 22).

Then **N2 Whiteboard** as the big finale of Phase F, followed by two Electron packaging sessions.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | 24, 25, 26, 27, 28, **29** + N2/N5 | 🟡 **6/11 done** |
| G — Electron | 30, 31 | Pending |

**29 of ~32 sessions complete (91%).** Two Phase F features + Electron packaging left.

Say **"next"** for N5 Knowledge graph, or tell me to tackle N2 Whiteboard first.
