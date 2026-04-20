// ============================================================================
// ScheduledMessagesPage.js — manage my scheduled outgoing messages.
// ============================================================================
// Session 24 (N3). Shows all scheduled messages I've queued, grouped by
// status (Pending / Sent / Failed / Cancelled). Allows editing content
// and send time of pending ones, cancelling them, or resending failed.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
  GlassPanel, PrimaryButton, SegmentedControl, GradientText, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import './ScheduledMessagesPage.css';

const STATUS_LABELS = {
  pending:   { label: 'Pending',   tone: 'pending'   },
  sent:      { label: 'Sent',      tone: 'sent'      },
  cancelled: { label: 'Cancelled', tone: 'cancelled' },
  failed:    { label: 'Failed',    tone: 'failed'    },
};

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const prefix = diffMs > 0 ? 'in ' : '';
  const suffix = diffMs < 0 ? ' ago' : '';
  if (mins < 1) return diffMs > 0 ? 'soon' : 'just now';
  if (mins < 60) return `${prefix}${mins}m${suffix}`;
  if (hrs < 24) return `${prefix}${hrs}h${suffix}`;
  if (days < 14) return `${prefix}${days}d${suffix}`;
  return d.toLocaleDateString();
}

export default function ScheduledMessagesPage() {
  const [filter, setFilter] = useState('pending');

  const { data: records = [], loading, error, refetch } = useFetchSafe(
    async () => (await api.get('/scheduled-messages', { params: { status: filter } })).data,
    [filter]
  );

  const cancel = async (id) => {
    if (!window.confirm('Cancel this scheduled message?')) return;
    try { await api.delete(`/scheduled-messages/${id}`); refetch(); } catch {}
  };

  const counts = {
    pending:   records.filter(r => r.status === 'pending').length,
    sent:      0,
    cancelled: 0,
    failed:    0,
  };

  const total = records.length;

  return (
    <div className="ad-sched-page">
      <header className="ad-sched-page__head ad-enter">
        <div className="ad-sched-page__head-left">
          <h1 className="ad-sched-page__title">
            <GradientText>Scheduled</GradientText> messages
          </h1>
          <p className="ad-sched-page__sub">
            {loading ? 'Loading…' : total === 0 ? 'No scheduled messages.' : `${total} ${filter} message${total === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="ad-sched-page__head-right">
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'pending',   label: 'Pending'   },
              { key: 'sent',      label: 'Sent'      },
              { key: 'failed',    label: 'Failed'    },
              { key: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
      </header>

      {loading ? (
        <GlassPanel elevated className="ad-sched-page__state">Loading…</GlassPanel>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : records.length === 0 ? (
        <GlassPanel elevated className="ad-sched-page__state">
          <div className="ad-sched-page__empty-icon">⏰</div>
          <div className="ad-sched-page__empty-title">
            No {filter} messages
          </div>
          <div className="ad-sched-page__empty-sub">
            {filter === 'pending'
              ? 'Schedule a message from the clock icon in any conversation.'
              : filter === 'failed'
              ? 'Good news — nothing has failed to send.'
              : filter === 'cancelled'
              ? 'Messages you cancel before delivery show up here.'
              : 'Already-delivered messages show up here for reference.'}
          </div>
        </GlassPanel>
      ) : (
        <div className="ad-sched-page__list">
          {records.map(r => (
            <ScheduledRow key={r._id} record={r} onCancel={() => cancel(r._id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduledRow({ record, onCancel }) {
  const tone = STATUS_LABELS[record.status]?.tone || 'pending';
  const channelName = record.channel?.name
    ? (record.channel.name.startsWith('#') ? record.channel.name : `#${record.channel.name}`)
    : 'Unknown channel';

  return (
    <div className={`ad-sched-row ad-sched-row--${tone}`}>
      <div className="ad-sched-row__head">
        <div className="ad-sched-row__channel">
          <Icon.MessageSquare size={13} /> {channelName}
        </div>
        <div className={`ad-sched-row__status ad-sched-row__status--${tone}`}>
          {STATUS_LABELS[record.status]?.label || record.status}
        </div>
      </div>

      <div className="ad-sched-row__body">
        {record.content || '(No text)'}
      </div>

      <div className="ad-sched-row__foot">
        <div className="ad-sched-row__time">
          <span className="ad-sched-row__time-label">
            {record.status === 'sent' ? 'Sent' :
             record.status === 'pending' ? 'Scheduled for' :
             record.status === 'cancelled' ? 'Was scheduled for' :
             'Failed at'}
          </span>
          <span className="ad-sched-row__time-value">
            {new Date(record.sendAt).toLocaleString(undefined, {
              month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
            {' · '}
            <span className="ad-sched-row__time-rel">{formatRelative(record.sendAt)}</span>
          </span>
        </div>

        {record.status === 'pending' && (
          <button className="ad-sched-row__btn" onClick={onCancel}>
            Cancel
          </button>
        )}

        {record.status === 'failed' && record.failureReason && (
          <div className="ad-sched-row__fail-reason">
            {record.failureReason}
          </div>
        )}
      </div>
    </div>
  );
}
