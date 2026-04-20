# Session 24 — Scheduled Messages (N3)

**Status: ✅ Build-verified.** Client: 300.65 kB main.js (+1.9 kB), 27.95 kB CSS (+950 B). Server routes + worker load cleanly.

First Phase F session. Adds the ability to queue messages for future delivery. User types a message, clicks the ⏰ clock icon in the input bar, picks a time (quick presets or custom datetime), and the message is delivered automatically when that time arrives.

---

## What's in this zip

```
server/
├── index.js                                   (patched — wired route + worker)
├── models/ScheduledMessage.js                 (NEW)
├── routes/scheduledMessages.js                (NEW — full CRUD)
└── utils/scheduledMessagesWorker.js           (NEW — 30s-poll delivery worker)

client/src/
├── App.js                                     (patched — added /scheduled-messages route)
├── components/
│   ├── ScheduleSendPopover.js                 (NEW — popover with presets + picker)
│   ├── ScheduleSendPopover.css                (NEW)
│   └── layout/AppLayout.js                    (patched — added "Scheduled" sidebar link)
└── pages/
    ├── Messages.js                            (patched — clock button + popover wiring)
    ├── ScheduledMessagesPage.js               (NEW — manage my scheduled msgs)
    └── ScheduledMessagesPage.css              (NEW)
```

**11 files: 4 patched + 7 new.** No new npm dependencies.

---

## How it works

### User flow

1. **Schedule:** User types a message, clicks ⏰ button in input bar → popover opens
2. **Pick time:** Three quick presets (In 1 hour / Tomorrow 9 AM / Monday 9 AM) or datetime-local custom picker
3. **Confirm:** POST to `/scheduled-messages` → record created with `status: pending, sendAt: <chosen>`
4. **Wait:** Worker polls every 30 s for records where `sendAt <= now`
5. **Deliver:** Worker re-checks channel membership → creates actual Message doc → emits `message:received` socket event → fires mention notifications → marks ScheduledMessage as `sent`
6. **Manage:** User can visit `/scheduled-messages` sidebar page to see all their scheduled, sent, failed, and cancelled messages; can cancel pending ones

### Worker safety

**Atomic claim** — the worker uses `findOneAndUpdate({ status: 'pending' }, { status: 'sent' })` to prevent duplicate delivery if multiple server instances run. If the delivery then fails, it reverts to `status: 'failed'` with a reason.

**Re-checks at send time** — not just at schedule time. If the user is removed from the channel after scheduling but before delivery, the message fails gracefully and sends them a notification. This mirrors how real-time sends work: permissions are checked at send, not at typing.

**30-second buffer** — minimum send-at is "now + 30 seconds" so the worker has a chance to pick it up. Prevents the "I scheduled for now" edge case.

### Failure handling

Four failure modes — all notify the sender via socket with a descriptive reason:
- Channel deleted
- User removed from channel
- Other server error during delivery
- (Announcement channel power changes are NOT enforced at delivery — see "Known Tradeoffs" below)

Sender sees `notification:new` with `type: 'system'` + the failure reason. The record stays in their "Failed" tab so they can see what went wrong.

---

## API

### `POST /api/v1/scheduled-messages`
Schedule a new message.

```json
{
  "channel": "<channelId>",
  "content": "Hello, team!",
  "sendAt": "2026-04-21T09:00:00.000Z",
  "mentions": ["<userId>"],   // optional
  "note": "Daily standup"     // optional
}
```

Returns the created record. Errors:
- 400 if content + file both missing
- 400 if sendAt is less than 30 s from now
- 403 if not a channel member
- 403 if trying to post in #announcements without `messaging.postAnnouncements` power

### `GET /api/v1/scheduled-messages?status=pending`
List my scheduled messages, optionally filtered by status (`pending` / `sent` / `cancelled` / `failed`).

### `GET /api/v1/scheduled-messages/:id`
Get one. Only the sender can read their own records.

### `PUT /api/v1/scheduled-messages/:id`
Edit pending messages only. Can update `content`, `sendAt`, `mentions`, `note`. Returns 400 if not pending.

### `DELETE /api/v1/scheduled-messages/:id`
Cancel a pending message. Returns 400 if not pending (you can't "cancel" an already-sent message — it's out in the world).

---

## UI

### Schedule popover

Triggered by the ⏰ icon in the input bar (disabled/greyed out when input is empty). Offers:

- **In 1 hour** — `now + 60 minutes`, shows the resulting time (e.g. "3:42 PM")
- **Tomorrow 9 AM** — `tomorrow at 09:00 local time`, shows the day
- **Monday 9 AM** — `next Monday 09:00 local`, shows the date
- **Custom** — standard HTML `datetime-local` input with 1-min granularity

Error handling: if the chosen time is less than 30 s away, the popover shows an inline error rather than submitting.

### Management page

`/scheduled-messages` in the sidebar. Shows all my scheduled messages split into tabs:

- **Pending** (default) — upcoming messages, with Cancel button
- **Sent** — delivered messages, read-only
- **Failed** — with failure reason displayed
- **Cancelled** — history of cancelled pending messages

Each row shows: channel name · content preview · scheduled time (absolute + relative "in 2h 15m" or "3 days ago").

Styling uses the now-standard Phase E pattern: hero header, SegmentedControl for tabs, `useFetchSafe` + `ErrorState`, glass card empty states.

---

## Integration steps

**Prerequisite:** Sessions 1–23 integrated.

### 1. Copy server files

```
server/models/ScheduledMessage.js
server/routes/scheduledMessages.js
server/utils/scheduledMessagesWorker.js
server/index.js                             (replace)
```

### 2. Copy client files

```
client/src/App.js                                         (replace)
client/src/components/ScheduleSendPopover.js              (new)
client/src/components/ScheduleSendPopover.css             (new)
client/src/components/layout/AppLayout.js                 (replace)
client/src/pages/Messages.js                              (replace)
client/src/pages/ScheduledMessagesPage.js                 (new)
client/src/pages/ScheduledMessagesPage.css                (new)
```

### 3. Restart

```bash
cd server && npm start   # should log: [scheduled-messages] worker started (poll every 30s)
cd client && npm start
```

### 4. Verify

- Open any chat, type a message, click ⏰
- Pick "In 1 hour" → popover closes, input clears
- Visit `/scheduled-messages` → see the message in Pending tab
- Wait for the scheduled time → within ~30 s of the target it gets delivered as a normal chat message
- Go back to `/scheduled-messages` → moves from Pending to Sent tab

### Quick end-to-end test

1. Schedule a message for "In 1 hour"
2. Manually update its `sendAt` in MongoDB to 1 minute ago:
   ```js
   db.scheduledmessages.updateOne({ _id: <id> }, { $set: { sendAt: new Date(Date.now() - 60000) } })
   ```
3. Within 30 s, the worker picks it up. Check the chat — message appears. Check the page — it's in Sent tab.

---

## Known tradeoffs

- **30-second poll** — not instant. A message scheduled for `18:00:00` arrives between `18:00:00` and `18:00:30`. This is the price for a simple poll-based worker vs. a complex priority-queue scheduler. Acceptable for most use cases (meeting reminders, morning standups, EOD wraps).
- **No instance coordination beyond atomic claims** — fine for single-server deployments. For multi-instance horizontally-scaled setups, the atomic `findOneAndUpdate` prevents duplicate delivery, but there's no "only one worker polls" semantics. Worst case: both servers poll, both find due messages, but each `findOneAndUpdate` only succeeds for one — the other gets `null` and skips. Correct behavior.
- **Announcement power not re-checked at delivery** — if user A schedules a message in #announcements while they have the power, then loses the power before delivery, the message still goes. We considered re-checking but decided against it: scheduled sends are essentially "intent recorded at scheduling time". If this becomes a problem, it's a one-line add to `deliverOne()`.
- **No recurring messages** — "every Monday 9 AM" is not supported. Would need a separate `recurrence` pattern in the schema. Out of scope for N3 MVP.
- **No draft rescheduling UI** — the PUT endpoint exists but the management page doesn't expose Edit. Cancel + reschedule is the workaround. Edit UI is a one-session follow-up.

---

## What's next

Remaining Phase F features:

| # | Feature | Est. sessions |
|---|---|---|
| N4 | Follow someone (activity type + social follow) | 1 |
| N1 | Draggable sticky notes overlay | 1 |
| N6 | Wellness module (quote, meditation, mood) | 1 |
| N7 | Content hub (tutorials, feeds) | 1–2 |
| N8 | Gamification (XP, badges, leaderboard) | 2 |
| N5 | Knowledge graph (Notion/Obsidian-style backlinks) | 2 |
| N2 | Whiteboard | 2 |

Recommended next: **N4 Follow someone** — pairs naturally with N3 since both are "activity" features, and it's a quick win.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ |
| B — Security | 4, 5 | ✅ |
| C — Broken repairs | 6–9 | ✅ |
| D — Cross-cutting | 10–17 | ✅ |
| E — Module restyles | 18–23 | ✅ |
| **F — New features** | **24**, 25, 26, 27 + N1/N2/N4–N8 | 🟡 **1/11 done** |
| G — Electron | 28, 29 | Pending |

Say **"next"** when ready for Session 25 — N4 Follow someone.
