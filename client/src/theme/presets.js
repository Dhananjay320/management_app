// Hand-tuned palettes. Each preset fills the same set of zones so users get a
// coherent look. Custom user overrides (windowBg / sidebarBg / topbarBg /
// cardBg / accent / ink) take precedence over preset values when set.
//
// CSS vars driven by these:
//   --bg-0      window background (main canvas)
//   --bg-1      sidebar / lifted surfaces
//   --bg-2      cards
//   --indigo    accent (buttons, links, active states)
//   --topbar-bg topbar background
//   --ink       primary text color (light themes use a dark ink)

export const PRESETS = {
  // ─── Dark presets ───
  indigo:  { label: 'Indigo (default)', mode: 'dark',  windowBg: '#0B0F19', sidebarBg: '#131826', topbarBg: '#131826', cardBg: '#1A2030', accent: '#6366F1', ink: '#F1F5F9' },
  ocean:   { label: 'Ocean',            mode: 'dark',  windowBg: '#0A1628', sidebarBg: '#0E2540', topbarBg: '#0E2540', cardBg: '#143356', accent: '#06B6D4', ink: '#F1F5F9' },
  forest:  { label: 'Forest',           mode: 'dark',  windowBg: '#0B1410', sidebarBg: '#13241C', topbarBg: '#13241C', cardBg: '#1B3328', accent: '#10B981', ink: '#F1F5F9' },
  sunset:  { label: 'Sunset',           mode: 'dark',  windowBg: '#1A0F14', sidebarBg: '#2A1820', topbarBg: '#2A1820', cardBg: '#3A2230', accent: '#F97316', ink: '#F1F5F9' },
  mono:    { label: 'Mono',             mode: 'dark',  windowBg: '#0E0E10', sidebarBg: '#17171A', topbarBg: '#17171A', cardBg: '#202024', accent: '#94A3B8', ink: '#F1F5F9' },
  rose:    { label: 'Rose',             mode: 'dark',  windowBg: '#180B14', sidebarBg: '#241420', topbarBg: '#241420', cardBg: '#321C2C', accent: '#EC4899', ink: '#F1F5F9' },

  // ─── Light presets ───
  snow:    { label: 'Snow (light)',     mode: 'light', windowBg: '#F8FAFC', sidebarBg: '#FFFFFF', topbarBg: '#FFFFFF', cardBg: '#FFFFFF', accent: '#6366F1', ink: '#1E293B' },
  cream:   { label: 'Cream (light)',    mode: 'light', windowBg: '#FAF7F2', sidebarBg: '#FFFDF8', topbarBg: '#FFFDF8', cardBg: '#FFFDF8', accent: '#D97706', ink: '#3F2E1A' },
  sky:     { label: 'Sky (light)',      mode: 'light', windowBg: '#EFF6FF', sidebarBg: '#FFFFFF', topbarBg: '#FFFFFF', cardBg: '#FFFFFF', accent: '#0284C7', ink: '#0F172A' },
  sage:    { label: 'Sage (light)',     mode: 'light', windowBg: '#F1F5F0', sidebarBg: '#FFFFFF', topbarBg: '#FFFFFF', cardBg: '#FFFFFF', accent: '#059669', ink: '#1F2937' }
};

// Relative luminance for a #RRGGBB color (0=black, 1=white)
function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return 0.5;
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function resolveTheme(theme) {
  const preset = PRESETS[theme?.preset] || PRESETS.indigo;
  const windowBg  = theme?.windowBg  || preset.windowBg;
  const sidebarBg = theme?.sidebarBg || preset.sidebarBg;
  const topbarBg  = theme?.topbarBg  || preset.topbarBg;
  const cardBg    = theme?.cardBg    || preset.cardBg;

  // Auto-derive effective mode from the window background.
  // This keeps text legible when a user picks a light/dark color manually.
  const effectiveMode = luminance(windowBg) > 0.55 ? 'light' : 'dark';

  // Ink: explicit > preset.ink (only if mode-matches) > sensible default
  let ink = theme?.ink;
  if (!ink) {
    const presetMatches = preset.mode === effectiveMode;
    ink = presetMatches ? preset.ink : (effectiveMode === 'light' ? '#1E293B' : '#F1F5F9');
  }

  return {
    windowBg, sidebarBg, topbarBg, cardBg, ink,
    accent:          theme?.accent          || preset.accent,
    backgroundImage: theme?.backgroundImage || '',
    mode:            effectiveMode
  };
}

export function applyTheme(theme) {
  const r = resolveTheme(theme);
  const root = document.documentElement;
  root.style.setProperty('--bg-0', r.windowBg);
  root.style.setProperty('--bg-1', r.sidebarBg);
  root.style.setProperty('--bg-2', r.cardBg);
  root.style.setProperty('--topbar-bg', r.topbarBg);
  root.style.setProperty('--sidebar-bg', r.sidebarBg);
  root.style.setProperty('--indigo', r.accent);
  root.style.setProperty('--indigo-deep', shade(r.accent, -10));

  // Primary ink (text on window background) + alpha ramps
  root.style.setProperty('--ink', r.ink);
  const inkRgb = hexToRgb(r.ink) || { r: 241, g: 245, b: 249 };
  root.style.setProperty('--ink-2', `rgba(${inkRgb.r},${inkRgb.g},${inkRgb.b},0.74)`);
  root.style.setProperty('--ink-3', `rgba(${inkRgb.r},${inkRgb.g},${inkRgb.b},0.50)`);
  root.style.setProperty('--ink-4', `rgba(${inkRgb.r},${inkRgb.g},${inkRgb.b},0.28)`);

  // Per-zone ink — sidebar/topbar can have a different bg luminance than window,
  // so their text needs its own color to stay legible.
  const sidebarInk = luminance(r.sidebarBg) > 0.55 ? '#1E293B' : '#F1F5F9';
  const topbarInk  = luminance(r.topbarBg)  > 0.55 ? '#1E293B' : '#F1F5F9';
  const sIRgb = hexToRgb(sidebarInk);
  const tIRgb = hexToRgb(topbarInk);
  root.style.setProperty('--sidebar-ink',   sidebarInk);
  root.style.setProperty('--sidebar-ink-2', `rgba(${sIRgb.r},${sIRgb.g},${sIRgb.b},0.74)`);
  root.style.setProperty('--sidebar-ink-3', `rgba(${sIRgb.r},${sIRgb.g},${sIRgb.b},0.50)`);
  root.style.setProperty('--topbar-ink',    topbarInk);
  root.style.setProperty('--topbar-ink-2',  `rgba(${tIRgb.r},${tIRgb.g},${tIRgb.b},0.74)`);

  // Light mode needs darker hairlines so borders remain visible
  if (r.mode === 'light') {
    root.style.setProperty('--line',  'rgba(15,23,42,0.10)');
    root.style.setProperty('--line-2','rgba(15,23,42,0.16)');
    root.style.setProperty('--glass', 'rgba(15,23,42,0.03)');
    root.style.setProperty('--glass-2','rgba(15,23,42,0.06)');
    root.style.setProperty('--glass-3','rgba(15,23,42,0.10)');
    root.classList.add('theme-light');
  } else {
    root.style.setProperty('--line',  'rgba(255,255,255,0.07)');
    root.style.setProperty('--line-2','rgba(255,255,255,0.14)');
    root.style.setProperty('--glass', 'rgba(255,255,255,0.04)');
    root.style.setProperty('--glass-2','rgba(255,255,255,0.07)');
    root.style.setProperty('--glass-3','rgba(255,255,255,0.11)');
    root.classList.remove('theme-light');
  }

  // Background image — applied to body via a CSS var, with a tinted overlay
  // so foreground UI stays readable.
  if (r.backgroundImage) {
    root.style.setProperty('--bg-image', `url("${r.backgroundImage}")`);
    root.classList.add('theme-has-bg-image');
  } else {
    root.style.removeProperty('--bg-image');
    root.classList.remove('theme-has-bg-image');
  }
}

function hexToRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function shade(hex, amt) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const k = amt / 100;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * k)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * k)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * k)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
