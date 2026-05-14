import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/meetings.css';
// TODO: Add FormatSwitcher from '../components/FormatSwitcher' to allow switching meeting notes/chat between chat/email/table/calendar/document views

const GRADIENTS = ['linear-gradient(135deg,#6366F1,#8B5CF6)','linear-gradient(135deg,#10B981,#06B6D4)','linear-gradient(135deg,#F59E0B,#F97316)','linear-gradient(135deg,#EC4899,#8B5CF6)','linear-gradient(135deg,#EF4444,#F97316)','linear-gradient(135deg,#06B6D4,#10B981)'];
function getGrad(id) { return GRADIENTS[((id||'').charCodeAt(0)||0) % GRADIENTS.length]; }
function initials(n) { return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2); }

export default function MeetingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState('upcoming');
  const [view, setView] = useState('list'); // list, create, detail, mom
  const [meetings, setMeetings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editingMom, setEditingMom] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/meetings?tab=${tab}`);
      setMeetings(data);
    } catch {} finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  // Auto-open meeting from URL param ?highlight=<meetingId>
  const meetingIdParam = searchParams.get('highlight');
  useEffect(() => {
    if (meetingIdParam && !loading) {
      openMeeting(meetingIdParam);
      const next = new URLSearchParams(searchParams);
      next.delete('highlight');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingIdParam, loading]);

  const openMeeting = async (id) => {
    try {
      const { data } = await api.get(`/meetings/${id}`);
      setSelected(data);
      setView('detail');
    } catch {}
  };

  const respond = async (response, reason) => {
    if (!selected) return;
    const payload = { response };
    if (reason) payload.reason = reason;
    await api.post(`/meetings/${selected._id}/respond`, payload);
    openMeeting(selected._id);
  };

  const startMeeting = async () => {
    if (!selected) return;
    await api.post(`/meetings/${selected._id}/start`);
    openMeeting(selected._id);
    load();
  };

  const endMeeting = async () => {
    if (!selected) return;
    await api.post(`/meetings/${selected._id}/end`);
    openMeeting(selected._id);
    load();
  };

  const deleteMeeting = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.title}"? Attendees will be notified if more than 10 seconds have passed since creation.`)) return;
    try {
      await api.delete(`/meetings/${selected._id}`);
      setView('list');
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete meeting.');
    }
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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{view === 'create' ? 'Create Meeting' : view === 'detail' ? selected?.title : view === 'mom' ? 'Minutes of Meeting' : 'Meetings'}</div>
          {view === 'list' && <div className="page-subtitle">{meetings.length} {tab} meetings</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {view === 'list' && (
            <>
              <div className="chip-group">
                {[['upcoming','Upcoming'],['past','Past']].map(([k,l]) => (
                  <div key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setLoading(true); }}>{l}</div>
                ))}
              </div>
              <button className="btn btn-primary-sm" onClick={() => setView('create')}>+ New Meeting</button>
            </>
          )}
          {view !== 'list' && <button className="btn btn-secondary" onClick={() => { setView('list'); setSelected(null); setEditingMom(null); }}>← Back</button>}
        </div>
      </div>

      {/* List */}
      {view === 'list' && (
        loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading...</div> : (
          meetings.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>No {tab} meetings</div>
            </div>
          ) : meetings.map(m => (
            <div key={m._id} className="mtg-card" style={{ borderLeftColor: m.type === 'online' ? '#6366F1' : '#8B5CF6' }} onClick={() => openMeeting(m._id)}>
              <div className="mtg-card-header">
                <div>
                  <div className="mtg-card-title">{m.title}</div>
                  <div className="mtg-card-time">
                    {new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {m.startTime}{m.endTime ? ` – ${m.endTime}` : ''}
                  </div>
                </div>
                <div className="mtg-card-badges">
                  <span className="badge-pill" style={{ background: m.type === 'online' ? 'rgba(99,102,241,0.08)' : 'rgba(139,92,246,0.08)', color: m.type === 'online' ? '#6366F1' : '#8B5CF6' }}>
                    {m.type === 'online' ? '🖥 Online' : '🏢 Offline'}
                  </span>
                  {m.googleMeetLink && <span className="badge-pill" style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>Meet Link</span>}
                  {m.status === 'completed' && <span className="badge-pill" style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>Completed</span>}
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
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{m.attendees?.length} attendees</span>
              </div>
            </div>
          ))
        )
      )}

      {/* Detail */}
      {view === 'detail' && selected && (
        <MeetingDetail meeting={selected} user={user} onRespond={respond} onStart={startMeeting} onEnd={endMeeting} onDelete={deleteMeeting} onAddAttendee={addAttendee} allUsers={users}
          onOpenMom={openMom} onCreateMom={createMom} onRefresh={() => openMeeting(selected._id)} />
      )}

      {/* Create */}
      {view === 'create' && <CreateMeeting users={users} userId={user._id} onBack={() => setView('list')} onCreated={() => { setView('list'); load(); }} />}

      {/* MoM Editor */}
      {view === 'mom' && editingMom && (
        <MomEditor mom={editingMom} onBack={() => { setView('detail'); openMeeting(selected._id); }} />
      )}
    </div>
  );
}

function MeetingDetail({ meeting, user, onRespond, onStart, onEnd, onDelete, onAddAttendee, allUsers, onOpenMom, onCreateMom, onRefresh }) {
  const myAttendee = meeting.attendees?.find(a => a.user?._id === user._id);
  const isCreator = meeting.createdBy?._id === user._id;
  const isUpcoming = meeting.status === 'scheduled';
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showDeclinePrompt, setShowDeclinePrompt] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Task from meeting
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium', deadline: '', assignees: [] });
  const [taskCreating, setTaskCreating] = useState(false);

  const createTaskFromMeeting = async () => {
    if (!taskForm.title.trim()) return;
    setTaskCreating(true);
    try {
      await api.post('/tasks', {
        title: taskForm.title,
        priority: taskForm.priority,
        deadline: taskForm.deadline || undefined,
        assignees: taskForm.assignees.length ? taskForm.assignees : [user._id],
        sourceType: 'meeting',
        sourceId: meeting._id,
        description: `Created from meeting: ${meeting.title}`
      });
      setShowTaskModal(false);
      setTaskForm({ title: '', priority: 'medium', deadline: '', assignees: [] });
      alert('Task created!');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create task.');
    } finally { setTaskCreating(false); }
  };

  // AI Analyse MoM — auto-detect tasks with editable details
  const [aiDetectedTasks, setAiDetectedTasks] = useState(null);
  const [aiTasksAccepting, setAiTasksAccepting] = useState(false);

  const handleAiMom = async () => {
    if (!user.aiActive) return;
    setAiLoading(true);
    setAiDetectedTasks(null);
    try {
      // Collect all MoM text
      const momTexts = (meeting.moms || []).map(m => m.plainTextContent || '').filter(Boolean).join('\n\n');
      if (!momTexts.trim()) {
        setAiResult('No MoM content to analyse. Create and write MoM notes first.');
        setAiLoading(false);
        return;
      }
      // Use AI extract-tasks endpoint
      const { data } = await api.post('/ai/extract-tasks', { text: momTexts });
      if (data.tasks?.length) {
        // Show tasks with editable fields
        setAiDetectedTasks(data.tasks.map(t => ({
          title: t.title || '', description: t.description || '',
          priority: t.priority || 'medium', deadline: t.deadline || '',
          assignee: t.assignee || '', accepted: false, editing: false
        })));
      } else {
        setAiResult(data.raw || 'No action items detected in the MoM.');
      }
    } catch (err) { setAiResult(err.response?.data?.error || 'Failed to analyse MoM. Check AI configuration in Settings.'); }
    finally { setAiLoading(false); }
  };

  const acceptAiDetectedTask = async (idx) => {
    const tasks = [...aiDetectedTasks];
    const t = tasks[idx];
    try {
      await api.post('/tasks', {
        title: t.title, priority: ['top','high','medium','low'].includes(t.priority) ? t.priority : 'medium',
        deadline: t.deadline || undefined, description: t.description || `From meeting: ${meeting.title}`,
        sourceType: 'meeting', sourceId: meeting._id
      });
      tasks[idx] = { ...t, accepted: true };
      setAiDetectedTasks([...tasks]);
    } catch {}
  };

  const acceptAllAiDetectedTasks = async () => {
    setAiTasksAccepting(true);
    for (let i = 0; i < aiDetectedTasks.length; i++) {
      if (!aiDetectedTasks[i].accepted) await acceptAiDetectedTask(i);
    }
    setAiTasksAccepting(false);
  };

  const handleAiSummary = async () => {
    if (!user.aiActive) return;
    setAiLoading(true);
    try {
      const { data } = await api.post('/ai/summarize', { context: 'meeting_summary', meetingId: meeting._id, agenda: meeting.agenda, title: meeting.title });
      setAiResult(data.summary || data.result || 'No summary generated.');
    } catch (err) { setAiResult(err.response?.data?.error || 'Failed to generate summary. Check AI configuration in Settings.'); }
    finally { setAiLoading(false); }
  };

  const responseColors = { confirmed: '#10B981', declined: '#EF4444', pending: '#F59E0B', reschedule_requested: '#8B5CF6' };

  return (
    <div className="mtg-detail">
      <div className="mtg-detail-main">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>{meeting.title}</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="badge-pill" style={{ background: meeting.type === 'online' ? 'rgba(99,102,241,0.08)' : 'rgba(139,92,246,0.08)', color: meeting.type === 'online' ? '#6366F1' : '#8B5CF6' }}>
                  {meeting.type === 'online' ? '🖥 Online' : '🏢 Offline'}
                </span>
                <span className="badge-pill" style={{ background: meeting.status === 'completed' ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', color: meeting.status === 'completed' ? '#10B981' : '#F59E0B' }}>
                  {meeting.status}
                </span>
              </div>
            </div>
            {isCreator && (
              <div style={{ display: 'flex', gap: 6 }}>
                {meeting.status === 'scheduled' && (
                  <button className="btn btn-primary-sm" onClick={onStart}>Start Meeting</button>
                )}
                {meeting.status === 'in_progress' && (
                  <button className="btn btn-danger" onClick={onEnd}>End Meeting</button>
                )}
                {meeting.status !== 'completed' && (
                  <button className="btn btn-danger" onClick={onDelete} title="Delete meeting">🗑 Delete</button>
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
                <div style={{ fontSize: 12, fontWeight: 600, color: '#10B981' }}>Join Meeting</div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{meeting.googleMeetLink}</div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Agenda</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, background: 'var(--glass)', borderRadius: 8, padding: 12 }}>{meeting.agenda}</div>
          </div>

          {/* My Response */}
          {isUpcoming && myAttendee && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', alignSelf: 'center' }}>Your response:</span>
                <button className={`btn ${myAttendee.response === 'confirmed' ? 'btn-primary-sm' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: 10 }} onClick={() => onRespond('confirmed')}>
                  ✓ Confirm
                </button>
                <button className={`btn ${myAttendee.response === 'declined' ? 'btn-primary-sm' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: 10 }} onClick={() => setShowDeclinePrompt(!showDeclinePrompt)}>
                  ✕ Decline
                </button>
                <button className={`btn ${myAttendee.response === 'reschedule_requested' ? 'btn-primary-sm' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: 10 }} onClick={() => onRespond('reschedule_requested')}>
                  ↻ Reschedule
                </button>
              </div>
              {showDeclinePrompt && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <input
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder="Reason for declining (optional)..."
                    style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, outline: 'none', fontFamily: 'Inter, sans-serif' }}
                    autoFocus
                  />
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 10, color: '#EF4444', borderColor: '#EF4444' }}
                    onClick={() => { onRespond('declined', declineReason); setShowDeclinePrompt(false); setDeclineReason(''); }}>
                    Confirm Decline
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 10 }}
                    onClick={() => { setShowDeclinePrompt(false); setDeclineReason(''); }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MoMs */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Minutes of Meeting</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                disabled={!user.aiActive}
                title={user.aiActive ? 'Click to use AI' : 'AI not activated \u2014 go to Settings'}
                onClick={() => user.aiActive ? handleAiMom() : void 0}
                style={{ padding: '4px 10px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 6, background: user.aiActive ? 'rgba(99,102,241,0.08)' : 'var(--glass)', color: user.aiActive ? '#6366F1' : 'var(--ink-3)', cursor: user.aiActive ? 'pointer' : 'not-allowed', opacity: user.aiActive ? 1 : 0.4, fontFamily: 'Inter,sans-serif' }}
              >
                {'\u2728'} Analyse MoM
              </button>
              <button
                disabled={!user.aiActive}
                title={user.aiActive ? 'Click to use AI' : 'AI not activated \u2014 go to Settings'}
                onClick={() => user.aiActive ? handleAiSummary() : void 0}
                style={{ padding: '4px 10px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 6, background: user.aiActive ? 'rgba(99,102,241,0.08)' : 'var(--glass)', color: user.aiActive ? '#6366F1' : 'var(--ink-3)', cursor: user.aiActive ? 'pointer' : 'not-allowed', opacity: user.aiActive ? 1 : 0.4, fontFamily: 'Inter,sans-serif' }}
              >
                {'\u2728'} Generate Summary
              </button>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 10, color: '#10B981', borderColor: '#10B981' }} onClick={() => setShowTaskModal(true)}>+ Create Task</button>
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

          {aiLoading && <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#6366F1' }}>AI is analysing MoM...</div>}

          {/* AI Detected Tasks — editable cards */}
          {aiDetectedTasks && (
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6366F1' }}>Detected Tasks ({aiDetectedTasks.length})</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {aiDetectedTasks.some(t => !t.accepted) && (
                    <button onClick={acceptAllAiDetectedTasks} disabled={aiTasksAccepting}
                      style={{ padding: '4px 12px', fontSize: 10, fontWeight: 600, border: 'none', borderRadius: 6, background: '#6366F1', color: '#fff', cursor: 'pointer', fontFamily: 'Inter' }}>
                      {aiTasksAccepting ? 'Creating...' : `Accept All (${aiDetectedTasks.filter(t => !t.accepted).length})`}
                    </button>
                  )}
                  <button onClick={() => setAiDetectedTasks(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-3)' }}>&times;</button>
                </div>
              </div>
              {aiDetectedTasks.map((t, i) => (
                <div key={i} style={{
                  padding: '10px 12px', marginBottom: 6, borderRadius: 8,
                  background: t.accepted ? 'rgba(16,185,129,0.06)' : 'var(--glass)',
                  border: `1px solid ${t.accepted ? 'rgba(16,185,129,0.2)' : 'var(--line)'}`,
                  opacity: t.accepted ? 0.7 : 1
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      {/* Editable title */}
                      <input value={t.title} onChange={e => {
                        const upd = [...aiDetectedTasks]; upd[i] = { ...upd[i], title: e.target.value }; setAiDetectedTasks(upd);
                      }} disabled={t.accepted}
                        style={{ width: '100%', fontSize: 12, fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--ink)', outline: 'none', fontFamily: 'Inter', marginBottom: 4, boxSizing: 'border-box' }}
                        placeholder="Task title..." />
                      {/* Editable description */}
                      <input value={t.description} onChange={e => {
                        const upd = [...aiDetectedTasks]; upd[i] = { ...upd[i], description: e.target.value }; setAiDetectedTasks(upd);
                      }} disabled={t.accepted}
                        style={{ width: '100%', fontSize: 10, border: 'none', background: 'transparent', color: 'var(--ink-2)', outline: 'none', fontFamily: 'Inter', marginBottom: 4, boxSizing: 'border-box' }}
                        placeholder="Description..." />
                      {/* Priority + Deadline inline editable */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select value={t.priority} onChange={e => {
                          const upd = [...aiDetectedTasks]; upd[i] = { ...upd[i], priority: e.target.value }; setAiDetectedTasks(upd);
                        }} disabled={t.accepted}
                          style={{ padding: '2px 6px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--glass)', color: 'var(--ink)', fontFamily: 'Inter' }}>
                          <option value="top">Top</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                        </select>
                        <input type="date" value={t.deadline} onChange={e => {
                          const upd = [...aiDetectedTasks]; upd[i] = { ...upd[i], deadline: e.target.value }; setAiDetectedTasks(upd);
                        }} disabled={t.accepted}
                          style={{ padding: '2px 6px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--glass)', color: 'var(--ink)', fontFamily: 'Inter' }} />
                        {t.assignee && <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>Assignee: {t.assignee}</span>}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                      {t.accepted ? (
                        <span style={{ fontSize: 10, color: '#10B981', fontWeight: 700 }}>Created</span>
                      ) : (
                        <button onClick={() => acceptAiDetectedTask(i)}
                          style={{ padding: '5px 12px', fontSize: 10, fontWeight: 600, border: 'none', borderRadius: 6, background: '#10B981', color: '#fff', cursor: 'pointer', fontFamily: 'Inter' }}>
                          Accept
                        </button>
                      )}
                    </div>
                  </div>
                  {!t.title.trim() && !t.accepted && (
                    <div style={{ fontSize: 9, color: '#EF4444', marginTop: 4 }}>Title is required — please fill in before accepting</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {aiResult && !aiDetectedTasks && (
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6366F1' }}>AI Result</span>
                <button onClick={() => setAiResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-3)' }}>&times;</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{aiResult}</div>
            </div>
          )}

          {meeting.moms?.filter(m => m.type !== 'scratchpad').map(mom => (
            <div key={mom._id} className="mtg-mom-card" style={{ borderLeft: `3px solid ${mom.isPublished ? '#8B5CF6' : 'var(--ink-3)'}` }} onClick={() => onOpenMom(mom)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12 }}>📋</span>
                <div className="mtg-mom-title">{mom.title}</div>
                <span className="badge-pill" style={{ background: mom.isPublished ? 'rgba(139,92,246,0.08)' : 'rgba(148,163,184,0.08)', color: mom.isPublished ? '#8B5CF6' : 'var(--ink-3)' }}>
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
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
            Attendees ({meeting.attendees?.length})
          </div>
          {meeting.attendees?.map((a, i) => (
            <div key={a.user?._id || i} className="mtg-attendee-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="avatar-sm" style={{ background: getGrad(a.user?._id), width: 28, height: 28, fontSize: 10 }}>{initials(a.user?.name)}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{a.user?.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>{a.user?.jobTitle || a.user?.email}</div>
                </div>
              </div>
              <span className="mtg-response-badge" style={{ background: (responseColors[a.response] || 'var(--ink-3)') + '14', color: responseColors[a.response] || 'var(--ink-3)' }}>
                {a.isPresent ? '✓ Present' : a.response}
              </span>
            </div>
          ))}
        </div>
        {/* Quick Note attached to meeting */}
        <MeetingQuickNote meetingId={meeting._id} meetingTitle={meeting.title} />
      </div>

      {/* Task creation modal */}
      {showTaskModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setShowTaskModal(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 14, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Create Task from Meeting</div>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => setShowTaskModal(false)}>&times;</button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '8px 10px', background: 'rgba(99,102,241,0.06)', borderRadius: 6, border: '1px solid rgba(99,102,241,0.1)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>From Meeting</div>
                <div style={{ fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}>{meeting.title}</div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Task Title *</label>
                <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="What needs to be done?"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Priority</label>
                  <select value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }}>
                    <option value="top">Top</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Deadline</label>
                  <input type="date" value={taskForm.deadline} onChange={e => setTaskForm(p => ({ ...p, deadline: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Assign to (from attendees)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                  {meeting.attendees?.map(a => (
                    <div key={a.user?._id} onClick={() => {
                      setTaskForm(p => ({
                        ...p,
                        assignees: p.assignees.includes(a.user?._id)
                          ? p.assignees.filter(x => x !== a.user?._id)
                          : [...p.assignees, a.user?._id]
                      }));
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      background: taskForm.assignees.includes(a.user?._id) ? 'rgba(99,102,241,0.12)' : 'var(--glass)',
                      color: taskForm.assignees.includes(a.user?._id) ? '#6366F1' : 'var(--ink)',
                      border: `1px solid ${taskForm.assignees.includes(a.user?._id) ? 'rgba(99,102,241,0.3)' : 'var(--line)'}` }}>
                      {taskForm.assignees.includes(a.user?._id) ? '✓ ' : ''}{a.user?.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowTaskModal(false)}>Cancel</button>
              <button className="btn btn-primary-sm" onClick={createTaskFromMeeting} disabled={taskCreating || !taskForm.title.trim()}>
                {taskCreating ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MomEditor({ mom, onBack }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(mom.title);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(mom.isPublished);

  // Task from MoM — manual inline task card
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium', deadline: '', description: '' });
  const [taskCreating, setTaskCreating] = useState(false);

  // AI Extract Tasks
  const [aiTasks, setAiTasks] = useState(null); // null = not shown, [] = shown
  const [aiLoading, setAiLoading] = useState(false);
  const [acceptingAll, setAcceptingAll] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), Placeholder.configure({ placeholder: 'Write your meeting notes...' })],
    content: mom.tiptapJSON || { type: 'doc', content: [{ type: 'paragraph' }] },
  });

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await api.put(`/meetings/mom/${mom._id}`, { title, tiptapJSON: editor.getJSON() });
    } catch {} finally { setSaving(false); }
  };

  const publish = async () => {
    setSaving(true);
    try {
      await api.put(`/meetings/mom/${mom._id}`, { title, tiptapJSON: editor.getJSON(), isPublished: true });
      setPublished(true);
    } catch {} finally { setSaving(false); }
  };

  // Insert a task card into the MoM document AND create the actual task
  const insertTaskInMom = async () => {
    if (!taskForm.title.trim() || !editor) return;
    setTaskCreating(true);
    try {
      // Create the real task
      await api.post('/tasks', {
        title: taskForm.title,
        priority: taskForm.priority,
        deadline: taskForm.deadline || undefined,
        description: taskForm.description || `From MoM: ${title}`,
        sourceType: 'mom',
        sourceId: mom._id,
      });

      // Insert a styled task block into the editor
      const taskBlock = `\n📋 TASK: ${taskForm.title}\n  Priority: ${taskForm.priority.toUpperCase()}${taskForm.deadline ? ` | Deadline: ${taskForm.deadline}` : ''}${taskForm.description ? `\n  ${taskForm.description}` : ''}\n`;

      editor.chain().focus().insertContent([
        { type: 'horizontalRule' },
        { type: 'blockquote', content: [
          { type: 'paragraph', content: [
            { type: 'text', marks: [{ type: 'bold' }], text: `✅ TASK: ${taskForm.title}` }
          ]},
          { type: 'paragraph', content: [
            { type: 'text', text: `Priority: ${taskForm.priority.toUpperCase()}${taskForm.deadline ? ` | Deadline: ${taskForm.deadline}` : ''}` }
          ]},
          ...(taskForm.description ? [{ type: 'paragraph', content: [
            { type: 'text', marks: [{ type: 'italic' }], text: taskForm.description }
          ]}] : [])
        ]},
        { type: 'paragraph' }
      ]).run();

      // Auto-save after inserting
      await api.put(`/meetings/mom/${mom._id}`, { tiptapJSON: editor.getJSON() });

      setShowTaskForm(false);
      setTaskForm({ title: '', priority: 'medium', deadline: '', description: '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create task.');
    } finally { setTaskCreating(false); }
  };

  // AI: analyze MoM and extract tasks with full details
  const aiExtractTasks = async () => {
    if (!editor || !user.aiActive) {
      alert('AI not activated — go to Settings > API Configuration');
      return;
    }
    setAiLoading(true);
    try {
      const text = editor.getText();
      const { data } = await api.post('/ai/extract-tasks', { text });
      // data.tasks = [{ title, description, priority, assignee, deadline }, ...]
      const tasks = (data.tasks || []).map(t => ({
        ...t,
        title: t.title || 'Untitled task',
        priority: t.priority || 'medium',
        description: t.description || '',
        deadline: t.deadline || '',
        accepted: false,
        creating: false,
      }));
      setAiTasks(tasks);
    } catch (err) {
      alert(err.response?.data?.error || 'AI extraction failed.');
    } finally { setAiLoading(false); }
  };

  // Accept a single AI task
  const acceptAiTask = async (index) => {
    const tasks = [...aiTasks];
    const t = tasks[index];
    tasks[index] = { ...t, creating: true };
    setAiTasks(tasks);
    try {
      await api.post('/tasks', {
        title: t.title,
        priority: ['top','high','medium','low'].includes(t.priority) ? t.priority : 'medium',
        deadline: t.deadline || undefined,
        description: t.description || `AI-extracted from MoM: ${title}`,
        sourceType: 'mom',
        sourceId: mom._id,
      });

      // Insert into editor
      editor.chain().focus().insertContent([
        { type: 'blockquote', content: [
          { type: 'paragraph', content: [
            { type: 'text', marks: [{ type: 'bold' }], text: `✅ TASK: ${t.title}` }
          ]},
          { type: 'paragraph', content: [
            { type: 'text', text: `Priority: ${(t.priority || 'medium').toUpperCase()}${t.deadline ? ` | Deadline: ${t.deadline}` : ''}` }
          ]}
        ]}
      ]).run();

      tasks[index] = { ...t, accepted: true, creating: false };
      setAiTasks([...tasks]);
    } catch {
      tasks[index] = { ...t, creating: false };
      setAiTasks([...tasks]);
    }
  };

  // Accept all AI tasks at once
  const acceptAllAiTasks = async () => {
    setAcceptingAll(true);
    const tasks = [...aiTasks];
    for (let i = 0; i < tasks.length; i++) {
      if (!tasks[i].accepted) {
        await acceptAiTask(i);
        // Re-read latest state
        tasks[i] = { ...tasks[i], accepted: true };
      }
    }
    setAcceptingAll(false);
    // Auto-save
    await api.put(`/meetings/mom/${mom._id}`, { tiptapJSON: editor.getJSON() });
  };

  if (!editor) return null;

  const PRIORITY_DOTS = { top: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#10B981' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => { save(); onBack(); }}>← Back</button>
          <input value={title} onChange={e => setTitle(e.target.value)}
            style={{ fontSize: 18, fontWeight: 800, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--ink)' }} />
          {mom.type === 'scratchpad' && <span className="badge-pill" style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B' }}>Private Scratchpad</span>}
          {published && <span className="badge-pill" style={{ background: 'rgba(139,92,246,0.08)', color: '#8B5CF6' }}>Published</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary" style={{ color: '#10B981', borderColor: '#10B981', fontSize: 10, padding: '4px 10px' }}
            onClick={() => setShowTaskForm(!showTaskForm)}>
            + Add Task
          </button>
          <button className="btn btn-secondary" style={{ color: '#6366F1', borderColor: '#6366F1', fontSize: 10, padding: '4px 10px' }}
            onClick={aiExtractTasks} disabled={aiLoading}
            title={user.aiActive ? 'AI analyses notes and suggests tasks' : 'AI not activated'}>
            {aiLoading ? '...' : '✨ AI Extract Tasks'}
          </button>
          <button className="btn btn-secondary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          {!published && mom.type !== 'scratchpad' && (
            <button className="btn btn-primary-sm" onClick={publish}>Publish</button>
          )}
        </div>
      </div>

      {/* Manual task form — fills details, creates task AND inserts into notes */}
      {showTaskForm && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid #10B981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Add Task to Notes</div>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-3)' }} onClick={() => setShowTaskForm(false)}>&times;</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Task title *"
              style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', color: 'var(--ink)' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }}>
                <option value="top">Top Priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
              <input type="date" value={taskForm.deadline} onChange={e => setTaskForm(p => ({ ...p, deadline: e.target.value }))}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--glass)', color: 'var(--ink)' }} />
            </div>
            <input value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Description (optional)"
              style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', color: 'var(--ink)' }} />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => setShowTaskForm(false)}>Cancel</button>
              <button className="btn btn-primary-sm" style={{ fontSize: 10, padding: '4px 12px' }} onClick={insertTaskInMom}
                disabled={taskCreating || !taskForm.title.trim()}>
                {taskCreating ? 'Creating...' : 'Add Task & Insert in Notes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Extracted Tasks Panel */}
      {aiTasks !== null && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid #6366F1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              ✨ AI Suggested Tasks ({aiTasks.length})
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {aiTasks.some(t => !t.accepted) && (
                <button className="btn btn-primary-sm" style={{ fontSize: 10, padding: '4px 12px' }}
                  onClick={acceptAllAiTasks} disabled={acceptingAll}>
                  {acceptingAll ? 'Creating all...' : `Accept All (${aiTasks.filter(t => !t.accepted).length})`}
                </button>
              )}
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-3)' }}
                onClick={() => setAiTasks(null)}>&times;</button>
            </div>
          </div>

          {aiTasks.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', padding: '8px 0' }}>No tasks found in the notes. Try writing more action items.</div>
          )}

          {aiTasks.map((t, i) => (
            <div key={i} style={{
              padding: '10px 12px', marginBottom: 6, borderRadius: 8,
              background: t.accepted ? 'rgba(16,185,129,0.06)' : 'var(--glass)',
              border: `1px solid ${t.accepted ? 'rgba(16,185,129,0.2)' : 'var(--line)'}`,
              opacity: t.accepted ? 0.7 : 1
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOTS[t.priority] || '#F59E0B', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{t.title}</span>
                  </div>
                  {t.description && <div style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 4, lineHeight: 1.5 }}>{t.description}</div>}
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--ink-3)' }}>
                    <span>Priority: {(t.priority || 'medium').charAt(0).toUpperCase() + (t.priority || 'medium').slice(1)}</span>
                    {t.deadline && <span>Deadline: {t.deadline}</span>}
                    {t.assignee && <span>Assignee: {t.assignee}</span>}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {t.accepted ? (
                    <span style={{ fontSize: 10, color: '#10B981', fontWeight: 700 }}>✓ Created</span>
                  ) : (
                    <button className="btn btn-primary-sm" style={{ fontSize: 9, padding: '3px 10px' }}
                      onClick={() => acceptAiTask(i)} disabled={t.creating}>
                      {t.creating ? '...' : 'Accept'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ws-editor-wrap">
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

function MeetingQuickNote({ meetingId, meetingTitle }) {
  const [showForm, setShowForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/sticky-notes').then(r => {
      setNotes((r.data || []).filter(n => n.attachedTo?.some(a => a.entityType === 'meeting' && a.entityId === meetingId)));
    }).catch(() => {});
  }, [meetingId]);

  const createNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post('/sticky-notes', {
        title: `Note: ${meetingTitle}`,
        content: noteText.trim(),
        color: '#DBEAFE',
        attachedTo: [{ entityType: 'meeting', entityId: meetingId }]
      });
      setNotes(prev => [...prev, data]);
      setNoteText('');
      setShowForm(false);
    } catch {} finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: notes.length || showForm ? 8 : 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Notes ({notes.length})</div>
        <button className="btn btn-primary-sm" style={{ padding: '3px 8px', fontSize: 9 }} onClick={() => setShowForm(!showForm)}>+ Note</button>
      </div>
      {notes.map(n => (
        <div key={n._id} style={{ padding: '5px 8px', marginBottom: 3, borderRadius: 6, background: n.color || '#DBEAFE', fontSize: 10, color: '#1E293B', lineHeight: 1.5 }}>
          <div>{n.content}</div>
        </div>
      ))}
      {showForm && (
        <div>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Quick note..." rows={2}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'Inter', background: 'var(--glass)', outline: 'none', resize: 'vertical', color: 'var(--ink)', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end' }}>
            <button className="btn btn-primary-sm" style={{ padding: '3px 10px', fontSize: 9 }} onClick={createNote} disabled={saving || !noteText.trim()}>
              {saving ? '...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateMeeting({ users, userId, onBack, onCreated }) {
  const [form, setForm] = useState({ title: '', agenda: '', type: 'online', date: '', startTime: '', endTime: '', duration: '', location: '', meetingLink: '', attendeeIds: [] });
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
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Type *</label>
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
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label>Meeting Link (Google Meet / Zoom / Teams)</label>
            <input value={form.meetingLink} onChange={e => setForm(p => ({ ...p, meetingLink: e.target.value }))} placeholder="Paste your meeting link here, e.g. https://meet.google.com/abc-defg-hij" />
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>Paste the link from your video conferencing provider. Attendees will see this link on the meeting page.</div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Attendees *</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 8, maxHeight: 160, overflowY: 'auto' }}>
            {users.filter(u => u._id !== userId).map(u => (
              <div key={u._id} onClick={() => toggleAttendee(u._id)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  background: form.attendeeIds.includes(u._id) ? 'rgba(99,102,241,0.12)' : 'var(--glass)',
                  color: form.attendeeIds.includes(u._id) ? '#6366F1' : 'var(--ink)',
                  border: `1px solid ${form.attendeeIds.includes(u._id) ? 'rgba(99,102,241,0.3)' : 'var(--line)'}` }}>
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
