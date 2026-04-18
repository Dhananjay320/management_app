import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/calendar.css';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
// Date event colors per spec Section 5.2.1
const EVENT_COLORS = {
  leave: '#EF4444',      // Red
  half_day: '#F97316',   // Orange
  holiday: '#7C3AED',    // Purple (distinct from meeting)
  task: '#3B82F6',       // Blue (spec says Blue for tasks)
  activity: '#F59E0B',   // Yellow
  meeting: '#8B5CF6',    // Indigo-purple
  reminder: '#06B6D4',
  custom: '#64748B'
};
// Task priority colors per spec Section 5.2.2
const PRIORITY_COLORS = {
  top: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#10B981'
};
// Priority rank for monthly view (lower = higher priority to display)
const EVENT_PRIORITY_RANK = { leave: 1, half_day: 2, holiday: 3, task: 4, activity: 5, meeting: 4, custom: 6 };
// Compat alias
// eslint-disable-next-line no-unused-vars
const _COLORS = { ...EVENT_COLORS, ...PRIORITY_COLORS };

function getWeekDates(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return dt;
  });
}

function dateStr(d) { return d.toISOString().split('T')[0]; }
function isToday(d) { return dateStr(d) === dateStr(new Date()); }

export default function CalendarHome() {
  // eslint-disable-next-line no-unused-vars
  const { user: _user } = useAuth();
  const { adminMode } = useOutletContext();
  const navigate = useNavigate();
  const [view, setView] = useState('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [, setAttendance] = useState([]);
  const [todayAtt, setTodayAtt] = useState(null);
  const [announcements, setAnnouncements] = useState([]);

  const weekDates = getWeekDates(currentDate);
  const startDate = dateStr(weekDates[0]);
  const endDate = dateStr(weekDates[6]);

  const loadEvents = useCallback(async () => {
    try {
      let s = startDate, e = endDate;
      if (view === 'monthly') {
        const y = currentDate.getFullYear(), m = currentDate.getMonth();
        s = dateStr(new Date(y, m, 1));
        e = dateStr(new Date(y, m + 1, 0));
      }
      const { data } = await api.get(`/calendar/events?start=${s}&end=${e}`);
      setEvents(data.events || []);
      setAttendance(data.attendance || []);
    } catch {}
  }, [startDate, endDate, view, currentDate]);

  const loadToday = useCallback(async () => {
    try {
      const { data } = await api.get('/attendance/today');
      setTodayAtt(data);
    } catch {}
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try { const { data } = await api.get('/announcements'); setAnnouncements(data); } catch {}
  }, []);

  useEffect(() => { loadEvents(); loadToday(); loadAnnouncements(); }, [loadEvents, loadToday, loadAnnouncements]);

  const dismissAnnouncement = async (id) => {
    try { await api.put(`/announcements/${id}/dismiss`); setAnnouncements(prev => prev.filter(a => a._id !== id)); } catch {}
  };

  const getEventsForDate = (d) => events.filter(ev => ev.date === dateStr(d));

  const prevPeriod = () => {
    const d = new Date(currentDate);
    if (view === 'monthly') d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const nextPeriod = () => {
    const d = new Date(currentDate);
    if (view === 'monthly') d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };
  const goToday = () => setCurrentDate(new Date());

  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Admin stats */}
      {adminMode && (
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-card-label">Team Attendance</div><div className="stat-card-value" style={{ color: '#10B981' }}>92%</div></div>
          <div className="stat-card"><div className="stat-card-label">Pending Approvals</div><div className="stat-card-value" style={{ color: '#F59E0B' }}>3</div></div>
          <div className="stat-card"><div className="stat-card-label">Active Tasks</div><div className="stat-card-value" style={{ color: '#6366F1' }}>47</div></div>
        </div>
      )}

      {/* Announcement Banners — per spec Section 13.1 */}
      {announcements.map(ann => (
        <div key={ann._id} style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))',
          border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 18 }}>📢</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E293B' }}>{ann.title}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>{ann.content}</div>
          </div>
          <span style={{ fontSize: 9, color: '#94A3B8' }}>by {ann.createdBy?.name}</span>
          <button onClick={() => dismissAnnouncement(ann._id)} style={{
            background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16, padding: 2
          }}>&times;</button>
        </div>
      ))}

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div className="page-title">{monthLabel}</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 14 }} onClick={prevPeriod}>←</button>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={goToday}>Today</button>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 14 }} onClick={nextPeriod}>→</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="chip-group">
            {['weekly','monthly','daily'].map(v => (
              <div key={v} className={`chip ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </div>
            ))}
          </div>
          <button className="btn btn-primary-sm" onClick={() => navigate('/attendance')}>Mark Entry</button>
        </div>
      </div>

      {/* Attendance bar */}
      <div className="cal-attendance-bar">
        <div className={`cal-att-item ${todayAtt?.entryTime ? 'done' : 'pending'}`}>
          {todayAtt?.entryTime ? '✓' : '○'} Entry: {todayAtt?.entryTime ? new Date(todayAtt.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Not marked'}
        </div>
        <div className={`cal-att-item ${todayAtt?.wrapUpTime ? 'done' : 'pending'}`}>
          {todayAtt?.wrapUpTime ? '✓' : '○'} Wrap Up: {todayAtt?.wrapUpTime ? new Date(todayAtt.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
        </div>
      </div>

      {/* Views */}
      {view === 'weekly' && <WeeklyView dates={weekDates} getEvents={getEventsForDate} />}
      {view === 'monthly' && <MonthlyView currentDate={currentDate} getEvents={getEventsForDate} events={events} setView={setView} setCurrentDate={setCurrentDate} />}
      {view === 'daily' && <DailyView date={currentDate} events={getEventsForDate(currentDate)} todayAtt={todayAtt} />}
    </div>
  );
}

function WeeklyView({ dates, getEvents }) {
  return (
    <div className="cal-week-grid">
      {dates.map(d => {
        const evts = getEvents(d);
        const today = isToday(d);
        return (
          <div key={dateStr(d)} className={`cal-day ${today ? 'today' : ''}`}>
            <div className="cal-day-header">
              <div className="cal-day-name">{DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
              <div className="cal-day-number">{d.getDate()}</div>
              {today && <div className="cal-today-dot" />}
            </div>
            {evts.map((ev, i) => {
              // Per spec: tasks are Blue blocks with priority color dot inside
              const isTask = ev.type === 'task';
              const eventCol = EVENT_COLORS[ev.type] || '#3B82F6';
              const priorityCol = ev.priority ? PRIORITY_COLORS[ev.priority] : null;
              return (
                <div key={i} className="cal-event" style={{ background: eventCol + '0D', borderLeft: `2px solid ${eventCol}` }}>
                  <div className="cal-event-title" style={{ color: eventCol }}>
                    {isTask && priorityCol && (
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: priorityCol, marginRight: 4, verticalAlign: 'middle' }} />
                    )}
                    {ev.title}
                  </div>
                  {ev.startTime && <div className="cal-event-time" style={{ color: eventCol }}>{ev.startTime}</div>}
                  {!ev.startTime && ev.type && <div className="cal-event-time" style={{ color: eventCol }}>{ev.type}</div>}
                </div>
              );
            })}
            {evts.length === 0 && today && (
              <div style={{ fontSize: 10, color: '#CBD5E1', textAlign: 'center', marginTop: 20 }}>No events</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthlyView({ currentDate, events, setView, setCurrentDate }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7; // Monday-based

  const days = [];
  // Pad start
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, otherMonth: true });
  }
  // Month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), otherMonth: false });
  }
  // Pad end
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - startPad - lastDay.getDate() + 1);
    days.push({ date: d, otherMonth: true });
  }

  const clickDay = (d) => {
    setCurrentDate(d.date);
    setView('daily');
  };

  return (
    <div className="cal-month-grid">
      {DAYS.map(d => <div key={d} className="cal-month-header">{d}</div>)}
      {days.map((d, i) => {
        const ds = dateStr(d.date);
        const dayEvents = events.filter(e => e.date === ds);
        const today = isToday(d.date);
        return (
          <div key={i} className={`cal-month-day ${today ? 'today' : ''} ${d.otherMonth ? 'other-month' : ''}`} onClick={() => clickDay(d)}>
            <div className="cal-month-day-num">{d.date.getDate()}</div>
            {/* Spec: Monthly shows ONE event — highest priority (leave > half_day > holiday > task > activity) */}
            {dayEvents.length > 0 && (() => {
              const sorted = [...dayEvents].sort((a, b) => (EVENT_PRIORITY_RANK[a.type] || 9) - (EVENT_PRIORITY_RANK[b.type] || 9));
              const top = sorted[0];
              const col = EVENT_COLORS[top.type] || '#3B82F6';
              return (
                <div className="cal-month-event" style={{ background: col + '14', color: col, borderLeft: `2px solid ${col}` }}>
                  {top.title}
                </div>
              );
            })()}
            {dayEvents.length > 1 && <div className="cal-month-more">+{dayEvents.length - 1} more</div>}
          </div>
        );
      })}
    </div>
  );
}

function DailyView({ date, events, todayAtt }) {
  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM

  // Separate tasks (for priority grouping) from timed events
  const timedEvents = events.filter(ev => ev.startTime);
  const tasks = events.filter(ev => ev.type === 'task');
  const priorityGroups = ['top', 'high', 'medium', 'low'];

  return (
    <div className="cal-daily">
      <div className="cal-daily-timeline">
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          {isToday(date) && <span className="badge-pill" style={{ marginLeft: 8, background: 'rgba(99,102,241,0.08)', color: '#6366F1' }}>Today</span>}
        </div>

        {/* Time blocks */}
        {hours.map(h => {
          const timeLabel = `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`;
          const hourEvents = timedEvents.filter(ev => {
            const evHour = parseInt(ev.startTime.split(':')[0]);
            return evHour === h;
          });
          return (
            <div key={h} className="cal-time-slot">
              <div className="cal-time-label">{timeLabel}</div>
              <div style={{ flex: 1 }}>
                {hourEvents.map((ev, i) => {
                  const col = EVENT_COLORS[ev.type] || '#3B82F6';
                  return (
                    <div key={i} className="cal-time-event" style={{ background: col + '0A', borderLeft: `3px solid ${col}` }}>
                      <div className="cal-time-event-title" style={{ color: '#1E293B' }}>{ev.title}</div>
                      <div className="cal-time-event-sub" style={{ color: '#94A3B8' }}>
                        {ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ''} · {ev.type}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Tasks grouped by priority (per spec Section 5.3) */}
        {tasks.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>Tasks by Priority</div>
            {priorityGroups.map(p => {
              const groupTasks = tasks.filter(t => t.priority === p);
              if (groupTasks.length === 0) return null;
              const pCol = PRIORITY_COLORS[p];
              return (
                <div key={p} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: pCol, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {p} Priority
                  </div>
                  {groupTasks.map((t, i) => (
                    <div key={i} className="cal-time-event" style={{ background: '#3B82F60A', borderLeft: `3px solid #3B82F6`, marginBottom: 4 }}>
                      <div className="cal-time-event-title" style={{ color: '#1E293B' }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: pCol, marginRight: 6 }} />
                        {t.title}
                      </div>
                      {t.deadline && <div className="cal-time-event-sub" style={{ color: '#94A3B8' }}>Due: {t.deadline}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="cal-daily-sidebar">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#1E293B' }}>Today's Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SummaryItem label="Events" value={events.length} color="#6366F1" />
            <SummaryItem label="Tasks" value={events.filter(e => e.type === 'task').length} color="#EF4444" />
            <SummaryItem label="Meetings" value={events.filter(e => e.type === 'meeting').length} color="#8B5CF6" />
          </div>
        </div>
        {todayAtt?.entryTime && (
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#1E293B' }}>Attendance</div>
            <div style={{ fontSize: 11, color: '#10B981', marginBottom: 4 }}>✓ Entry: {new Date(todayAtt.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            {todayAtt.wrapUpTime && <div style={{ fontSize: 11, color: '#8B5CF6' }}>✓ Wrap Up: {new Date(todayAtt.wrapUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>}
            {todayAtt.totalHours > 0 && <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>Total: {todayAtt.totalHours}h</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryItem({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#64748B' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
