# Niyoq Design System

Locked visual system for the Niyoq app. Extracted from the approved mockups (Calendar / Tasks / Messages) and ready to use across the application.

**All tokens and components are prefixed with `ad-` so they won't collide with your existing CSS.**

---

## Quick start

### 1. Import once at the app root

In `src/App.js` (or `src/index.js`):

```js
import './design-system/index.css';  // tokens, animations, base styles, all components

// Add the ambient background at the top of your app tree
import { AmbientBackground } from './design-system';

function App() {
  return (
    <>
      <AmbientBackground />
      {/* your existing app */}
    </>
  );
}
```

And in `src/index.js`, add the theme class to the body:

```js
document.body.classList.add('ad-theme');
```

This applies the dark canvas gradient globally.

### 2. Import components per screen

```js
import { GlassPanel, PrimaryButton, Avatar, LiveDot, FilterPill, SegmentedControl, SearchBar, GradientText, IconButton } from '../design-system';
```

---

## Components

### `<AmbientBackground />`

The 3 drifting gradient orbs. Mount once at the app root.

```jsx
<AmbientBackground />                              // default
<AmbientBackground intensity="quiet" />            // dimmer for content-heavy pages
<AmbientBackground suppressed />                   // renders nothing (login, print, etc.)
```

### `<GlassPanel>`

Base glass surface used everywhere. Use instead of plain `<div>` when you want the glassmorphism.

```jsx
<GlassPanel elevated style={{ padding: 20 }}>
  Content
</GlassPanel>

<GlassPanel variant="strong" as="header">  {/* for topbars, modals */}
  ...
</GlassPanel>

<GlassPanel glowing>  {/* indigo glow — featured panels */}
  ...
</GlassPanel>
```

**Props:** `variant` (`"default"` | `"strong"`), `elevated`, `glowing`, `as` (element/component), plus any HTML props.

### `<IconButton>`

36x36 square icon button. Always pass a `title` for accessibility.

```jsx
<IconButton title="Notifications" badge="4" onClick={openNotifs}>
  <Bell size={16} />
</IconButton>

<IconButton size="sm" variant="ghost" title="Close">
  <X size={14} />
</IconButton>

<IconButton variant="primary" title="Generate with AI">
  <Sparkles size={16} />
</IconButton>
```

**Props:** `size` (`sm`/`default`/`lg`), `variant` (`default`/`ghost`/`primary`), `badge`, `title` (required), `children`, plus any button props.

### `<PrimaryButton>`

The hero gradient CTA.

```jsx
<PrimaryButton icon={<Plus size={16} />} onClick={create}>
  New task
</PrimaryButton>

<PrimaryButton variant="ai" icon={<Sparkles size={14} />}>
  Summarize thread
</PrimaryButton>

<PrimaryButton variant="danger" loading={saving} onClick={handleDelete}>
  Delete
</PrimaryButton>

<PrimaryButton glowOrbit>  {/* rotating conic halo for hero CTAs */}
  Get started
</PrimaryButton>
```

**Props:** `variant` (`primary`/`ai`/`danger`/`success`), `size`, `loading`, `icon`, `trailingIcon`, `glowOrbit`, plus any button props.

### `<Avatar>` and `<AvatarCluster>`

Avatar with optional status dot. Background auto-hashes from name, so same person gets same color everywhere.

```jsx
<Avatar name="Priya Mehta" status="online" />
<Avatar name="Ravi K" size="sm" />
<Avatar name="Aisha S" size="lg" status="away" />
<Avatar name="Meera V" src="/uploads/avatar.jpg" />  // image overrides gradient

<AvatarCluster names={['Priya M', 'Ravi K', 'Aisha S', 'Meera V', 'Arjun V']} max={3} />
// Shows 3 avatars + "+2" overflow pill
```

**Avatar Props:** `name`, `src`, `size` (`xs`/`sm`/`default`/`lg`), `status` (`online`/`away`/`offline`), `gradient` (number 0-4 or CSS string — optional, otherwise auto-hashed).

### `<SegmentedControl>`

View switcher with animated active state.

```jsx
<SegmentedControl
  value={view}
  onChange={setView}
  options={[
    { key: 'day',   label: 'Day' },
    { key: 'week',  label: 'Week' },
    { key: 'month', label: 'Month' },
  ]}
/>

<SegmentedControl
  value={mode}
  onChange={setMode}
  size="sm"
  options={[
    { key: 'list',  label: 'List',  icon: <List size={12} /> },
    { key: 'board', label: 'Board', icon: <Columns size={12} /> },
  ]}
/>
```

### `<FilterPill>`

Filter tab with count.

```jsx
<FilterPill active={tab === 'all'} count={47} onClick={() => setTab('all')}>All</FilterPill>
<FilterPill active={tab === 'mine'} count={12}>Mine</FilterPill>
<FilterPill variant="warn" active={tab === 'overdue'} count={3}>Overdue</FilterPill>
```

**Props:** `active`, `count`, `variant` (`default`/`warn`), `icon`, `onClick`, `children`.

### `<SearchBar>`

Topbar search with ⌘K / Ctrl+K global shortcut.

```jsx
<SearchBar
  value={query}
  onChange={setQuery}
  onEnter={runSearch}
  onShortcut={() => openPalette()}
  placeholder="Search people, tasks, messages…"
/>
```

The ⌘K / Ctrl+K listener is registered globally on mount and auto-focuses the input. The kbd label auto-detects Mac vs other.

### `<LiveDot>`

Pulsing status dot.

```jsx
<LiveDot />                                         // green, pulsing
<LiveDot color="amber" />                           // amber, pulsing
<LiveDot color="rose" pulsing={false} />            // static
<LiveDot size="sm" />                               // smaller
```

### `<GradientText>`

Animated shimmer gradient text.

```jsx
<h1>Hi <GradientText>Ravi</GradientText> 👋</h1>
<p>Due <GradientText variant="warn">Today!</GradientText></p>
```

---

## Design tokens (CSS variables)

All tokens are available as CSS variables after importing `index.css`. Prefixed with `--ad-` to avoid collisions.

Key ones:

```css
/* Colors */
--ad-bg-0, --ad-bg-1, --ad-ink, --ad-ink-2, --ad-ink-3, --ad-ink-4
--ad-glass, --ad-glass-2, --ad-glass-hover, --ad-line, --ad-line-2

/* Accent */
--ad-indigo, --ad-violet, --ad-emerald, --ad-cyan, --ad-amber, --ad-gold, --ad-rose, --ad-danger

/* Gradients */
--ad-grad-primary, --ad-grad-success, --ad-grad-warn, --ad-grad-danger, --ad-grad-activity, --ad-grad-ai

/* Shadows */
--ad-shadow-soft, --ad-shadow-lift, --ad-shadow-drawer
--ad-glow-indigo, --ad-glow-violet, --ad-glow-primary, --ad-glow-danger, --ad-glow-emerald

/* Radius */
--ad-r-pill, --ad-r-xs, --ad-r-sm, --ad-r-md, --ad-r-btn, --ad-r-chip, --ad-r-card, --ad-r-panel

/* Spacing */
--ad-sp-1, --ad-sp-2, --ad-sp-3, --ad-sp-4, --ad-sp-5, --ad-sp-6, --ad-sp-8, --ad-sp-10, --ad-sp-12

/* Typography */
--ad-font-sans, --ad-font-mono
--ad-fs-10, --ad-fs-11, --ad-fs-12, --ad-fs-13, --ad-fs-14, --ad-fs-15, --ad-fs-18, --ad-fs-24, --ad-fs-28, --ad-fs-36, --ad-fs-48
--ad-ls-tight, --ad-ls-tighter, --ad-ls-display, --ad-ls-wide, --ad-ls-wider

/* Motion */
--ad-ease, --ad-dur-fast, --ad-dur, --ad-dur-slow, --ad-dur-enter
```

### Utility classes

```css
.ad-theme         /* apply to body for canvas gradient */
.ad-enter         /* fade-up entrance animation (add inline delay with style) */
.ad-grad-text     /* animated shimmer gradient text fill */
.ad-grad-text-warn
.ad-label         /* small uppercase section labels */
.ad-tnum          /* tabular-nums */
.ad-focus         /* accessible focus ring */
.ad-reset-btn     /* remove default button chrome */
```

---

## Animation keyframes (reusable)

All prefixed `ad-` to avoid collisions. Available to any CSS in the app:

- `ad-drift` — ambient orb movement (22-34s)
- `ad-shimmer` — text gradient wash (4-6s)
- `ad-enter-up` — page/card entrance (0.6s)
- `ad-live-emerald` / `ad-live-amber` / `ad-live-rose` / `ad-live-indigo` — status pulse
- `ad-badge-pulse` — notification badge ring
- `ad-sweep` — light sweep (announcements)
- `ad-spin-border` — conic-gradient rotation (requires `@property --ad-angle`)
- `ad-breathe` — drop-shadow pulse
- `ad-top-glow` — TOP priority red pulse
- `ad-mention-glow` — @mention breathing
- `ad-bop` — typing indicator bounce
- `ad-pulse-col` — kanban drop-target pulse
- `ad-wave` — emoji wave
- `ad-sp1/2/3` — AI sparkle particles
- `ad-spin` — generic rotation
- `ad-stat-enter` — stat card entrance
- `ad-card-shimmer` — card hover sweep

All respect `prefers-reduced-motion: reduce`.

---

## Staggered page entrances

To get the "cards fade up in sequence" feel from the mockups, add `ad-enter` class to each card with a stagger delay:

```jsx
<section className="ad-enter" style={{ animationDelay: '40ms' }}>First</section>
<section className="ad-enter" style={{ animationDelay: '80ms' }}>Second</section>
<section className="ad-enter" style={{ animationDelay: '120ms' }}>Third</section>
```

Base delay: 40ms, then +40ms per index.

---

## When to NOT use the design system

- **Third-party libs** that have their own styling (TipTap menus, some date pickers) — let them look how they look.
- **Mobile-specific components** once added — may need their own look-and-feel.

---

## Extending

New components go in `design-system/components/<Name>.{js,css}` and get added to:
1. `design-system/index.js` (barrel export)
2. `design-system/index.css` (stylesheet import)
3. This README under "Components"

Keep all new tokens in `tokens.css`. Keep all new keyframes in `animations.css`. That way styling stays centralized.
