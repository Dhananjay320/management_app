# Sessions 2 + 3 — Integration Guide

**Status: ✅ Build-verified** against React 19 + react-scripts 5 with Session 1 pre-applied.

Both sessions are frontend restyles. They depend on **Session 1** (design system) being already integrated.

---

## ⚠️ Prerequisite

Before integrating this, **Session 1** must already be in place:
- `src/design-system/` folder exists
- `App.js` imports `AmbientBackground` and `design-system/index.css`
- `index.js` adds `ad-theme` class to body

If you haven't integrated Session 1 yet, do that first.

---

## What's in this zip

```
src/
├── components/layout/
│   ├── AppLayout.js     ← REPLACES existing file (Session 2)
│   └── AppLayout.css    ← NEW file (Session 2)
├── pages/
│   ├── CalendarHome.js  ← REPLACES existing file (Session 3)
│   └── CalendarHome.css ← NEW file (Session 3)
└── design-system/
    ├── icons.js         ← NEW file (inline SVG icon set)
    └── index.js         ← REPLACES Session 1 version (adds Icon export)
```

**5 files total**: 3 new + 3 replacements (`index.js` gets a small update).

---

## Integration steps

### Step 1 — Apply Session 2 (App Shell)

1. Copy `src/components/layout/AppLayout.js` → overwrites your existing file.
2. Copy `src/components/layout/AppLayout.css` → new file.

The old `styles/layout.css` can stay for now (the new code uses `.ad-` prefixed classes that don't conflict). It will be removed in a future cleanup session.

**What changed:**
- New topbar with logo + search + ⌘K hint + notification badge + avatar menu
- New sidebar with gradient active-state rail and glow
- Admin toggle is now a tactile pill switch with knob animation
- Nav items use inline SVG icons (no emojis — cleaner at all sizes)
- Responsive: collapses to icon-only below 1100px, hidden below 760px
- User menu dropdown restyled (glass panel with animated entrance)

### Step 2 — Apply Session 3 (Calendar restyle)

1. Copy `src/pages/CalendarHome.js` → overwrites your existing file.
2. Copy `src/pages/CalendarHome.css` → new file.

The old `styles/calendar.css` import is no longer needed by the new file but can stay in place (won't conflict — old styles target different class names).

**What changed (+ bugs fixed from audit):**
- Animated "Hi [firstName] 👋" greeting with shimmer gradient + waving hand
- Announcement banner with amber-gold gradient and animated light sweep
- Week grid with animated conic-gradient border on today's cell
- Event chips color-coded by type with hover lift + glow
- **🐛 BUG FIX**: Removed hardcoded fake admin widgets (92%, 3, 47) — replaced with real admin chip
- **🐛 BUG FIX**: Events are now clickable — navigate to their respective module
- **🐛 BUG FIX**: Day cells now clickable — switches to daily view for that date
- Daily/Weekly/Monthly views with smooth transitions
- "Today's Focus" card with count-up stats
- Two progress rings (Tasks completion, Today attendance) with gradient strokes

### Step 3 — Apply design-system `index.js` update

Replace `src/design-system/index.js` with the one in this zip. The only addition is the new `icons` export:

```diff
  export { default as GradientText } from './components/GradientText';
+ export * as Icon from './icons';
```

Also add the new `src/design-system/icons.js` file.

### Step 4 — Run and verify

```bash
cd client
npm start
```

Expected:
- ✅ Login still works (auth untouched)
- ✅ Post-login, you see the new topbar + sidebar with dark glass aesthetic
- ✅ Calendar home shows the new greeting, week grid, and bottom row with progress rings
- ✅ Clicking events opens their respective module pages
- ✅ Clicking a day cell zooms into daily view
- ✅ Other pages (Tasks, Messages, etc.) still render inside the new shell — they'll look old for now (their own styling unchanged), which is expected

---

## Known non-issues (expected appearance)

Other pages besides Calendar will look "mixed" — the new topbar + sidebar + dark canvas, but inside that, page content uses its old (light-mode-ish) styling. This is **intentional** and will be fixed in Phase E (Sessions 18–23) when each remaining module is restyled.

If any page is completely broken (white text on white bg, elements overflowing), note it and we can address in next session.

---

## Build verification

```
Compiled successfully.
File sizes after gzip:
  275.99 kB   build/static/js/main.*.js
  19.5 kB     build/static/css/main.*.css
```

No warnings, no errors.

---

## What's in Session 4+ (next)

**Session 4 — Backend security fixes.** These are surgical patches to existing `server/routes/*.js` files. No frontend changes needed. Expected items:

- Mask OTP codes on Security Panel
- Private-task access check on `GET /tasks/:id`
- Member check middleware for workspace routes
- Power check on notification send
- Creator/power check on meeting edit/delete
- Regex-escape in search routes
- Remove MASTER_SECRET default fallback
- Fix activation code expiry parsing
- Force-logout protection for main_admin

**Session 5 — Frontend security hardening.** DOMPurify for email HTML, force-logout socket handler, destructive action confirmations.

When you're ready, come back and say "next batch" — I'll deliver Sessions 4+5 together (they're safe to batch, all security work).
