// ============================================================================
// ScheduleSendPopover.js — schedule-a-message UI for Messages input bar.
// ============================================================================
// Session 24 (N3). Small popover triggered from the message input's
// "clock" button. Offers quick presets (in 1 hour, tomorrow 9am, Monday 9am,
// custom) plus a datetime picker. On confirm, calls the provided onSchedule
// callback with a Date object.
//
// Intentionally self-contained so it can be dropped into any input bar.
// ============================================================================

import { useState } from 'react';
import './ScheduleSendPopover.css';

function pad(n) { return String(n).padStart(2, '0'); }

// Returns a local datetime-local-compatible string: YYYY-MM-DDTHH:mm
function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Compute common preset times.
function getPresets() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const nextMonday = new Date(now);
  const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;  // always next Monday, not today
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);

  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

  return [
    { label: 'In 1 hour',        date: inOneHour, sub: inOneHour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) },
    { label: 'Tomorrow 9 AM',    date: tomorrow,  sub: tomorrow.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
    { label: 'Monday 9 AM',      date: nextMonday, sub: nextMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
  ];
}

export default function ScheduleSendPopover({ open, onClose, onSchedule, defaultDate }) {
  const [customTime, setCustomTime] = useState(() =>
    toLocalInput(defaultDate || new Date(Date.now() + 60 * 60 * 1000))
  );
  const [error, setError] = useState('');

  if (!open) return null;

  const presets = getPresets();

  const confirm = (date) => {
    setError('');
    if (!date || isNaN(date.getTime())) {
      setError('Invalid time.');
      return;
    }
    if (date.getTime() <= Date.now() + 30_000) {
      setError('Time must be at least 30 seconds from now.');
      return;
    }
    onSchedule(date);
  };

  return (
    <div className="ad-sched" role="dialog" aria-label="Schedule send">
      <div className="ad-sched__header">
        <span className="ad-sched__title">Schedule send</span>
        <button className="ad-sched__close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="ad-sched__presets">
        {presets.map(p => (
          <button
            key={p.label}
            className="ad-sched__preset"
            onClick={() => confirm(p.date)}
          >
            <span className="ad-sched__preset-label">{p.label}</span>
            <span className="ad-sched__preset-sub">{p.sub}</span>
          </button>
        ))}
      </div>

      <div className="ad-sched__custom">
        <label className="ad-sched__label">Custom time</label>
        <input
          type="datetime-local"
          value={customTime}
          onChange={e => setCustomTime(e.target.value)}
          className="ad-sched__input"
          min={toLocalInput(new Date(Date.now() + 60 * 1000))}
        />
      </div>

      {error && <div className="ad-sched__error">{error}</div>}

      <div className="ad-sched__actions">
        <button className="ad-sched__btn ad-sched__btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="ad-sched__btn ad-sched__btn--primary"
          onClick={() => confirm(new Date(customTime))}
        >
          Schedule
        </button>
      </div>
    </div>
  );
}
