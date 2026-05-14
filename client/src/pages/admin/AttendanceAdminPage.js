import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

const todayStr = () => new Date().toISOString().split('T')[0];
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';

export default function AttendanceAdminPage() {
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState({ marked: [], unmarked: [] });
  const [loading, setLoading] = useState(false);

  // Wrap-up override
  const [showWrap, setShowWrap] = useState(false);
  const [wrapTime, setWrapTime] = useState('17:00');
  const [wrapMsg, setWrapMsg] = useState('');
  const [wrapBusy, setWrapBusy] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ entryTime: '', wrapUpTime: '', status: 'present' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/team', { params: { date } });
      setData(data);
    } catch {}
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const sendEarlyWrapUp = async () => {
    if (!wrapTime.match(/^\d{2}:\d{2}$/)) { alert('Time must be HH:MM (24h)'); return; }
    if (!window.confirm(`Wrap up everyone still active and notify all employees that wrap-up is at ${wrapTime}?`)) return;
    setWrapBusy(true);
    try {
      const r = await api.post('/attendance/early-wrap-up', { time: wrapTime, message: wrapMsg.trim() || undefined });
      alert(`✓ Wrapped up ${r.data.wrappedCount} employees. Notified ${r.data.notifiedCount}.`);
      setShowWrap(false);
      load();
    } catch (e) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    }
    setWrapBusy(false);
  };

  const openEdit = (rec) => {
    setEditTarget(rec);
    setEditForm({
      entryTime: rec.entryTime ? new Date(rec.entryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
      wrapUpTime: rec.wrapUpTime ? new Date(rec.wrapUpTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
      status: rec.status || 'present'
    });
  };

  const saveEdit = async () => {
    try {
      const body = { userId: editTarget.user._id, date, status: editForm.status };
      if (editForm.entryTime) body.entryTime = `${date}T${editForm.entryTime}:00`;
      if (editForm.wrapUpTime) body.wrapUpTime = `${date}T${editForm.wrapUpTime}:00`;
      await api.put('/attendance/edit-timing', body);
      setEditTarget(null);
      load();
    } catch (e) {
      const status = e.response?.status || '?';
      const detail = e.response?.data?.error || e.response?.statusText || e.message;
      alert(`Save failed (HTTP ${status})\n\n${detail}`);
    }
  };

  const presentCount = data.marked.filter(r => r.status === 'present').length;
  const lateCount = data.marked.filter(r => r.entryTime && new Date(r.entryTime).getHours() >= 10).length;
  const wrappedCount = data.marked.filter(r => r.wrapUpTime).length;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Attendance — Day View</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} max={todayStr()}
            style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, background: 'var(--bg-1)', color: 'var(--ink)' }} />
          <button onClick={load} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>🔄</button>
          {date === todayStr() && (
            <button onClick={() => setShowWrap(true)}
              style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: '#fff', cursor: 'pointer' }}>
              🕒 Early Wrap-Up
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="adm-att-stats">
        <Stat label="Present" value={presentCount} color="#10B981" />
        <Stat label="Late (≥ 10:00)" value={lateCount} color="#F59E0B" />
        <Stat label="Wrapped Up" value={wrappedCount} color="#6366F1" />
        <Stat label="Not Marked" value={data.unmarked.length} color="#EF4444" />
      </div>

      {/* Marked */}
      <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
          Present ({data.marked.length})
        </div>
        <div className="adm-att-row adm-att-head">
          <span>Name</span><span>Entry</span><span>Wrap-Up</span><span>Hours</span><span>Method</span><span></span>
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>Loading…</div>
        ) : data.marked.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>No records.</div>
        ) : data.marked.map(r => (
          <div key={r._id} className="adm-att-row">
            <div className="adm-att-name">
              <div style={{ fontWeight: 600 }}>{r.user?.name}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{r.user?.jobTitle || ''}</div>
            </div>
            <span className="adm-att-entry" data-label="Entry">{fmtTime(r.entryTime)}</span>
            <span className="adm-att-wrap" data-label="Wrap-up">{fmtTime(r.wrapUpTime)}</span>
            <span data-label="Hours">{r.totalHours ? r.totalHours + 'h' : '—'}</span>
            <span className="adm-att-method" data-label="Method">{r.verificationMethod || '—'}</span>
            <button onClick={() => openEdit(r)} className="adm-att-edit-btn">Edit</button>
          </div>
        ))}
      </div>

      {/* Unmarked */}
      <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
          Not Marked ({data.unmarked.length})
        </div>
        {data.unmarked.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>Everyone has marked entry. 🎉</div>
        ) : data.unmarked.map(u => (
          <div key={u._id} style={{ padding: '10px 14px', fontSize: 12, borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{u.name}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{u.jobTitle || u.email}</div>
            </div>
            <button onClick={() => openEdit({ user: u, status: 'present' })} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 6, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>Manual mark</button>
          </div>
        ))}
      </div>

      {/* Wrap-up modal */}
      {showWrap && (
        <Modal onClose={() => setShowWrap(false)} title="Set Today's Early Wrap-Up">
          <p style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 0 }}>
            Wraps up every employee currently still active, sets their wrap-up time to <strong>now</strong>, and notifies everyone.
          </p>
          <Field label="Wrap-up time (HH:MM, displayed in the message)">
            <input value={wrapTime} onChange={e => setWrapTime(e.target.value)} placeholder="17:00"
              style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', color: 'var(--ink)', fontSize: 13, width: 120 }} />
          </Field>
          <Field label="Custom message (optional)">
            <textarea value={wrapMsg} onChange={e => setWrapMsg(e.target.value)} rows={3}
              placeholder="e.g. Festival closure — please pack up by 4pm. Stay safe!"
              style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', color: 'var(--ink)', fontSize: 12, fontFamily: 'Inter,sans-serif', resize: 'vertical', boxSizing: 'border-box' }} />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={() => setShowWrap(false)} style={{ padding: '8px 14px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            <button onClick={sendEarlyWrapUp} disabled={wrapBusy}
              style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: '#fff', cursor: wrapBusy ? 'wait' : 'pointer' }}>
              {wrapBusy ? 'Sending…' : 'Wrap Up & Notify'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal onClose={() => setEditTarget(null)} title={`Edit — ${editTarget.user.name}`}>
          <Field label="Entry time (HH:MM 24h)">
            <input value={editForm.entryTime} onChange={e => setEditForm(p => ({ ...p, entryTime: e.target.value }))}
              placeholder="09:30" style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', color: 'var(--ink)', fontSize: 13, width: 120, fontFamily: 'monospace' }} />
          </Field>
          <Field label="Wrap-up time (HH:MM 24h)">
            <input value={editForm.wrapUpTime} onChange={e => setEditForm(p => ({ ...p, wrapUpTime: e.target.value }))}
              placeholder="18:30" style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', color: 'var(--ink)', fontSize: 13, width: 120, fontFamily: 'monospace' }} />
          </Field>
          <Field label="Status">
            <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
              style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', color: 'var(--ink)', fontSize: 13 }}>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
              <option value="half_day">Half Day</option>
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={() => setEditTarget(null)} style={{ padding: '8px 14px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            <button onClick={saveEdit} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', cursor: 'pointer' }}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, color, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Modal({ children, onClose, title }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 998 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(540px, 92vw)', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: '0 12px 48px rgba(0,0,0,0.5)', zIndex: 999, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--ink-3)', cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </>
  );
}
