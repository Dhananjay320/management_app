import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Avatar, Icon } from '../design-system';
import './CommandPalette.css';

/**
 * CommandPalette — the global ⌘K search overlay.
 *
 * Session 15 (C10). Gives users a fast keyboard-driven way to jump to any
 * task, meeting, message, person, workspace doc, email, or sticky note.
 *
 * Design:
 *   • Modal overlay centered in viewport
 *   • Instant search with 180 ms debounce
 *   • Arrow keys to navigate, Enter to select, Escape to close
 *   • Groups results by scope (Tasks, Meetings, People, etc.)
 *   • Remembers up to 8 recent selections in localStorage
 *   • Shows recent selections + quick-jumps when the query is empty
 *
 * Mount ONCE near the root of the app. Opens when user presses ⌘K / Ctrl+K
 * anywhere except inside an editable field.
 */

const RECENT_KEY = 'ad.cmdk.recent';
const RECENT_MAX = 8;
const DEBOUNCE_MS = 180;

const SCOPE_LABELS = {
  tasks: 'Tasks',
  meetings: 'Meetings',
  messages: 'Messages',
  workspace: 'Workspace',
  email: 'Email',
  stickynotes: 'Sticky Notes',
  people: 'People',
};

const SCOPE_ICONS = {
  tasks: Icon.CheckCircle,
  meetings: Icon.Users,
  messages: Icon.MessageSquare,
  workspace: Icon.Folder,
  email: Icon.Mail,
  stickynotes: Icon.StickyIcon,
  people: Icon.UserIcon,
};

// Platform detection — Mac shows ⌘ symbols, everyone else shows text labels.
// `navigator.platform` is deprecated but still widely supported; we fall
// back to userAgent for future-proofing.
const IS_MAC = typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

const K_MOD   = IS_MAC ? '⌘'   : 'Ctrl';
const K_ENTER = IS_MAC ? '↵'   : 'Enter';
const K_ESC   = 'Esc';
const K_NAV   = '↑↓';

// How to navigate when a result is picked.
function pathForResult(scope, item) {
  switch (scope) {
    case 'tasks':       return `/tasks?highlight=${item.id}`;
    case 'meetings':    return `/meetings?highlight=${item.id}`;
    case 'messages':    return `/messages?highlight=${item.id}`;
    case 'workspace':   return `/workspace?doc=${item.id}`;
    case 'email':       return `/email?highlight=${item.id}`;
    case 'stickynotes': return `/sticky-notes?highlight=${item.id}`;
    case 'people':      return `/admin/users/${item.id}`;  // falls back to profile view if not admin
    default:            return null;
  }
}

const QUICK_JUMPS = [
  { label: 'Home',          path: '/' },
  { label: 'Tasks',         path: '/tasks' },
  { label: 'Messages',      path: '/messages' },
  { label: 'Meetings',      path: '/meetings' },
  { label: 'Email',         path: '/email' },
  { label: 'Workspace',     path: '/workspace' },
  { label: 'Sticky Notes',  path: '/sticky-notes' },
  { label: 'Notifications', path: '/notifications' },
  { label: 'Settings',      path: '/settings' },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState(() => loadRecent());
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // ── Open/close on keyboard or custom event ─────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    // Allow other parts of the app to open the palette without knowing
    // the keyboard shortcut: `window.dispatchEvent(new CustomEvent('cmdk:open'))`.
    const onCustomOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('cmdk:open', onCustomOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('cmdk:open', onCustomOpen);
    };
  }, [open]);

  // ── Focus input when palette opens ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setQ('');
    setGroups([]);
    setCursor(0);
    // Focus on next tick so the transition doesn't eat it
    const id = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(id);
  }, [open]);

  // ── Debounced search ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) { setGroups([]); setLoading(false); return; }

    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const handle = setTimeout(async () => {
      try {
        const { data } = await api.get('/search/global', {
          params: { q: query, limit: 5 },
          signal: controller.signal,
        });
        setGroups(data.groups || []);
        setCursor(0);
      } catch (err) {
        if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
          console.error('[cmdk] search failed', err);
          setGroups([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => { clearTimeout(handle); controller.abort(); };
  }, [q, open]);

  // ── Flat list of picks for arrow-key nav ───────────────────────────────
  const flatPicks = useMemo(() => {
    if (!q.trim()) {
      // Empty query: show recents first, then quick jumps
      return [
        ...recent.map(r => ({ kind: 'recent', ...r })),
        ...QUICK_JUMPS.map(j => ({ kind: 'jump', label: j.label, path: j.path })),
      ];
    }
    const picks = [];
    for (const g of groups) {
      for (const item of g.items) {
        picks.push({ kind: 'result', scope: g.key, item });
      }
    }
    return picks;
  }, [q, recent, groups]);

  // Clamp cursor within picks
  useEffect(() => {
    if (cursor >= flatPicks.length) setCursor(Math.max(0, flatPicks.length - 1));
  }, [flatPicks.length, cursor]);

  // ── Select handler ──────────────────────────────────────────────────────
  const pickAt = useCallback((idx) => {
    const p = flatPicks[idx];
    if (!p) return;
    let path;
    if (p.kind === 'jump' || p.kind === 'recent') {
      path = p.path;
      // Recent item already has scope+title baked in, just navigate
    } else if (p.kind === 'result') {
      path = pathForResult(p.scope, p.item);
      if (path) {
        // Save to recents
        const entry = {
          scope: p.scope,
          title: p.item.title,
          subtitle: p.item.subtitle || '',
          path,
          ts: Date.now(),
        };
        setRecent(prev => {
          const next = [entry, ...prev.filter(r => r.path !== path)].slice(0, RECENT_MAX);
          saveRecent(next);
          return next;
        });
      }
    }
    if (path) {
      setOpen(false);
      navigate(path);
    }
  }, [flatPicks, navigate]);

  // ── Keyboard nav inside the palette ─────────────────────────────────────
  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(flatPicks.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickAt(cursor);
    }
  };

  const clearRecent = () => { setRecent([]); saveRecent([]); };

  if (!open) return null;

  return (
    <div className="ad-cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="ad-cmdk__backdrop" onClick={() => setOpen(false)} />
      <div className="ad-cmdk__panel">
        <div className="ad-cmdk__searchrow">
          <div className="ad-cmdk__searchicon"><Icon.Search size={16} /></div>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search tasks, people, meetings, files…"
            className="ad-cmdk__input"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="ad-cmdk__kbd">{K_ESC}</kbd>
        </div>

        <div className="ad-cmdk__results" role="listbox">
          {/* Empty query: recents + quick jumps */}
          {q.trim().length < 2 && (
            <>
              {recent.length > 0 && (
                <Group
                  label="Recent"
                  action={<button type="button" className="ad-cmdk__grouplink" onClick={clearRecent}>Clear</button>}
                >
                  {recent.map((r, i) => (
                    <PickRow
                      key={`rec-${i}`}
                      active={cursor === i}
                      icon={<Icon.Clock size={14} />}
                      title={r.title}
                      subtitle={`${SCOPE_LABELS[r.scope] || 'Result'} · ${r.subtitle}`}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => pickAt(i)}
                    />
                  ))}
                </Group>
              )}
              <Group label="Jump to">
                {QUICK_JUMPS.map((j, i) => {
                  const idx = recent.length + i;
                  return (
                    <PickRow
                      key={`jump-${i}`}
                      active={cursor === idx}
                      icon={<Icon.ChevronRight size={14} />}
                      title={j.label}
                      subtitle={j.path}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => pickAt(idx)}
                    />
                  );
                })}
              </Group>
            </>
          )}

          {/* Query present */}
          {q.trim().length >= 2 && (
            <>
              {loading && flatPicks.length === 0 && (
                <div className="ad-cmdk__empty">Searching…</div>
              )}
              {!loading && flatPicks.length === 0 && (
                <div className="ad-cmdk__empty">No results for "{q.trim()}".</div>
              )}
              {groups.map((g, gi) => {
                // Compute the cursor offset for this group
                const offset = groups.slice(0, gi).reduce((sum, x) => sum + x.items.length, 0);
                const IconEl = SCOPE_ICONS[g.key] || Icon.Search;
                return (
                  <Group key={g.key} label={SCOPE_LABELS[g.key] || g.key}>
                    {g.items.map((item, i) => {
                      const idx = offset + i;
                      return (
                        <PickRow
                          key={`${g.key}-${item.id}`}
                          active={cursor === idx}
                          icon={g.key === 'people' && item.avatar
                            ? <Avatar name={item.title} src={item.avatar} size="xs" />
                            : g.key === 'people'
                              ? <Avatar name={item.title} size="xs" />
                              : <IconEl size={14} />}
                          title={item.title}
                          subtitle={item.subtitle}
                          onMouseEnter={() => setCursor(idx)}
                          onClick={() => pickAt(idx)}
                        />
                      );
                    })}
                  </Group>
                );
              })}
            </>
          )}
        </div>

        <footer className="ad-cmdk__footer">
          <span><kbd className="ad-cmdk__kbd">{K_NAV}</kbd> navigate</span>
          <span><kbd className="ad-cmdk__kbd">{K_ENTER}</kbd> select</span>
          <span><kbd className="ad-cmdk__kbd">{K_ESC}</kbd> close</span>
          <span className="ad-cmdk__footer-spacer" />
          <span className="ad-cmdk__footer-hint">
            <kbd className="ad-cmdk__kbd">{K_MOD}</kbd>
            <kbd className="ad-cmdk__kbd">K</kbd>
            to toggle
          </span>
        </footer>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function Group({ label, action, children }) {
  return (
    <div className="ad-cmdk__group">
      <div className="ad-cmdk__grouphead">
        <span className="ad-cmdk__grouplabel">{label}</span>
        {action}
      </div>
      <div className="ad-cmdk__grouplist">{children}</div>
    </div>
  );
}

function PickRow({ active, icon, title, subtitle, onClick, onMouseEnter }) {
  return (
    <button
      type="button"
      className={`ad-cmdk__row ${active ? 'ad-cmdk__row--active' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role="option"
      aria-selected={active}
    >
      <span className="ad-cmdk__rowicon">{icon}</span>
      <span className="ad-cmdk__rowbody">
        <span className="ad-cmdk__rowtitle">{title}</span>
        {subtitle && <span className="ad-cmdk__rowsub">{subtitle}</span>}
      </span>
      {active && <span className="ad-cmdk__rowret" aria-hidden="true">↵</span>}
    </button>
  );
}

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
}
