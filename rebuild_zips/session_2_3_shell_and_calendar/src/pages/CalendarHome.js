import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  GlassPanel, PrimaryButton, IconButton, SegmentedControl, GradientText,
  LiveDot, Icon,
} from '../design-system';
import './CalendarHome.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EVENT_TYPES = {
  meeting:  { label: 'Meeting',  cls: 'meeting'  },
  task:     { label: 'Task',     cls: 'task'     },
  leave:    { label: 'Leave',    cls: 'leave'    },
  half_day: { label: 'Half Day', cls: 'leave'    },
  holiday:  { label: 'Holiday',  cls: 'leave'    },
  activity: { label: 'Activity', cls: 'activity' },
  reminder: { label: 'Reminder', cls: 'task'     },
  custom:   { label: 'Event',    cls: 'task'     },
};

const PRIORITY_ACCENT = { top: 'top', high: 'high', medium: 'medium', low: 'low' };

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
function shortTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}

function useCountUp(target, durationMs = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const to = Number(target) || 0;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

export default function CalendarHome() {
  const { user } = useAuth();
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
    try { const { data } = await api.get('/attendance/today'); setTodayAtt(data); } catch {}
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

  // BUG FIX from audit: events are now clickable
  const openEvent = (ev) => {
    if (!ev) return;
    if (ev.type === 'meeting') navigate('/meetings');
    else if (ev.type === 'task') navigate('/tasks');
    else if (ev.type === 'activity') navigate('/activity');
    else if (ev.type === 'leave' || ev.type === 'half_day') navigate('/attendance');
  };

  const todayEvents = events.filter(ev => ev.date === dateStr(new Date()));
  const todayMeetings = todayEvents.filter(e => e.type === 'meeting').length;
  const todayTasks    = todayEvents.filter(e => e.type === 'task').length;
  const onLeaveCount  = events.filter(e => (e.type === 'leave' || e.type === 'half_day') && e.date === dateStr(new Date())).length;

  const weekRangeLabel =
    `${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ` +
    `${weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstName = (user?.name || '').split(' ')[0] || 'there';

  return (
    <div className="ad-cal">
      {/* Announcements */}
      {announcements.map((ann, idx) => (
        <div key={ann._id} className="ad-announce ad-enter" style={{ animationDelay: `${40 + idx * 40}ms` }}>
          <div className="ad-announce__icon"><Icon.Megaphone size={16} /></div>
          <div className="ad-announce__body">
            <div className="ad-announce__title">{ann.title}</div>
            <div className="ad-announce__content">
              {ann.content}
              {ann.createdBy?.name && <span className="ad-announce__by"> — {ann.createdBy.name}</span>}
            </div>
          </div>
          <IconButton size="sm" title="Dismiss" onClick={() => dismissAnnouncement(ann._id)}>
            <Icon.X size={14} />
          </IconButton>
        </div>
      ))}

      {/* Greeting */}
      <section className="ad-cal__greeting ad-enter" style={{ animationDelay: '80ms' }}>
        <div>
          <div className="ad-cal__date-tag ad-label">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <h1 className="ad-cal__hello">
            Hi <GradientText>{firstName}</GradientText>{' '}
            <span className="ad-cal__wave" aria-hidden="true">👋</span>
          </h1>
          <p className="ad-cal__sub">
            You have <strong>{todayMeetings} meeting{todayMeetings !== 1 && 's'}</strong>
            {' '}and <strong>{todayTasks} task{todayTasks !== 1 && 's'}</strong> today.
          </p>
        </div>
        <div className="ad-cal__cta-row">
          <PrimaryButton icon={<Icon.Plus size={14} />} onClick={() => navigate('/attendance')}>
            Mark entry
          </PrimaryButton>
        </div>
      </section>

      {/* Attendance strip */}
      <GlassPanel elevated className="ad-cal__att ad-enter" style={{ animationDelay: '100ms' }}>
        <div className={`ad-cal__att-item ${todayAtt?.entryTime ? 'ad-cal__att-item--done' : ''}`}>
          <span className="ad-cal__att-check">
            {todayAtt?.entryTime ? <Icon.CheckCircle size={14} /> : <Icon.Clock size={14} />}
          </span>
          <span>Entry</span>
          <strong>{todayAtt?.entryTime ? shortTime(todayAtt.entryTime) : '— not marked'}</strong>
        </div>
        <span className="ad-cal__att-sep" />
        <div className={`ad-cal__att-item ${todayAtt?.wrapUpTime ? 'ad-cal__att-item--done' : ''}`}>
          <span className="ad-cal__att-check">
            {todayAtt?.wrapUpTime ? <Icon.CheckCircle size={14} /> : <Icon.Clock size={14} />}
          </span>
          <span>Wrap up</span>
          <strong>{todayAtt?.wrapUpTime ? shortTime(todayAtt.wrapUpTime) : '— pending'}</strong>
        </div>
        {adminMode && (
          <div className="ad-cal__att-adminchip">
            <Icon.Shield size={12} /> Admin view
          </div>
        )}
      </GlassPanel>

      {/* Toolbar */}
      <GlassPanel elevated className="ad-cal__toolbar ad-enter" style={{ animationDelay: '120ms' }}>
        <div className="ad-cal__nav">
          <IconButton title="Previous" onClick={prevPeriod}><Icon.ChevronLeft size={16} /></IconButton>
          <div className="ad-cal__period-label">
            {view === 'monthly' ? monthLabel : view === 'daily' ? currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : weekRangeLabel}
          </div>
          <IconButton title="Next" onClick={nextPeriod}><Icon.ChevronRight size={16} /></IconButton>
          <button type="button" className="ad-cal__today-btn ad-focus" onClick={goToday}>Today</button>
        </div>
        <div className="ad-cal__toolbar-right">
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { key: 'daily',   label: 'Day'   },
              { key: 'weekly',  label: 'Week'  },
              { key: 'monthly', label: 'Month' },
            ]}
          />
          <span className="ad-cal__sep" />
          <div className="ad-cal__legend">
            <span className="ad-cal__legend-item"><span className="ad-legend-dot ad-legend-dot--meeting" />Meeting</span>
            <span className="ad-cal__legend-item"><span className="ad-legend-dot ad-legend-dot--task" />Task</span>
            <span className="ad-cal__legend-item"><span className="ad-legend-dot ad-legend-dot--leave" />Leave</span>
            <span className="ad-cal__legend-item"><span className="ad-legend-dot ad-legend-dot--activity" />Activity</span>
          </div>
        </div>
      </GlassPanel>

      {/* Views */}
      {view === 'weekly' && (
        <WeeklyGrid
          dates={weekDates}
          getEvents={getEventsForDate}
          openEvent={openEvent}
          onSelectDay={(d) => { setCurrentDate(d); setView('daily'); }}
        />
      )}
      {view === 'monthly' && (
        <MonthlyGrid
          currentDate={currentDate}
          getEvents={getEventsForDate}
          openEvent={openEvent}
          onSelectDay={(d) => { setCurrentDate(d); setView('daily'); }}
        />
      )}
      {view === 'daily' && (
        <DailyAgenda
          date={currentDate}
          events={getEventsForDate(currentDate)}
          openEvent={openEvent}
        />
      )}

      {/* Bottom row */}
      <section className="ad-cal__bottom ad-enter" style={{ animationDelay: '200ms' }}>
        <GlassPanel elevated className="ad-cal__focus">
          <header className="ad-cal__focus-head">
            <div className="ad-cal__focus-title">
              <span className="ad-label">Today's Focus</span>
              <LiveDot />
            </div>
            <button type="button" className="ad-cal__focus-all ad-focus" onClick={() => setView('daily')}>
              View all <Icon.ArrowRight size={12} />
            </button>
          </header>
          <FocusList events={todayEvents.slice(0, 5)} openEvent={openEvent} />
          <div className="ad-cal__focus-stats">
            <StatTile value={todayMeetings} label="Meetings" />
            <StatTile value={todayTasks} label="Tasks due" />
            <StatTile value={onLeaveCount} label="On leave" />
          </div>
        </GlassPanel>

        <GlassPanel elevated className="ad-cal__progress">
          <header className="ad-cal__progress-head">
            <span className="ad-label">Progress</span>
          </header>
          <div className="ad-cal__rings">
            <ProgressRing
              value={Math.round((todayEvents.filter(e => e.type === 'task' && e.status === 'done').length / Math.max(1, todayTasks)) * 100)}
              label="Tasks"
              colorFrom="#6366F1"
              colorTo="#8B5CF6"
            />
            <ProgressRing
              value={todayAtt?.entryTime ? 100 : 0}
              label="Today"
              colorFrom="#10B981"
              colorTo="#06B6D4"
            />
          </div>
        </GlassPanel>
      </section>
    </div>
  );
}

function WeeklyGrid({ dates, getEvents, openEvent, onSelectDay }) {
  return (
    <GlassPanel elevated className="ad-cal__grid ad-enter" style={{ animationDelay: '160ms' }}>
      <div className="ad-cal__week">
        {dates.map((d) => {
          const evts = getEvents(d);
          const today = isToday(d);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={dateStr(d)}
              className={`ad-cal__day ${today ? 'ad-cal__day--today' : ''} ${weekend ? 'ad-cal__day--weekend' : ''}`}
              onClick={() => onSelectDay(d)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDay(d); } }}
            >
              <header className="ad-cal__day-header">
                <span className="ad-label">{DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]}</span>
                <span className="ad-cal__day-num">{d.getDate()}</span>
              </header>
              <div className="ad-cal__day-events">
                {evts.slice(0, 4).map((ev, i) => (
                  <EventChip key={ev._id || i} event={ev} onClick={(e) => { e.stopPropagation(); openEvent(ev); }} />
                ))}
                {evts.length > 4 && <div className="ad-cal__day-more">+{evts.length - 4} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

function MonthlyGrid({ currentDate, getEvents, openEvent, onSelectDay }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDayOfWeek = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <GlassPanel elevated className="ad-cal__grid ad-enter" style={{ animationDelay: '160ms' }}>
      <div className="ad-cal__month-heading">
        {DAYS.map(d => <span key={d} className="ad-label">{d}</span>)}
      </div>
      <div className="ad-cal__month">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="ad-cal__month-cell ad-cal__month-cell--empty" />;
          const evts = getEvents(d);
          const today = isToday(d);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={dateStr(d)}
              className={`ad-cal__month-cell ${today ? 'ad-cal__day--today' : ''} ${weekend ? 'ad-cal__day--weekend' : ''}`}
              onClick={() => onSelectDay(d)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDay(d); } }}
            >
              <div className="ad-cal__day-num ad-cal__day-num--sm">{d.getDate()}</div>
              <div className="ad-cal__month-dots">
                {evts.slice(0, 5).map((ev, idx) => {
                  const t = EVENT_TYPES[ev.type] || EVENT_TYPES.custom;
                  return <span key={idx} className={`ad-legend-dot ad-legend-dot--${t.cls}`} />;
                })}
                {evts.length > 5 && <span className="ad-cal__month-more">+{evts.length - 5}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

function DailyAgenda({ date, events, openEvent }) {
  const sorted = [...events].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  return (
    <GlassPanel elevated className="ad-cal__daily ad-enter" style={{ animationDelay: '160ms' }}>
      <header className="ad-cal__daily-head">
        <span className="ad-label">Agenda</span>
        <span className="ad-cal__daily-date">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </header>
      {sorted.length === 0 ? (
        <div className="ad-cal__daily-empty">Nothing scheduled for this day.</div>
      ) : (
        <ul className="ad-cal__daily-list">
          {sorted.map((ev, i) => (
            <li key={ev._id || i} className="ad-cal__daily-row" onClick={() => openEvent(ev)}>
              <span className="ad-cal__daily-time">{ev.startTime || '—'}</span>
              <EventChip event={ev} compact={false} />
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

function EventChip({ event, onClick, compact = true }) {
  const t = EVENT_TYPES[event.type] || EVENT_TYPES.custom;
  const prio = event.priority && PRIORITY_ACCENT[event.priority];
  const cls = `ad-chip ad-chip--${t.cls} ${prio ? `ad-chip--prio-${prio}` : ''}`;
  return (
    <button type="button" className={`${cls} ad-focus`} onClick={onClick}>
      <span className="ad-chip__rail" />
      <span className="ad-chip__title">{event.title || t.label}</span>
      {event.startTime && compact && <span className="ad-chip__time">{event.startTime}</span>}
    </button>
  );
}

function FocusList({ events, openEvent }) {
  if (!events || events.length === 0) {
    return <div className="ad-cal__focus-empty">No items for today.</div>;
  }
  return (
    <ul className="ad-cal__focus-list">
      {events.map((ev, i) => {
        const t = EVENT_TYPES[ev.type] || EVENT_TYPES.custom;
        return (
          <li key={ev._id || i} className="ad-cal__focus-row" onClick={() => openEvent(ev)}>
            <span className="ad-mini-check" />
            <div className="ad-cal__focus-row-body">
              <div className="ad-cal__focus-row-title">{ev.title || t.label}</div>
              <div className="ad-cal__focus-row-meta">
                {ev.startTime ? `${ev.startTime} · ` : ''}{t.label}
              </div>
            </div>
            <span className={`ad-pill-mini ad-pill-mini--${t.cls}`}>{t.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function StatTile({ value, label }) {
  const v = useCountUp(value || 0);
  return (
    <div className="ad-stat-tile">
      <div className="ad-stat-tile__num ad-tnum">{v}</div>
      <div className="ad-stat-tile__lbl">{label}</div>
    </div>
  );
}

function ProgressRing({ value = 0, label = '', colorFrom = '#6366F1', colorTo = '#8B5CF6' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const displayed = useCountUp(pct);
  const r = 50, C = 2 * Math.PI * r;
  const offset = C - (pct / 100) * C;
  const gradId = `g-${label}`.replace(/\s+/g, '');
  return (
    <div className="ad-cal__ring-wrap">
      <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colorFrom} />
            <stop offset="100%" stopColor={colorTo} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="ad-cal__ring-track" />
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s var(--ad-ease)', filter: `drop-shadow(0 0 10px ${colorFrom}80)` }}
        />
      </svg>
      <div className="ad-cal__ring-center">
        <div className="ad-cal__ring-val ad-tnum">{displayed}%</div>
        <div className="ad-cal__ring-lbl ad-label">{label}</div>
      </div>
    </div>
  );
}
