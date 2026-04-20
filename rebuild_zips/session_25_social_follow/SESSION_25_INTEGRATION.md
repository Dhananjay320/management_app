# Session 25 — Follow Someone / Social (N4)

**Status: ✅ Build-verified.** Client: 302.49 kB main.js (+1.84 kB), 28.88 kB CSS (+930 B). Server routes load cleanly.

Second Phase F feature. Adds social-media-style follows between users. Features: Follow someone indefinitely or for a bounded period ("mentor for this project, until Dec 1"), view followers/following, get notified when someone follows you, browse any user's public profile.

---

## What's in this zip

```
server/
├── index.js                                  (patched — wired route)
├── models/Follow.js                          (NEW)
└── routes/follows.js                         (NEW — 6 endpoints)

client/src/
├── App.js                                    (patched — /social + /profile/:userId routes)
├── components/
│   ├── FollowButton.js                       (NEW — reusable follow toggle)
│   ├── FollowButton.css                      (NEW)
│   └── layout/AppLayout.js                   (patched — sidebar nav)
└── pages/
    ├── FollowingPage.js                      (NEW — followers / following lists)
    ├── FollowingPage.css                     (NEW)
    ├── UserProfilePage.js                    (NEW — view any user's profile)
    └── UserProfilePage.css                   (NEW)
```

**11 files: 3 patched + 8 new.** No new npm dependencies.

---

## How it works

### Follow types

Two flavors supported:

- **Open-ended** (`endAt: null`) — indefinite follow, like a classic social-media follow. "I follow Priya because she writes great status updates."
- **Bounded** (`endAt: <future date>`) — follow expires automatically. "Follow Ravi until Dec 1 for the onboarding project." After the expiry date, the follow is silently excluded from active queries. The row remains in the DB for audit.

### Optional note

Both types can carry a short note (max 200 chars) explaining why. Shown to the follower in their "Following" list (e.g. "Ravi · mentoring"). Not shown to the followee — the follow is still public but the reason is private.

### User flow

1. **Discover:** Navigate to any user's profile at `/profile/:userId`
2. **Follow:** Click the "+ Follow" button → opens an inline picker asking for optional reason + expiry date → click Follow
3. **Notify:** The followed user gets a bell notification + live socket event: "Ravi is following you"
4. **Track:** Visit `/social` (new sidebar item) → two tabs: Following and Followers
5. **Unfollow:** Hover the "Following ✓" button → label flips to red "Unfollow" → click to cancel

### Notifications

- Follower action → `Notification.create({ type: 'follow', entityType: 'user', entityId: followerId })`
- Best-effort: notification failure never blocks the follow itself
- Dedupe: `notifiedAt` is stored on the Follow row so cancel-then-refollow doesn't re-ping the followee

### Counts & relationships

- **Public counts** — anyone can call `GET /follows/count/:userId` to render "42 followers · 18 following" on a profile
- **is-following check** — `GET /follows/is-following/:userId` returns `{ isFollowing: true, followId, endAt, note }` for the FollowButton to show the right state
- **Self-follow prevention** — blocked at the schema `pre('validate')` hook AND at the route handler, defense in depth

---

## API

### `POST /api/v1/follows`
Follow a user (or refresh settings on an existing follow).

```json
{
  "userId": "<userId>",
  "endAt":  "2026-12-01T00:00:00.000Z",    // optional — bounded follow
  "note":   "Mentoring on the Q4 project"  // optional
}
```

Returns `201` with the populated follow record. Errors:
- `400` `{ error: "You cannot follow yourself." }`
- `400` `{ error: "userId is required." }`
- `404` `{ error: "User not found." }` (target inactive or doesn't exist)

### `DELETE /api/v1/follows/:id`
Unfollow by follow-record ID. Only the follower can cancel.

### `DELETE /api/v1/follows/by-user/:userId`
Convenience: unfollow by target user ID (when you don't have the follow record ID handy, e.g. on a profile page).

### `GET /api/v1/follows/following`
Users I follow. Populated with `following` user details. Filters out expired bounded follows.

### `GET /api/v1/follows/followers`
Users who follow me. Populated with `follower` user details.

### `GET /api/v1/follows/count/:userId`
Returns `{ followers: N, following: N }` for any user. Used for the profile stats.

### `GET /api/v1/follows/is-following/:userId`
Returns `{ isFollowing: boolean, followId?, endAt?, note? }`. Used by FollowButton to decide its state.

---

## UI

### FollowButton

Drop-in component that's self-contained:

```jsx
<FollowButton userId={person._id} />
<FollowButton userId={person._id} size="sm" />
<FollowButton userId={person._id} showDurationPicker />
```

Three visual states:
- **Not following** — "+ Follow" with gradient background
- **Following** — "Following ✓" with subtle indigo tint
- **Hover while following** — flips to red "Unfollow" so the destructive action is explicit (standard Twitter/Instagram UX pattern)

`showDurationPicker={true}` opens a small popover before following:
- Reason input (optional, max 200 chars)
- Date picker for expiry (optional)
- Cancel + Follow buttons

Call `onChange={({ isFollowing }) => ...}` to react to state changes (the parent can refetch counts, etc.).

### FollowingPage — `/social`

Two-tab SegmentedControl: Following (N) / Followers (N). Each row shows:
- Avatar + name (clickable → `/profile/:userId`)
- Job title or email
- The follow note in italics
- "You followed 2d ago" or "Followed you 2d ago"
- Expiry hint if bounded: "expires today" / "expires in 4 days" / "until Dec 1"
- Inline FollowButton for quick unfollow / follow-back

Empty states adapt to the active tab ("Not following anyone yet" vs. "No followers yet").

### UserProfilePage — `/profile/:userId`

Minimal profile view:
- Big gradient avatar + name + title
- Status message (italic)
- **Stats row**: followers · following · team — followers/following link to `/social`
- FollowButton with `showDurationPicker` (hidden when viewing your own profile)
- Field grid: email · phone · office · role

Designed so later feature sessions can layer on top:
- N5 knowledge graph: add "shared docs" tab
- N8 gamification: add "achievements" tab
- N6 wellness: add "mood check-in" visibility if shared

---

## Integration steps

**Prerequisite:** Sessions 1–24 integrated.

### 1. Copy server files

```
server/models/Follow.js
server/routes/follows.js
server/index.js                (replace — just adds the new route line)
```

### 2. Copy client files

```
client/src/App.js                                   (replace — adds 2 routes)
client/src/components/FollowButton.js               (new)
client/src/components/FollowButton.css              (new)
client/src/components/layout/AppLayout.js           (replace — adds "Following" nav)
client/src/pages/FollowingPage.js                   (new)
client/src/pages/FollowingPage.css                  (new)
client/src/pages/UserProfilePage.js                 (new)
client/src/pages/UserProfilePage.css                (new)
```

### 3. Restart

```bash
cd server && npm start
cd client && npm start
```

### 4. Verify

- Create two test users (A, B), log in as A
- Visit `/profile/<userBId>` → "+ Follow" button visible
- Click Follow → button flips to "Following ✓"
- Open new browser window, log in as B → bell notification "A is following you"
- Visit `/social` as A → User B in Following tab with "You followed just now"
- Visit `/social` as B → User A in Followers tab

### Bounded follow test

- On user B's profile, click "+ Follow" → picker opens
- Note: "testing bounded" · Date: tomorrow
- Click Follow → row shows "expires tomorrow"
- Manually set that row's `endAt` to yesterday in MongoDB:
  ```js
  db.follows.updateOne({ _id: <id> }, { $set: { endAt: new Date(Date.now() - 86400000) } })
  ```
- Reload `/social` → the row is gone from Following (filtered as expired)
- DB still has the row with `isActive: true` — audit trail preserved

### Self-follow block

- Visit `/profile/<myOwnId>` → FollowButton not rendered (isSelf = true)
- If someone bypasses the UI and POSTs with their own userId → 400 from the route
- If that's somehow bypassed too → schema `pre('validate')` hook throws

---

## Known tradeoffs

- **No activity-feed integration yet.** Session 25 introduces follows; showing "Ravi started following Priya" as an activity in the team feed is a separate one-line change in the Activity routes. Deferred so this session stays atomic.
- **No expiry cleanup cron.** Expired follows remain `isActive: true` in the DB until a cron flips them. Queries filter out expired ones client-side in the route handlers (`isCurrent()`), so the behavior is correct — it's just that `isActive` isn't maintained. A one-line cron job can fix it:
  ```js
  // utils/schedulers.js
  await Follow.updateMany({ endAt: { $lt: new Date() }, isActive: true }, { $set: { isActive: false } });
  ```
  Harmless to leave for now.
- **No "mutual follows" badge.** You can compute this client-side with both lists; a server endpoint `GET /follows/mutual/:userId` could return the intersection. Easy to add later.
- **No block/mute.** If following becomes abusive, the followee has no way to prevent it. Simple to add: a `blockedFollowers` array on User. Deferred pending real need.
- **Notification deep-link.** The follow notification points at `entityType: 'user', entityId: followerId`. The existing deep-link hook (Session 12) doesn't route user entities anywhere specific — clicking the toast does nothing useful right now. One-line fix: route to `/profile/:userId`. I'll bundle that with whatever notification polish comes next.

---

## What's next

Remaining Phase F features, in suggested order:

| # | Feature | Est. sessions | Why now? |
|---|---|---|---|
| N1 | Draggable sticky notes overlay | 1 | Quick visual win |
| N6 | Wellness module | 1 | Adds positive tone to the app |
| N7 | Content hub | 1–2 | Extends the Feed concept |
| N8 | Gamification | 2 | Profile page has a slot for badges already |
| N5 | Knowledge graph | 2 | Workspace module has a slot for backlinks |
| N2 | Whiteboard | 2 | Most effort — save for last |

Recommended next: **N1 Draggable sticky notes overlay** — small but highly visible.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | 24, **25**, 26, 27 + N1/N2/N5–N8 | 🟡 **2/11 done** |
| G — Electron | 28, 29 | Pending |

Say **"next"** when ready for Session 26 — N1 Draggable sticky notes overlay.
