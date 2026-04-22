import { useState } from 'react';

/**
 * FormatSwitcher — Reusable format switching component (Section 6.4.1)
 * Renders messages in chat, email, table, calendar, or document format.
 *
 * Props:
 *   messages: array of message objects ({ _id, sender: { name, email }, content, createdAt, file })
 *   channelName: string (optional, for document header)
 *   memberCount: number (optional, for document header)
 */

const FORMATS = [
  { key: 'chat', label: 'Chat', icon: '\uD83D\uDCAC' },
  { key: 'email', label: 'Email', icon: '\u2709\uFE0F' },
  { key: 'table', label: 'Table', icon: '\uD83D\uDCCA' },
  { key: 'calendar', label: 'Calendar', icon: '\uD83D\uDCC5' },
  { key: 'document', label: 'Document', icon: '\uD83D\uDCC4' },
];

export default function FormatSwitcher({ messages = [], channelName, memberCount, renderChatBubble }) {
  const [format, setFormat] = useState('chat');

  const filtered = messages.filter(m => m.type !== 'system');

  return (
    <div>
      {/* Format selector */}
      <select
        value={format}
        onChange={e => setFormat(e.target.value)}
        style={{
          padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6,
          fontSize: 10, color: 'var(--ink-2)', background: 'var(--glass)',
          fontFamily: 'Inter,sans-serif', cursor: 'pointer', marginBottom: 8
        }}
        title="Switch display format"
      >
        {FORMATS.map(f => (
          <option key={f.key} value={f.key}>{f.icon} {f.label}</option>
        ))}
      </select>

      {/* Chat view — uses external renderChatBubble or simple fallback */}
      {format === 'chat' && (
        renderChatBubble
          ? messages.map(msg => renderChatBubble(msg))
          : filtered.map(msg => (
            <div key={msg._id} style={{ padding: '6px 0', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{msg.sender?.name}</span>
              <span style={{ color: 'var(--ink-3)', marginLeft: 8, fontSize: 10 }}>
                {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div style={{ color: 'var(--ink-2)', marginTop: 2 }}>{msg.content}</div>
            </div>
          ))
      )}

      {/* Email view */}
      {format === 'email' && filtered.map(msg => (
        <div key={msg._id} style={{ background: 'var(--glass)', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, borderBottom: '1px solid #F0F2F7', paddingBottom: 6 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{msg.sender?.name}</span>
              <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 8 }}>&lt;{msg.sender?.email}&gt;</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{new Date(msg.createdAt).toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
        </div>
      ))}

      {/* Table view */}
      {format === 'table' && (
        <div style={{ background: 'var(--glass)', borderRadius: 8, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 100px 1fr 120px', padding: '8px 12px', background: 'var(--glass)', borderBottom: '1px solid #E2E8F0', fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
            <div>Sender</div><div>Time</div><div>Message</div><div>Attachments</div>
          </div>
          {filtered.map(msg => (
            <div key={msg._id} style={{ display: 'grid', gridTemplateColumns: '120px 100px 1fr 120px', padding: '8px 12px', borderBottom: '1px solid #F0F2F7', fontSize: 11, alignItems: 'center' }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{msg.sender?.name}</div>
              <div style={{ color: 'var(--ink-3)', fontSize: 10 }}>{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
              <div style={{ color: 'var(--ink-2)' }}>{msg.content}</div>
              <div>{msg.file ? '\uD83D\uDCCE ' + msg.file.name : '\u2014'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar view */}
      {format === 'calendar' && (() => {
        const byDate = {};
        filtered.forEach(msg => {
          const d = new Date(msg.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push(msg);
        });
        return Object.entries(byDate).map(([date, msgs]) => (
          <div key={date} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', background: 'rgba(99,102,241,0.06)', padding: '6px 12px', borderRadius: 6, marginBottom: 6 }}>{date}</div>
            {msgs.map(msg => (
              <div key={msg._id} style={{ display: 'flex', gap: 8, padding: '4px 12px', fontSize: 11 }}>
                <span style={{ color: 'var(--ink-3)', width: 60, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                  {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--ink)', width: 100, flexShrink: 0 }}>{msg.sender?.name}</span>
                <span style={{ color: 'var(--ink-2)' }}>{msg.content}</span>
              </div>
            ))}
          </div>
        ));
      })()}

      {/* Document view */}
      {format === 'document' && (
        <div style={{ background: 'var(--glass)', borderRadius: 8, border: '1px solid #E2E8F0', padding: '24px 32px', maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginBottom: 4, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            {channelName || 'Conversation'}
          </h2>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #F0F2F7' }}>
            {messages.length} messages{memberCount ? ` \u00B7 ${memberCount} members` : ''}
          </div>
          {filtered.map(msg => (
            <div key={msg._id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>
                {msg.sender?.name} <span style={{ fontWeight: 400, color: 'var(--ink-4)' }}>\u2014 {new Date(msg.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, marginTop: 2 }}>{msg.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
