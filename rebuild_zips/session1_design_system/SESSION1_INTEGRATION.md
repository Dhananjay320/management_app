# Session 1 — Integration Guide

**Status: ✅ Build-verified against React 19 + react-scripts 5.**

## What's in this zip

```
src/
├── design-system/          ← NEW folder — copy entire thing
└── App.js, index.js        ← MODIFIED — 2 tiny changes each (see below)
```

## Integration — 3 steps

### 1. Copy `src/design-system/` into your real client

Nothing conflicts — it's a fresh folder.

### 2. App.js — add 2 imports + 1 JSX line

**Add these imports** (after `SocketProvider` import, before `./App.css`):

```js
import { AmbientBackground } from './design-system';
import './design-system/index.css';
```

**Add `<AmbientBackground />`** just before `<Routes>`:

```js
<SocketProvider>
  <AmbientBackground />      {/* ← add this line */}
  <Routes>
```

### 3. index.js — add body class

After imports, before `ReactDOM.createRoot(...)`:

```js
if (typeof document !== 'undefined') {
  document.body.classList.add('ad-theme');
}
```

Or just replace your `App.js` and `index.js` with the ones in this zip — they're identical to your originals except for these additions.

## Run it

```bash
cd client && npm start
```

You should see: dark navy canvas, 3 drifting gradient orbs, subtle noise overlay, Inter font loaded. Existing pages still work; they'll look old until Session 2+ restyles them module-by-module.

## Component usage — see `src/design-system/README.md` for full docs.

Quick taste:
```jsx
import { PrimaryButton, GlassPanel, Avatar, FilterPill, LiveDot, GradientText } from './design-system';

<PrimaryButton icon={<Plus size={16}/>}>New task</PrimaryButton>
<PrimaryButton variant="ai">Summarize with AI</PrimaryButton>
<GlassPanel elevated>...</GlassPanel>
<Avatar name="Priya M" status="online" />
<FilterPill active count={47}>All</FilterPill>
<h1>Hi <GradientText>Ravi</GradientText> 👋</h1>
```

## What's next — Session 2

Restyles the app shell (topbar + sidebar in `AppLayout.js`) to match the mockups. Prompt for next session:

> Read `IMPLEMENTATION_PLAN.md`. Run Session 2 — Restyle `AppLayout.js` topbar + sidebar per the locked design system. Use components from `src/design-system`. Keep all routing / auth logic intact.

Upload:
- This zip (already integrated into your client)
- Your latest `client.zip`
- `IMPLEMENTATION_PLAN.md`
- `DESIGN_SYSTEM.md`
- `designs/01-calendar.html` (reference for topbar + sidebar look)
