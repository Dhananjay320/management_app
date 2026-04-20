import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  GlassPanel, PrimaryButton, IconButton, Avatar, GradientText, Icon,
} from '../../design-system';
import './PowersEditor.css';

/**
 * PowersEditor — the admin UI for granular powers + admin title + scope.
 *
 * Session 10: this is the UI the audit (C4) flagged as missing. Lets a
 * main_admin (or anyone with users.editPowers) toggle individual power
 * flags on another user, grouped by module, with an optional admin title
 * and team-scoping.
 *
 * Mount at `/admin/users/:id/powers`.
 */
export default function PowersEditor() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const navigate = useNavigate();

  const [target, setTarget] = useState(null);
  const [groups, setGroups] = useState([]);
  const [teams, setTeams] = useState([]);
  const [powers, setPowers] = useState({});
  const [adminTitle, setAdminTitle] = useState('');
  const [scopeTeams, setScopeTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const loadTarget = useCallback(async () => {
    try {
      const { data } = await api.get(`/users/${id}/powers`);
      setTarget(data);
      setPowers(data.powers || {});
      setAdminTitle(data.adminTitle || '');
      setScopeTeams((data.adminScope?.teams || []).map(t => t._id || t));
    } catch (err) {
      console.error('load target failed', err);
    }
  }, [id]);

  const loadGroups = useCallback(async () => {
    try {
      const { data } = await api.get('/users/powers/groups');
      setGroups(data);
    } catch {
      setGroups([]);
    }
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const { data } = await api.get('/teams');
      setTeams(data || []);
    } catch {
      setTeams([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadTarget(), loadGroups(), loadTeams()]).finally(() => setLoading(false));
  }, [loadTarget, loadGroups, loadTeams]);

  const isOn = (group, flag) => powers?.[group]?.[flag] === true;
  const toggle = (group, flag) => {
    setPowers(prev => {
      const next = { ...prev };
      next[group] = { ...(next[group] || {}) };
      next[group][flag] = !next[group][flag];
      return next;
    });
  };

  const enabledCount = groups.reduce((sum, g) => {
    return sum + g.flags.filter(f => isOn(g.key, f.key)).length;
  }, 0);

  const onSave = async () => {
    setSaving(true);
    try {
      await api.put(`/users/${id}/powers`, {
        powers,
        adminTitle,
        adminScope: { teams: scopeTeams, offices: [] },
      });
      navigate(`/admin/users/${id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const canEdit = me?.role === 'main_admin' || me?.powers?.users?.editPowers;

  if (loading) {
    return <GlassPanel elevated style={{ padding: 40, textAlign: 'center' }}>Loading…</GlassPanel>;
  }
  if (!target) {
    return <GlassPanel elevated style={{ padding: 40, textAlign: 'center' }}>User not found.</GlassPanel>;
  }
  if (!canEdit) {
    return <GlassPanel elevated style={{ padding: 40, textAlign: 'center' }}>No permission to edit powers.</GlassPanel>;
  }

  // Filter groups by search query
  const filteredGroups = query
    ? groups.map(g => ({
        ...g,
        flags: g.flags.filter(f =>
          f.label.toLowerCase().includes(query.toLowerCase()) ||
          f.key.toLowerCase().includes(query.toLowerCase()) ||
          g.label.toLowerCase().includes(query.toLowerCase())
        ),
      })).filter(g => g.flags.length > 0)
    : groups;

  return (
    <div className="ad-pe">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="ad-pe__head ad-enter">
        <div className="ad-pe__back">
          <IconButton size="sm" variant="ghost" title="Back" onClick={() => navigate(`/admin/users/${id}`)}>
            <Icon.ChevronLeft size={14} />
          </IconButton>
        </div>
        <Avatar name={target.name} size="lg" />
        <div className="ad-pe__head-body">
          <h1 className="ad-pe__title">
            Powers for <GradientText>{target.name?.split(' ')[0]}</GradientText>
          </h1>
          <p className="ad-pe__sub">
            {target.email} · {target.role === 'main_admin' ? 'Main Admin'
              : target.role === 'admin' ? (target.adminTitle || 'Admin') : 'Employee'}
          </p>
        </div>
        <div className="ad-pe__head-stats">
          <span className="ad-pe__count">{enabledCount}</span>
          <span className="ad-pe__count-lbl">powers enabled</span>
        </div>
      </header>

      {/* ── Admin title + scope ──────────────────────────────────────── */}
      <GlassPanel elevated className="ad-pe__scope ad-enter" style={{ animationDelay: '80ms' }}>
        <div className="ad-pe__field">
          <label className="ad-label">Admin title (optional)</label>
          <input
            type="text"
            value={adminTitle}
            onChange={(e) => setAdminTitle(e.target.value)}
            placeholder="e.g. HR Admin, Team Lead, Ops Manager"
            className="ad-pe__input"
            maxLength={40}
          />
          <div className="ad-pe__hint">
            Shown in the admin pill next to the user's name.
          </div>
        </div>
        <div className="ad-pe__field">
          <label className="ad-label">Scope: teams this admin can manage</label>
          <div className="ad-pe__teamgrid">
            {teams.length === 0 ? (
              <span className="ad-pe__hint">No teams yet.</span>
            ) : teams.map(t => {
              const on = scopeTeams.includes(t._id);
              return (
                <button
                  key={t._id}
                  type="button"
                  className={`ad-pe__teamchip ${on ? 'ad-pe__teamchip--on' : ''} ad-focus`}
                  onClick={() => setScopeTeams(prev =>
                    on ? prev.filter(x => x !== t._id) : [...prev, t._id]
                  )}
                >
                  {on && <Icon.CheckCircle size={12} />}
                  {t.name}
                </button>
              );
            })}
          </div>
          <div className="ad-pe__hint">
            Leave empty for unrestricted (can manage any team). Restricting applies only where admin-scope checks are used.
          </div>
        </div>
      </GlassPanel>

      {/* ── Search ────────────────────────────────────────────────────── */}
      <div className="ad-pe__search ad-enter" style={{ animationDelay: '120ms' }}>
        <Icon.Sparkles size={14} />
        <input
          type="text"
          className="ad-pe__search-input"
          placeholder="Search powers by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="ad-pe__search-clear" onClick={() => setQuery('')}>
            <Icon.X size={12} />
          </button>
        )}
      </div>

      {/* ── Groups ────────────────────────────────────────────────────── */}
      <div className="ad-pe__groups">
        {filteredGroups.length === 0 && query && (
          <GlassPanel elevated className="ad-pe__empty">
            No powers match "{query}".
          </GlassPanel>
        )}
        {filteredGroups.map((g, gi) => {
          const enabledInGroup = g.flags.filter(f => isOn(g.key, f.key)).length;
          return (
            <GlassPanel
              key={g.key}
              elevated
              className="ad-pe__group ad-enter"
              style={{ animationDelay: `${160 + gi * 40}ms` }}
            >
              <header className="ad-pe__group-head">
                <div>
                  <span className="ad-pe__group-label">{g.label}</span>
                  <span className="ad-pe__group-count">
                    {enabledInGroup}/{g.flags.length}
                  </span>
                </div>
                <div className="ad-pe__group-actions">
                  <button
                    type="button"
                    className="ad-pe__group-btn ad-focus"
                    onClick={() => {
                      const allOn = g.flags.every(f => isOn(g.key, f.key));
                      setPowers(prev => {
                        const next = { ...prev };
                        next[g.key] = { ...(next[g.key] || {}) };
                        g.flags.forEach(f => { next[g.key][f.key] = !allOn; });
                        return next;
                      });
                    }}
                  >
                    {g.flags.every(f => isOn(g.key, f.key)) ? 'Clear all' : 'Enable all'}
                  </button>
                </div>
              </header>
              <ul className="ad-pe__flags">
                {g.flags.map(f => {
                  const on = isOn(g.key, f.key);
                  return (
                    <li key={f.key} className="ad-pe__flag">
                      <button
                        type="button"
                        className={`ad-pe__toggle ${on ? 'ad-pe__toggle--on' : ''} ad-focus`}
                        onClick={() => toggle(g.key, f.key)}
                        role="switch"
                        aria-checked={on}
                      >
                        <span className="ad-pe__toggle-knob" />
                      </button>
                      <div className="ad-pe__flag-body">
                        <div className="ad-pe__flag-label">{f.label}</div>
                        <div className="ad-pe__flag-key">{g.key}.{f.key}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </GlassPanel>
          );
        })}
      </div>

      {/* ── Sticky save bar ──────────────────────────────────────────── */}
      <div className="ad-pe__savebar">
        <span className="ad-pe__savebar-info">
          {enabledCount === 0 ? 'No powers enabled' : `${enabledCount} power${enabledCount === 1 ? '' : 's'} enabled`}
        </span>
        <div className="ad-pe__savebar-actions">
          <button type="button" className="ad-pe__cancel ad-focus" onClick={() => navigate(`/admin/users/${id}`)}>
            Cancel
          </button>
          <PrimaryButton onClick={onSave} loading={saving} disabled={saving}>
            Save changes
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
