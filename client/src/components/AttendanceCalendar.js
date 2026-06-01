import { useMemo, useState } from 'react';

// Color-coded month grid + summary row.
//   - history: array of attendance records [{ date, status, entryTime, wrapUpTime, totalHours }]
//   - lateAfterHour: hour cutoff (24h) above which an "on-time" present day is shown as Late
//
// Status colours follow the OjasTrack spec: green/yellow/red/blue/grey.
// Days outside the displayed month are dimmed but kept in the grid for layout.

const COLOURS = {
  present:   { bg: 'rgba(16,185,129,0.18)',  border: 'rgba(16,185,129,0.45)',  ink: '#10B981', label: 'Present' },
  late:      { bg: 'rgba(245,158,11,0.18)',  border: 'rgba(245,158,11,0.45)',  ink: '#F59E0B', label: 'Late' },
  half_day:  { bg: 'rgba(251,191,36,0.18)',  border: 'rgba(251,191,36,0.45)',  ink: '#FBBF24', label: 'Half day' },
  absent:    { bg: 'rgba(239,68,68,0.16)',   border: 'rgba(239,68,68,0.40)',   ink: '#EF4444', label: 'Absent' },
  leave:     { bg: 'rgba(6,182,212,0.18)',   border: 'rgba(6,182,212,0.45)',   ink: '#06B6D4', label: 'Leave' },
  holiday:   { bg: 'rgba(139,92,246,0.16)',  border: 'rgba(139,92,246,0.40)',  ink: '#8B5CF6', label: 'Holiday' },
  weekend:   { bg: 'transparent',            border: 'var(--line)',            ink: 'var(--ink-4)', label: 'Weekend' },
  empty:     { bg: 'transparent',            border: 'var(--line)',            ink: 'var(--ink-4)', label: '—' }
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function classify(r, lateAfterHour) {
  if (!r) return 'empty';
  if (r.status === 'leave') return 'leave';
  if (r.status === 'holiday') return 'holiday';
  if (r.status === 'half_day') return 'half_day';
  if (r.status === 'weekend') return 'weekend';
  if (r.status === 'absent' || r.status === 'not_marked') return 'absent';
  if (r.status === 'present' && r.entryTime) {
    const h = new Date(r.entryTime).getHours();
    if (h >= lateAfterHour) return 'late';
    return 'present';
  }
  return r.status;
}

export default function AttendanceCalendar({ history = [], lateAfterHour = 10 }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });

  // Build map: 'YYYY-MM-DD' → record
  const recordByDate = useMemo(() => {
    const m = {};
    history.forEach(r => { if (r.date) m[r.date] = r; });
    return m;
  }, [history]);

  // Days of the current cursor month + leading blanks for week alignment
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // pad trailing so we always render full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  // Summary counts for the displayed month
  const summary = useMemo(() => {
    const c = { present: 0, late: 0, half_day: 0, absent: 0, leave: 0, holiday: 0, weekend: 0, total: 0 };
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cls = classify(recordByDate[ymd], lateAfterHour);
      if (cls && c[cls] !== undefined) c[cls]++;
      c.total++;
    }
    return c;
  }, [recordByDate, year, month, daysInMonth, lateAfterHour]);

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = isCurrentMonth ? today.getDate() : null;

  const shiftMonth = (delta) => {
    const d = new Date(cursor); d.setMonth(d.getMonth() + delta); d.setDate(1);
    setCursor(d);
  };

  return (
    <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      {/* Header: month + nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => shiftMonth(-1)}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>‹</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{monthLabel}</div>
          <button onClick={() => shiftMonth(1)}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>›</button>
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
        {[
          ['present',  summary.present],
          ['late',     summary.late],
          ['half_day', summary.half_day],
          ['absent',   summary.absent],
          ['leave',    summary.leave],
          ['holiday',  summary.holiday]
        ].map(([k, n]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOURS[k].ink }} />
            <span style={{ color: 'var(--ink-2)' }}>{COLOURS[k].label}</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{n}</span>
          </div>
        ))}
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} style={{ height: 56 }} />;
          const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const r = recordByDate[ymd];
          const cls = classify(r, lateAfterHour);
          const c = COLOURS[cls] || COLOURS.empty;
          const isToday = todayDate === day;
          const dow = new Date(year, month, day).getDay();
          const isWeekend = !r && (dow === 0 || dow === 6);
          const visual = isWeekend ? COLOURS.weekend : c;

          return (
            <div key={idx}
              title={r
                ? `${ymd} · ${COLOURS[cls]?.label || cls}${r.entryTime ? ' · in ' + new Date(r.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}${r.totalHours ? ' · ' + r.totalHours + 'h' : ''}`
                : `${ymd} · ${visual.label}`}
              style={{
                height: 56, borderRadius: 8,
                background: visual.bg,
                border: `1px solid ${isToday ? 'var(--indigo)' : visual.border}`,
                outline: isToday ? '1px solid var(--indigo)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between',
                padding: '6px 8px',
                cursor: r ? 'default' : 'default'
              }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isToday ? 'var(--indigo)' : 'var(--ink-2)' }}>{day}</span>
              {r?.totalHours ? (
                <span style={{ fontSize: 9, color: visual.ink, fontWeight: 700 }}>{r.totalHours}h</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
