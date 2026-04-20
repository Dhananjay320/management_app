import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  GlassPanel, PrimaryButton, SegmentedControl, GradientText, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import '../styles/meetings.css';
import './Meetings.restyle.css';

const GRADIENTS = ['linear-gradient(135deg,#6366F1,#8B5CF6)','linear-gradient(135deg,#10B981,#06B6D4)','linear-gradient(135deg,#F59E0B,#F97316)','linear-gradient(135deg,#EC4899,#8B5CF6)','linear-gradient(135deg,#EF4444,#F97316)','linear-gradient(135deg,#06B6D4,#10B981)'];
function getGrad(id) { return GRADIENTS[((id||'').charCodeAt(0)||0) % GRADIENTS.length]; }
function initials(n) { return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2); }

export default function MeetingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [tab, setTab] = useState('upcoming');
  const [view, setView] = useState('list'); // list, create, detail, mom
  const [selected, setSelected] = useState(null);
  const [editingMom, setEditingMom] = useState(null);
  const [users, setUsers] = useState([]);
  const highlightRef = useRef(null);

  // Session 14+20: useFetchSafe for consistent loading/error/retry.
  const { data: meetings = [], loading, error, refetch } = useFetchSafe(
    async () => (await api.get(`/meetings?tab=${tab}`)).data,
    [tab]
  );

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  const openMeeting = useCallback(async (id) => {
    try {
      const { data } = await api.get(`/meetings/${id}`);
      setSelected(data);
      setView('detail');
    } catch {}
  }, []);

  // Session 12+20 deep-link: ?highlight=<meetingId> opens that meeting's
  // detail view AND scrolls + flashes its list card before transitioning.
  useEffect(() => {
    if (!highlightId || loading) return;
    const match = (meetings || []).find(m => String(m._id) === String(highlightId));
    if (match) {
      // Flash the list row first (quick feedback) then navigate to detail
      setTimeout(() => {
        if (highlightRef.current) {
          highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightRef.current.classList.add('ad-mtg-row--flash');
        }
      }, 100);
      setTimeout(() => openMeeting(highlightId), 900);
      // Strip the param so refresh/back doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete('highlight');
      setSearchParams(next, { replace: true });
    }
    // If highlight id belongs to the OTHER tab, flip the tab so it shows up.
    // This catches: click a Past meeting notification while Upcoming is active.
    else if (!match && !loading && meetings?.length >= 0) {
      // Try the other tab silently
      if (tab === 'upcoming') {
        api.get(`/meetings?tab=past`).then(r => {
          if (r.data?.some?.(m => String(m._id) === String(highlightId))) setTab('past');
        }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, loading, meetings]);

  const respond = async (response) => {
    if (!selected) return;
    await api.post(`/meetings/${selected._id}/respond`, { response });
    openMeeting(selected._id);
  };

  const startMeeting = async () => {
    if (!selected) return;
    await api.post(`/meetings/${selected._id}/start`);
    openMeeting(selected._id);
    refetch();
  };

  const endMeeting = async () => {
    if (!selected) return;
    await api.post(`/meetings/${selected._id}/end`);
    openMeeting(selected._id);
    refetch();
  };

  const addAttendee = async (userId) => {
    if (!selected) return;
    await api.post(`/meetings/${selected._id}/attendees`, { userIds: [userId] });
    openMeeting(selected._id);
  };

  const openMom = (mom) => { setEditingMom(mom); setView('mom'); };

  const createMom = async (type) => {
    const { data } = await api.post(`/meetings/${selected._id}/mom`, {
      title: type === 'team' ? 'Team MoM' : 'My MoM', type
    });
    setEditingMom(data);
    setView('mom');
  };

  const totalMeetings = (meetings || []).length;

  return (
    <div className="ad-mtg">
      {/* ─── Hero header ───────────────────────────────────────────── */}
      <header className="ad-mtg__head ad-enter">
        <div className="ad-mtg__head-left">
          <h1 className="ad-mtg__title">
            {view === 'create' ? 'New meeting'
              : view === 'detail' ? (selected?.title || 'Meeting')
              : view === 'mom'    ? 'Minutes of meeting'
              : <>Your <GradientText>meetings</GradientText></>}
          </h1>
          {view === 'list' && (
            <p className="ad-mtg__sub">
              {loading ? 'Loading…'
                : totalMeetings === 0 ? `No ${tab} meetings.`
                : `${totalMeetings} ${tab} meeting${totalMeetings === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
        <div className="ad-mtg__head-right">
          {view === 'list' && (
            <>
              <SegmentedControl
                value={tab}
                onChange={setTab}
                options={[
                  { key: 'upcoming', label: 'Upcoming' },
                  { key: 'past',     label: 'Past'     },
                ]}
              />
              <PrimaryButton icon={<Icon.Plus size={14} />} onClick={() => setView('create')}>
                New meeting
              </PrimaryButton>
            </>
          )}
          {view !== 'list' && (
            <button
              type="button"
              className="ad-mtg__back"
              onClick={() => { setView('list'); setSelected(null); setEditingMom(null); }}
            >
              ← Back
            </button>
          )}
        </div>
      </header>

      {/* ─── List view ───────────────────────────────────────────── */}
      {view === 'list' && (
        loading ? (
          <GlassPanel elevated className="ad-mtg__state">Loading…</GlassPanel>
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : totalMeetings === 0 ? (
          <GlassPanel elevated className="ad-mtg__state">
            <div className="ad-mtg__empty-icon"><Icon.Users size={22} /></div>
            <div className="ad-mtg__empty-title">No {tab} meetings</div>
            <div className="ad-mtg__empty-sub">
              {tab === 'upcoming' ? 'Schedule your next meeting.' : 'Past meetings will appear here.'}
            </div>
          </GlassPanel>
        ) : (
          (meetings || []).map(m => (
            <div
              key={m._id}
              ref={String(m._id) === String(highlightId) ? highlightRef : null}
              className={`mtg-card ad-mtg-row ${String(m._id) === String(highlightId) ? 'ad-mtg-row--target' : ''}`}
              style={{ borderLeftColor: m.type === 'online' ? '#6366F1' : '#8B5CF6' }}
              onClick={() => openMeeting(m._id)}
            >
              <div className="mtg-card-header">
                <div>
                  <div className="mtg-card-title">{m.title}</div>
                  <div className="mtg-card-time">
                    {new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {m.startTime}{m.endTime ? ` – ${m.endTime}` : ''}
                  </div>
                </div>
                <div className="mtg-card-badges">
                  <span className="badge-pill" style={{ background: m.type === 'online' ? 'rgba(99,102,241,0.12)' : 'rgba(139,92,246,0.12)', color: m.type === 'online' ? '#A5B4FC' : '#C4B5FD' }}>
                    {m.type === 'online' ? '🖥 Online' : '🏢 Offline'}
                  </span>
                  {m.googleMeetLink && <span className="badge-pill" style={{ background: 'rgba(16,185,129,0.12)', color: '#6EE7B7' }}>Meet Link</span>}
                  {m.status === 'completed' && <span className="badge-pill" style={{ background: 'rgba(16,185,129,0.12)', color: '#6EE7B7' }}>Completed</span>}
                </div>
              </div>
              <div className="mtg-attendees">
                <div className="mtg-attendee-stack">
                  {m.attendees?.slice(0, 4).map((a, i) => (
                    <div key={a.user?._id || i} className="mtg-attendee-avatar" style={{ background: getGrad(a.user?._id), marginLeft: i ? -6 : 0 }}>
                      {initials(a.user?.name)}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 10, color: 'var(--ad-ink-3, #94A3B8)' }}>{m.attendees?.length} attendees</span>
              </div>
            </div>
          ))
        )
      )}

      {/* Detail */}
      {view === 'detail' && selected && (
        <MeetingDetail meeting={selected} user={user} onRespond={respond} onStart={startMeeting} onEnd={endMeeting} onAddAttendee={addAttendee} allUsers={users}
          onOpenMom={openMom} onCreateMom={createMom} onRefresh={() => openMeeting(selected._id)} />
      )}

      {/* Create */}
      {view === 'create' && <CreateMeeting users={users} userId={user._id} onBack={() => setView('list')} onCreated={() => { setView('list'); refetch(); }} />}

      {/* MoM Editor */}
      {view === 'mom' && editingMom && (
        <MomEditor mom={editingMom} onBack={() => { setView('detail'); openMeeting(selected._id); }} />
      )}
    </div>
  );
}

function MeetingDetail({ meeting, user, onRespond, onStart, onEnd, onAddAttendee, allUsers, onOpenMom, onCreateMom, onRefresh }) {
  const myAttendee = meeting.attendees?.find(a => a.user?._id === user._id);
  const isCreator = meeting.createdBy?._id === user._id;
  const isUpcoming = meeting.status === 'scheduled';

  const responseColors = { confirmed: '#10B981', declined: '#EF4444', pending: '#F59E0B', reschedule_requested: '#8B5CF6' };

  return (
    <div className="mtg-detail">
      <div className="mtg-detail-main">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1E293B', marginBottom: 4 }}>{meeting.title}</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="badge-pill" style={{ background: meeting.type === 'online' ? 'rgba(99,102,241,0.08)' : 'rgba(139,92,246,0.08)', color: meeting.type === 'online' ? '#6366F1' : '#8B5CF6' }}>
                  {meeting.type === 'online' ? '🖥 Online' : '🏢 Offline'}
                </span>
                <span className="badge-pill" style={{ background: meeting.status === 'completed' ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', color: meeting.status === 'completed' ? '#10B981' : '#F59E0B' }}>
                  {meeting.status}
                </span>
              </div>
            </div>
            {isUpcoming && isCreator && (
              <div style={{ display: 'flex', gap: 6 }}>
                {meeting.status === 'scheduled' && (
                  <button className="btn btn-primary-sm" onClick={onStart}>Start Meeting</button>
                )}
                {meeting.status === 'in_progress' && (
                  <button className="btn btn-danger" onClick={onEnd}>End Meeting</button>
                )}
              </div>
            )}
          </div>

          <div className="mtg-info-grid">
            <div className="mtg-info-item"><div className="mtg-info-label">Date</div><div className="mtg-info-value">{new Date(meeting.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
            <div className="mtg-info-item"><div className="mtg-info-label">Time</div><div className="mtg-info-value">{meeting.startTime}{meeting.endTime ? ` – ${meeting.endTime}` : ''}{meeting.duration ? ` (${meeting.duration}m)` : ''}</div></div>
            {meeting.location && <div className="mtg-info-item"><div className="mtg-info-label">Location</div><div className="mtg-info-value">{meeting.location}</div></div>}
            <div className="mtg-info-item"><div className="mtg-info-label">Created By</div><div className="mtg-info-value">{meeting.createdBy?.name}</div></div>
          </div>

          {meeting.googleMeetLink && (
            <div className="mtg-meet-link" onClick={() => window.open(meeting.googleMeetLink, '_blank')}>
              <span style={{ fontSize: 18 }}>📹</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#10B981' }}>Join Google Meet</div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>{meeting.googleMeetLink}</div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>Agenda</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, background: '#F8FAFC', borderRadius: 8, padding: 12 }}>{meeting.agenda}</div>
          </div>

          {/* My Response */}
          {isUpcoming && myAttendee && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 11, color: '#94A3B8', alignSelf: 'center' }}>Your response:</span>
              {['confirmed', 'declined', 'reschedule_requested'].map(r => (
                <button key={r} className={`btn ${myAttendee.response === r ? 'btn-primary-sm' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: 10 }} onClick={() => onRespond(r)}>
                  {r === 'confirmed' ? '✓ Confirm' : r === 'declined' ? '✕ Decline' : '↻ Reschedule'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* MoMs */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>Minutes of Meeting</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={() => onCreateMom('personal')}>+ Personal MoM</button>
              <button className="btn btn-primary-sm" style={{ padding: '4px 10px', fontSize: 10 }} onClick={() => onCreateMom('team')}>+ Team MoM</button>
            </div>
          </div>

          {/* Scratchpad */}
          {meeting.scratchpad && (
            <div className="mtg-mom-card" style={{ borderLeft: '3px solid #F59E0B' }} onClick={() => onOpenMom(meeting.scratchpad)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12 }}>📝</span>
                <div className="mtg-mom-title">My Scratchpad</div>
                <span className="badge-pill" style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B' }}>Private</span>
              </div>
            </div>
          )}

          {meeting.moms?.filter(m => m.type !== 'scratchpad').map(mom => (
            <div key={mom._id} className="mtg-mom-card" style={{ borderLeft: `3px solid ${mom.isPublished ? '#8B5CF6' : '#94A3B8'}` }} onClick={() => onOpenMom(mom)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12 }}>📋</span>
                <div className="mtg-mom-title">{mom.title}</div>
                <span className="badge-pill" style={{ background: mom.isPublished ? 'rgba(139,92,246,0.08)' : 'rgba(148,163,184,0.08)', color: mom.isPublished ? '#8B5CF6' : '#94A3B8' }}>
                  {mom.isPublished ? 'Published' : 'Draft'}
                </span>
                <span className="badge-pill" style={{ background: 'rgba(99,102,241,0.06)', color: '#6366F1' }}>{mom.type}</span>
              </div>
              <div className="mtg-mom-meta">by {mom.author?.name} · {new Date(mom.updatedAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar — Attendees */}
      <div className="mtg-detail-side">
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>
            Attendees ({meeting.attendees?.length})
          </div>
          {meeting.attendees?.map((a, i) => (
            <div key={a.user?._id || i} className="mtg-attendee-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="avatar-sm" style={{ background: getGrad(a.user?._id), width: 28, height: 28, fontSize: 10 }}>{initials(a.user?.name)}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1E293B' }}>{a.user?.name}</div>
                  <div style={{ fontSize: 9, color: '#94A3B8' }}>{a.user?.jobTitle || a.user?.email}</div>
                </div>
              </div>
              <span className="mtg-response-badge" style={{ background: (responseColors[a.response] || '#94A3B8') + '14', color: responseColors[a.response] || '#94A3B8' }}>
                {a.isPresent ? '✓ Present' : a.response}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MomEditor({ mom, onBack }) {
  const [title, setTitle] = useState(mom.title);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(mom.isPublished);
  const [lastSavedAt, setLastSavedAt] = useState(mom.lastAutoSaveAt || null);
  const autosaveTimer = useRef(null);

  const editor = useEditor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), Placeholder.configure({ placeholder: 'Write your meeting notes...' })],
    content: mom.tiptapJSON || { type: 'doc', content: [{ type: 'paragraph' }] },
    // Session 20: debounced autosave — fires 1.5s after the user stops typing.
    // Server-side (Session 8) already updates mom.lastAutoSaveAt on autosave
    // and enforces that only the author can save to their own MoM.
    onUpdate: ({ editor: ed }) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(async () => {
        try {
          setSaving(true);
          const { data } = await api.put(`/meetings/mom/${mom._id}`, {
            title,
            tiptapJSON: ed.getJSON(),
          });
          if (data?.lastAutoSaveAt) setLastSavedAt(data.lastAutoSaveAt);
          else setLastSavedAt(new Date().toISOString());
        } catch {} finally { setSaving(false); }
      }, 1500);
    },
  });

  // Clean up autosave timer on unmount so we don't save after navigating away.
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  const save = async () => {
    if (!editor) return;
    // Cancel any pending autosave — we're saving explicitly now.
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaving(true);
    try {
      const { data } = await api.put(`/meetings/mom/${mom._id}`, { title, tiptapJSON: editor.getJSON() });
      if (data?.lastAutoSaveAt) setLastSavedAt(data.lastAutoSaveAt);
      else setLastSavedAt(new Date().toISOString());
    } catch {} finally { setSaving(false); }
  };

  const publish = async () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaving(true);
    try {
      await api.put(`/meetings/mom/${mom._id}`, { title, tiptapJSON: editor.getJSON(), isPublished: true });
      setPublished(true);
      setLastSavedAt(new Date().toISOString());
    } catch {} finally { setSaving(false); }
  };

  const formatSaved = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = Date.now();
      const diff = (now - d.getTime()) / 1000;
      if (diff < 5) return 'just now';
      if (diff < 60) return `${Math.floor(diff)}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  if (!editor) return null;

  return (
    <div className="ad-mom">
      {/* Sticky save bar */}
      <div className="ad-mom__bar">
        <div className="ad-mom__bar-left">
          <button className="ad-mom__back" onClick={() => { save(); onBack(); }}>← Back</button>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="ad-mom__title"
            placeholder="Untitled MoM"
          />
          {mom.type === 'scratchpad' && <span className="badge-pill ad-mom__scratch">Private Scratchpad</span>}
          {published && <span className="badge-pill ad-mom__published">Published</span>}
        </div>
        <div className="ad-mom__bar-right">
          <span className="ad-mom__status">
            {saving ? 'Saving…' : lastSavedAt ? `Saved ${formatSaved(lastSavedAt)}` : 'Not saved yet'}
          </span>
          <button className="ad-mom__btn ad-mom__btn--secondary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!published && mom.type !== 'scratchpad' && (
            <button className="ad-mom__btn ad-mom__btn--primary" onClick={publish} disabled={saving}>
              Publish
            </button>
          )}
        </div>
      </div>

      <div className="ws-editor-wrap ad-mom__wrap">
        <div className="ws-editor-toolbar">
          {[
            ['B', 'bold', () => editor.chain().focus().toggleBold().run()],
            ['I', 'italic', () => editor.chain().focus().toggleItalic().run()],
            ['H2', 'heading', () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
            ['•', 'bulletList', () => editor.chain().focus().toggleBulletList().run()],
            ['1.', 'orderedList', () => editor.chain().focus().toggleOrderedList().run()],
            ['☑', 'taskList', () => editor.chain().focus().toggleTaskList().run()],
            ['❝', 'blockquote', () => editor.chain().focus().toggleBlockquote().run()],
          ].map(([label, name, fn]) => (
            <button key={label} className={`ws-toolbar-btn ${editor.isActive(name) ? 'active' : ''}`} onClick={fn} type="button">{label}</button>
          ))}
        </div>
        <div className="ws-editor-content">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function CreateMeeting({ users, userId, onBack, onCreated }) {
  const [form, setForm] = useState({ title: '', agenda: '', type: 'online', date: '', startTime: '', endTime: '', duration: '', location: '', attendeeIds: [] });
  const [loading, setLoading] = useState(false);

  const toggleAttendee = (id) => {
    setForm(p => ({
      ...p,
      attendeeIds: p.attendeeIds.includes(id) ? p.attendeeIds.filter(x => x !== id) : [...p.attendeeIds, id]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/meetings', form);
      onCreated();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="form-card" style={{ maxWidth: '100%' }}>
      <form onSubmit={handleSubmit}>
        <div className="form-field" style={{ marginBottom: 14 }}>
          <label>Meeting Title *</label>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Weekly Sprint Review" required />
        </div>
        <div className="form-field" style={{ marginBottom: 14 }}>
          <label>Agenda *</label>
          <textarea value={form.agenda} onChange={e => setForm(p => ({ ...p, agenda: e.target.value }))} placeholder="What's this meeting about?" rows={3} required />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Type *</label>
          <div className="mtg-type-toggle">
            <div className={`mtg-type-btn ${form.type === 'online' ? 'active' : ''}`} onClick={() => setForm(p => ({ ...p, type: 'online' }))}>🖥 Online</div>
            <div className={`mtg-type-btn ${form.type === 'offline' ? 'active' : ''}`} onClick={() => setForm(p => ({ ...p, type: 'offline' }))}>🏢 Offline</div>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-field"><label>Date *</label><input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required /></div>
          <div className="form-field"><label>Start Time *</label><input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} required /></div>
          <div className="form-field"><label>End Time</label><input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} /></div>
          <div className="form-field"><label>Duration (min)</label><input type="number" value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} placeholder="60" /></div>
        </div>

        {form.type === 'offline' && (
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label>Location</label>
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Conference Room A" />
          </div>
        )}

        {form.type === 'online' && (
          <div className="info-box green" style={{ marginBottom: 14 }}>
            <span>📹</span>
            <div>
              <div style={{ fontWeight: 600 }}>Google Meet link will be auto-generated</div>
              <div style={{ fontSize: 10, color: '#94A3B8' }}>All attendees will receive the link</div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Attendees *</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, maxHeight: 160, overflowY: 'auto' }}>
            {users.filter(u => u._id !== userId).map(u => (
              <div key={u._id} onClick={() => toggleAttendee(u._id)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  background: form.attendeeIds.includes(u._id) ? 'rgba(99,102,241,0.08)' : '#fff',
                  color: form.attendeeIds.includes(u._id) ? '#6366F1' : '#64748B',
                  border: `1px solid ${form.attendeeIds.includes(u._id) ? 'rgba(99,102,241,0.2)' : '#E2E8F0'}` }}>
                {form.attendeeIds.includes(u._id) ? '✓ ' : ''}{u.name}
              </div>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onBack}>Cancel</button>
          <button type="submit" className="btn btn-primary-sm" disabled={loading}>{loading ? 'Creating...' : 'Create Meeting'}</button>
        </div>
      </form>
    </div>
  );
}
