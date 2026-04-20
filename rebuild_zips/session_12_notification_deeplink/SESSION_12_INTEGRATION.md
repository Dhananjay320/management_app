# Session 12 — Notification Deep-Linking (C3)

**Status: ✅ Build-verified.** Client: 289.29 kB main.js (+0.9 kB), 21.25 kB CSS.

This session closes audit gap **C3**: clicking a notification did nothing. The schema already carried `actionType`, `entityType`, `entityId` — the frontend just never used them. Now every notification with a target routes to its module with the item highlighted.

Bonus: the notification bell badge and sidebar unread counts now show real live numbers instead of placeholder text.

---

## What's in this zip

```
client/src/
├── hooks/                              (NEW folder)
│   ├── useNotificationDeepLink.js      (NEW — centralized routing logic)
│   └── useNotificationCounts.js        (NEW — live unread counts)
├── pages/
│   └── NotificationsPage.js            (patched — row click navigates)
├── components/
│   ├── NotificationToast.js            (patched — toast click navigates)
│   └── layout/
│       └── AppLayout.js                (patched — real badge counts from server)
└── styles/
    └── notifications.css               (patched — hover + deep-link hint styles)
```

**7 files: 5 patched + 2 new.** Server unchanged.

---

## What changed

### `useNotificationDeepLink` hook

Centralizes the mapping from a Notification document to a route path. Checked in this priority order:

1. **`actionType`** (explicit): `view_task` → `/tasks?highlight=<id>`, `view_meeting` → `/meetings?highlight=<id>`, `reply` for messages → `/messages?channel=<id>`, `reply` for email → `/email?highlight=<id>`, `add_to_calendar` → `/`, `acknowledge` → null (user dismisses locally)
2. **`entityType`** (fallback): `task` / `meeting` / `channel` / `message` / `email` / `leave` / `dispute` / `announcement` → their respective pages
3. **`type`** (broadest): `task` / `meeting` / `message` / `email` / `salary` / `attendance` / `approval` / `announcement` → their landing pages

Exports both the pure function `pathForNotification(n)` (returns string or null) and the hook `useNotificationDeepLink()` (returns a click handler that marks-read and navigates).

**Why a pure function next to the hook?** Components may want to know if a link exists before rendering (to conditionally style the row as clickable) — `pathForNotification(n)` is safe to call during render.

### `NotificationsPage.js` changes

- Row click now calls `followNotification(n)` which marks read AND navigates
- `has-link` class added to rows with a resolvable path
- `↗` hint icon appears on hover for linkable rows
- Keyboard accessible: Enter / Space on a focused row follows the link
- Non-linkable rows (e.g. emergency notifications requiring ack) still mark-read but don't navigate

### `NotificationToast.js` changes

- Toast content area is now clickable — follows link + auto-dismisses
- Emergency toasts stay modal and don't navigate (ack required)
- `email:new` socket event now passes `entityId` through so deep-linking works
- Hover brightness tweak for visual feedback

### `useNotificationCounts` hook

Replaces the hardcoded `notifBadge = 4` with real live counts. Features:

- Initial fetch on mount
- Refreshes on `notification:new`, `notification:emergency`, `notification:dismissed`, `notification:read` socket events
- 60-second periodic refetch as safety net against missed events
- Returns `{ total, byType, emergencyUnacked, refetch }`

### `AppLayout.js` changes

- Topbar bell now shows real unread count (hidden when zero, "99+" when > 99)
- Sidebar nav items now show per-category unread counts via `unreadKey`:
  - Tasks → `byType.task`
  - Messages → `byType.message`
  - Meetings → `byType.meeting`
  - Email → `byType.email`
  - Notifications → `total`

---

## Integration steps

**Prerequisite:** Sessions 1–11 integrated.

### 1. Create the hooks folder + copy new hooks

```
client/src/hooks/useNotificationDeepLink.js    (new)
client/src/hooks/useNotificationCounts.js      (new)
```

### 2. Replace the patched files

```
client/src/pages/NotificationsPage.js          (replace)
client/src/components/NotificationToast.js     (replace)
client/src/components/layout/AppLayout.js      (replace)
client/src/styles/notifications.css            (replace)
```

### 3. Restart

```bash
cd client && npm start
```

---

## Testing

### Deep-linking (the main fix)

1. Have another user assign you a task. A notification appears. Click it → navigates to `/tasks?highlight=<taskId>`.
2. Get invited to a meeting. Click the notification → navigates to `/meetings?highlight=<meetingId>`.
3. Receive a `@mention` in messages. Click the notification → navigates to `/messages?channel=<channelId>`.
4. Receive a new email. The toast body shows "New Email — from Alice: Hi there". Click the toast → navigates to `/email?highlight=<emailId>` and toast dismisses.
5. Emergency alert arrives. Click-to-follow disabled; emergency button says "Acknowledge". Clicking acknowledge dismisses the toast.

**Note:** the target pages (`/tasks`, `/meetings`, etc.) don't yet _do_ anything with `?highlight=<id>` — they just navigate. Scrolling to and highlighting the item is a Session 18-23 task (module restyles). For now deep-link is "navigate to the right page."

### Live badge counts

1. Have someone send you 3 notifications. Bell badge shows `3`. Sidebar "Notifications" shows `3`.
2. Mark one as read. Within a second, badges update to `2`.
3. Clear all. Badges disappear (hidden at zero, not shown as `0`).
4. Get a new message with 120 unread aggregate — badge shows "99+".

### Accessibility

1. Tab through the notifications page. Each linkable row is focusable.
2. Press Enter on a focused row → same as click.
3. Non-linkable rows are NOT in the tab order.

---

## Design notes

### Why pure function + hook?

`pathForNotification(n)` returns a route path string or null. Use cases:

- Inside a component: decide if a row is clickable (`const hasLink = !!pathForNotification(n)`)
- In a context menu: show "Copy link" with the resolved path
- In tests: verify the mapping without setting up react-router

The `useNotificationDeepLink()` hook wraps it with actual navigation + mark-read.

### Why not use Link / `<a href>` ?

The notifications page shows custom-rendered rows with multiple sub-actions (dismiss button, acknowledge button, etc.). A single `<a>` wrapping the row would fight with those inner buttons. We use `onClick` + keyboard handling + `role="link"` instead — same accessibility, cleaner DOM.

### Target pages don't yet highlight items

`/tasks?highlight=<id>` currently just loads the Tasks page. Session 18 (Tasks restyle) will read the param, scroll to the target, and flash it. That's intentional scope — deep-linking the ROUTE is Session 12, highlighting the ITEM is each module's restyle session.

---

## Progress map

| Phase | Sessions | Status |
|---|---|---|
| A — Foundation | 1, 2, 3 | ✅ Complete |
| B — Security | 4, 5 | ✅ Complete |
| C — Broken repairs | 6, 7, 8, 9 | ✅ Complete |
| **D — Cross-cutting** | 10, 11, **12**, 13–17 | 🟡 3/8 done |
| E — Module restyles | 18–23 | Pending |
| F — New features | 24–27 | Pending |
| G — Electron | 28, 29 | Pending |

## Next — Session 13

**C5 — Socket reliability.** Real-time is flaky today:
- Reconnection logic missing — if the socket drops, the client silently stays disconnected
- No missed-message replay on reconnect
- User presence (online/away/offline) isn't synced across tabs
- Typing indicators leak (never cleared when user navigates away)

Session 13 adds proper reconnect, replay of missed events, a presence heartbeat, and typing-indicator cleanup.

Say "**next**" when ready.
