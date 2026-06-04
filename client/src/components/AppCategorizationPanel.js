import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

// Admin tool for labelling apps as productive / neutral / unproductive.
// Lives inside MonitoringSettings. Shows all known apps in a scrollable list
// grouped by category, plus a filter for uncategorized at the top.

const CATS = [
  { key: 'productive',   label: 'Productive',   color: 'var(--emerald)' },
  { key: 'neutral',      label: 'Neutral',      color: 'var(--ink-3)'   },
  { key: 'unproductive', label: 'Unproductive', color: 'var(--danger)'  },
  { key: 'uncategorized',label: 'Uncategorized',color: 'var(--ink-4)'   }
];

export default function AppCategorizationPanel() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('uncategorized');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState({}); // { app: newCategory | null (clear override) }
  const [busy, setBusy] = useState(false);
  const [teams, setTeams] = useState([]);
  const [scope, setScope] = useState('global'); // 'global' | teamId

  useEffect(() => {
    api.get('/teams').then(r => setTeams(r.data || [])).catch(() => setTeams([]));
  }, []);

  const load = async () => {
    try {
      const path = scope === 'global' ? '/usage/categories' : `/usage/categories/team/${scope}`;
      const { data } = await api.get(path);
      // Normalize shape: global → [{app, category}], team → [{app, globalCategory, effectiveCategory, override}]
      const norm = (data || []).map(it => scope === 'global'
        ? { app: it.app, category: it.category, override: null, globalCategory: it.category }
        : { app: it.app, category: it.effectiveCategory, globalCategory: it.globalCategory, override: it.override });
      setItems(norm);
      setPending({});
    } catch {}
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);

  const filtered = useMemo(() => {
    let xs = items;
    if (filter !== 'all') xs = xs.filter(x => (pending[x.app] || x.category) === filter);
    if (query) xs = xs.filter(x => x.app.includes(query.toLowerCase()));
    return xs.slice(0, 200);
  }, [items, filter, query, pending]);

  const counts = useMemo(() => {
    const c = { all: items.length, productive: 0, neutral: 0, unproductive: 0, uncategorized: 0 };
    items.forEach(i => { c[pending[i.app] || i.category] = (c[pending[i.app] || i.category] || 0) + 1; });
    return c;
  }, [items, pending]);

  const setLocal = (app, category) => setPending(p => ({ ...p, [app]: category }));
  const clearOverride = (app) => setPending(p => ({ ...p, [app]: null })); // team scope only

  const save = async () => {
    const updates = Object.entries(pending).map(([app, category]) => ({ app, category }));
    if (updates.length === 0) return;
    setBusy(true);
    try {
      if (scope === 'global') {
        // Strip nulls — global scope can't have "clear" semantics
        const real = updates.filter(u => u.category !== null);
        if (real.length) await api.put('/usage/categories', { updates: real });
      } else {
        await api.put(`/usage/categories/team/${scope}`, { updates });
      }
      setPending({});
      await load();
    } catch {}
    finally { setBusy(false); }
  };

  return (
    <div>
      {/* Scope selector — global vs per-team */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px', background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Scope</span>
        <select value={scope} onChange={e => setScope(e.target.value)}
          style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 12 }}>
          <option value="global">🌐 Company-wide (global)</option>
          {teams.map(t => <option key={t._id} value={t._id}>👥 {t.name}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>
          {scope === 'global'
            ? 'Default category for everyone'
            : `Overrides global for ${teams.find(t => t._id === scope)?.name || 'this team'}`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['all','All',counts.all], ...CATS.map(c => [c.key, c.label, counts[c.key] || 0])].map(([k, l, n]) => {
            const active = filter === k;
            const color = CATS.find(c => c.key === k)?.color || 'var(--ink-2)';
            return (
              <button key={k} onClick={() => setFilter(k)}
                style={{
                  padding: '5px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                  background: active ? 'var(--glass-2)' : 'transparent',
                  color: active ? color : 'var(--ink-3)',
                  border: `1px solid ${active ? color : 'var(--line-2)'}`,
                  cursor: 'pointer'
                }}>
                {l} <span style={{ opacity: 0.7, marginLeft: 4 }}>{n}</span>
              </button>
            );
          })}
        </div>
        <input type="text" placeholder="Search app…" value={query} onChange={e => setQuery(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 12, minWidth: 160 }} />
      </div>

      <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10, maxHeight: 340, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
            {filter === 'uncategorized' ? 'No uncategorized apps — everything is labelled.' : 'No apps match this filter.'}
          </div>
        ) : (
          filtered.map(it => {
            const pendingVal = pending[it.app];
            const current = pendingVal !== undefined ? pendingVal : it.category;
            const changed = pendingVal !== undefined;
            const inTeamScope = scope !== 'global';
            const hasOverride = inTeamScope && (changed ? pendingVal !== null : !!it.override);
            return (
              <div key={it.app} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-2)',
                background: changed ? 'rgba(99,102,241,0.06)' : 'transparent'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: changed ? 700 : 500, color: changed ? 'var(--ink)' : 'var(--ink-2)' }}>
                    {it.app}
                    {hasOverride && (
                      <span style={{ marginLeft: 6, padding: '1px 5px', fontSize: 9, fontWeight: 700, borderRadius: 3, background: 'rgba(99,102,241,0.20)', color: 'var(--indigo)' }}>OVERRIDE</span>
                    )}
                  </div>
                  {inTeamScope && (
                    <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 1 }}>
                      Global: <span style={{ color: CATS.find(c => c.key === it.globalCategory)?.color || 'var(--ink-4)' }}>{it.globalCategory}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {CATS.filter(c => c.key !== 'uncategorized').map(c => (
                    <button key={c.key} onClick={() => setLocal(it.app, c.key)}
                      style={{
                        padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                        background: current === c.key ? c.color : 'transparent',
                        color: current === c.key ? '#fff' : c.color,
                        border: `1px solid ${c.color}55`,
                        cursor: 'pointer'
                      }}>
                      {c.label[0]}
                    </button>
                  ))}
                  {inTeamScope && hasOverride && (
                    <button onClick={() => clearOverride(it.app)}
                      title="Clear override — use global category"
                      style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'transparent', color: 'var(--ink-3)', border: '1px solid var(--line-2)', cursor: 'pointer' }}>
                      ↺
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {Object.keys(pending).length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{Object.keys(pending).length} pending changes</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPending({})}
              style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Reset
            </button>
            <button onClick={save} disabled={busy}
              style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--indigo)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
