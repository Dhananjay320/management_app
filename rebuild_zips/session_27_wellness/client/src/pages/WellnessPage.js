// ============================================================================
// WellnessPage.js — daily quote, meditation timer, mood check-in.
// ============================================================================
// Session 27 (N6). One page with three cards:
//
//   1. Daily quote (pulled from server, cached for the day)
//   2. Meditation timer — pick a duration, breathe along with an animated
//      circle, optional soft bell at the end
//   3. Mood check-in — tap an emoji, optional note
//
// Plus a compact recent-trend bar at the bottom (last 7 days).
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import {
  GlassPanel, GradientText, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import './WellnessPage.css';

const MOOD_OPTIONS = [
  { value: 1, emoji: '😔', label: 'Rough'   },
  { value: 2, emoji: '😕', label: 'Low'     },
  { value: 3, emoji: '😐', label: 'Okay'    },
  { value: 4, emoji: '🙂', label: 'Good'    },
  { value: 5, emoji: '😄', label: 'Great'   },
];

export default function WellnessPage() {
  const { data, loading, error, refetch } = useFetchSafe(
    async () => (await api.get('/wellness/today')).data,
    []
  );

  const { data: history = [], refetch: refetchHistory } = useFetchSafe(
    async () => (await api.get('/wellness/history', { params: { limit: 14 } })).data,
    []
  );

  return (
    <div className="ad-well">
      <header className="ad-well__head ad-enter">
        <div>
          <h1 className="ad-well__title">Your <GradientText>wellness</GradientText></h1>
          <p className="ad-well__sub">
            A daily quote, a breather, and a mood check-in. Take a minute for yourself.
          </p>
        </div>
      </header>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : loading ? (
        <GlassPanel elevated className="ad-well__state">Loading…</GlassPanel>
      ) : (
        <div className="ad-well__grid">
          <QuoteCard quote={data?.quote} />
          <MeditationCard />
          <MoodCard
            mood={data?.mood}
            onCheckedIn={() => { refetch(); refetchHistory(); }}
          />
        </div>
      )}

      {history.length > 0 && (
        <GlassPanel elevated className="ad-well__trend ad-enter" style={{ animationDelay: '120ms' }}>
          <div className="ad-well__trend-head">
            <span className="ad-well__trend-title">Last 14 days</span>
            <span className="ad-well__trend-avg">
              Avg {averageMood(history)} / 5
            </span>
          </div>
          <TrendStrip records={history} />
        </GlassPanel>
      )}
    </div>
  );
}

// ─── Quote card ──────────────────────────────────────────────────────
function QuoteCard({ quote }) {
  if (!quote) return null;
  return (
    <GlassPanel
      elevated
      className="ad-well-card ad-well-card--quote ad-enter"
      style={{
        animationDelay: '40ms',
        borderLeft: `3px solid ${quote.color || '#6366F1'}`,
      }}
    >
      <div className="ad-well-card__kicker" style={{ color: quote.color || '#A5B4FC' }}>
        {quote.category?.toUpperCase() || 'REFLECTION'}
      </div>
      <blockquote className="ad-well-card__quote">
        “{quote.text}”
      </blockquote>
      <cite className="ad-well-card__attr">— {quote.author}</cite>
    </GlassPanel>
  );
}

// ─── Meditation card ─────────────────────────────────────────────────
const PRESETS = [
  { key: 'quick', label: '2 min',  sec: 120 },
  { key: 'short', label: '5 min',  sec: 300 },
  { key: 'focus', label: '10 min', sec: 600 },
  { key: 'deep',  label: '15 min', sec: 900 },
];

function MeditationCard() {
  const [duration, setDuration] = useState(300);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(300);
  const [phase, setPhase] = useState('idle'); // idle | inhale | hold | exhale
  const intervalRef = useRef(null);
  const breathRef = useRef(null);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (breathRef.current) clearInterval(breathRef.current);
  }, []);

  const start = () => {
    setRemaining(duration);
    setRunning(true);
    setPhase('inhale');

    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(intervalRef.current);
          clearInterval(breathRef.current);
          setRunning(false);
          setPhase('idle');
          playBell();
          return 0;
        }
        return r - 1;
      });
    }, 1000);

    // Breathing cycle: 4s inhale, 2s hold, 6s exhale, repeat (12s cycle)
    let cycle = 0;
    breathRef.current = setInterval(() => {
      cycle = (cycle + 1) % 3;
      setPhase(cycle === 0 ? 'inhale' : cycle === 1 ? 'hold' : 'exhale');
    }, 4000);
  };

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (breathRef.current) clearInterval(breathRef.current);
    setRunning(false);
    setPhase('idle');
    setRemaining(duration);
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <GlassPanel elevated className="ad-well-card ad-well-card--med ad-enter" style={{ animationDelay: '80ms' }}>
      <div className="ad-well-card__kicker">MEDITATE</div>

      <div className="ad-med__circle-wrap">
        <div
          className={`ad-med__circle ad-med__circle--${phase}`}
          aria-hidden="true"
        />
        <div className="ad-med__timer">
          <span className="ad-med__timer-value">
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
          {phase !== 'idle' && (
            <span className="ad-med__phase">
              {phase === 'inhale' ? 'breathe in' : phase === 'hold' ? 'hold' : 'breathe out'}
            </span>
          )}
        </div>
      </div>

      {!running ? (
        <>
          <div className="ad-med__presets">
            {PRESETS.map(p => (
              <button
                key={p.key}
                className={`ad-med__preset ${duration === p.sec ? 'ad-med__preset--active' : ''}`}
                onClick={() => { setDuration(p.sec); setRemaining(p.sec); }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="ad-med__cta" onClick={start}>
            Begin
          </button>
        </>
      ) : (
        <button className="ad-med__cta ad-med__cta--stop" onClick={stop}>
          End session
        </button>
      )}
    </GlassPanel>
  );
}

// Soft Web-Audio bell when meditation ends. No asset files needed.
function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 528;   // "healing tone"
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3);
    o.start();
    o.stop(ctx.currentTime + 3);
  } catch {}
}

// ─── Mood check-in card ──────────────────────────────────────────────
function MoodCard({ mood, onCheckedIn }) {
  const [selected, setSelected] = useState(mood?.mood || null);
  const [note, setNote] = useState(mood?.note || '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setSelected(mood?.mood || null);
    setNote(mood?.note || '');
  }, [mood]);

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post('/wellness/mood', {
        mood: selected,
        note: note.trim(),
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2400);
      onCheckedIn?.();
    } catch {} finally { setSaving(false); }
  };

  return (
    <GlassPanel elevated className="ad-well-card ad-well-card--mood ad-enter" style={{ animationDelay: '120ms' }}>
      <div className="ad-well-card__kicker">TODAY'S CHECK-IN</div>

      {mood ? (
        <div className="ad-mood__status">
          You checked in as {MOOD_OPTIONS.find(m => m.value === mood.mood)?.emoji} today.
        </div>
      ) : (
        <div className="ad-mood__prompt">How are you feeling today?</div>
      )}

      <div className="ad-mood__scale" role="radiogroup" aria-label="Mood rating">
        {MOOD_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`ad-mood__btn ${selected === opt.value ? 'ad-mood__btn--active' : ''}`}
            onClick={() => setSelected(opt.value)}
            role="radio"
            aria-checked={selected === opt.value}
            aria-label={opt.label}
            title={opt.label}
          >
            <span className="ad-mood__emoji">{opt.emoji}</span>
            <span className="ad-mood__label">{opt.label}</span>
          </button>
        ))}
      </div>

      <textarea
        className="ad-mood__note"
        placeholder="Anything on your mind? (optional, stays private)"
        value={note}
        onChange={e => setNote(e.target.value)}
        maxLength={200}
        rows={2}
      />

      <button
        className="ad-mood__submit"
        onClick={submit}
        disabled={!selected || saving}
      >
        {saving ? 'Saving…' : justSaved ? 'Saved ✓' : mood ? 'Update' : 'Check in'}
      </button>
    </GlassPanel>
  );
}

// ─── Trend strip ─────────────────────────────────────────────────────
function TrendStrip({ records }) {
  // Ensure we show the last 14 days; fill gaps with null
  const byDate = new Map(records.map(r => [r.date, r]));
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, record: byDate.get(key) || null });
  }

  return (
    <div className="ad-trend">
      {days.map(d => {
        const rec = d.record;
        return (
          <div
            key={d.date}
            className="ad-trend__bar-wrap"
            title={rec
              ? `${d.date} · ${MOOD_OPTIONS.find(m => m.value === rec.mood)?.label}`
              : `${d.date} · no check-in`}
          >
            <div
              className={`ad-trend__bar ad-trend__bar--m${rec?.mood || 0}`}
              style={{
                height: rec ? `${rec.mood * 20}%` : '4%',
                opacity: rec ? 1 : 0.25,
              }}
            />
            <span className="ad-trend__date">
              {new Date(d.date).toLocaleDateString('en-US', { weekday: 'narrow' })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function averageMood(records) {
  if (!records.length) return '–';
  const sum = records.reduce((s, r) => s + (r.mood || 0), 0);
  return (sum / records.length).toFixed(1);
}
