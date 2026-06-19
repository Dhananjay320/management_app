import React from 'react';
import { reportCrash } from '../utils/crashReporter';

// Top-level React error boundary. Catches render-tree errors that would
// otherwise produce a blank screen, reports them to diagnostics, and shows
// the user a recoverable fallback with a "Reload" button.
//
// Keep this dumb. The whole point is that the rest of the app is broken when
// it fires — no router hooks, no context consumers, no API calls beyond the
// crash report itself.

export default class CrashBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      reportCrash({
        type: 'react_error',
        message: error?.message || String(error),
        stack: error?.stack || '',
        context: { componentStack: info?.componentStack || '' }
      });
    } catch {}
  }

  handleReload = () => {
    try { window.location.reload(); } catch {}
  };

  handleClearStorage = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    try { window.location.href = '/login'; } catch {}
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'unknown error';
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <div style={styles.title}>Something went wrong</div>
          <div style={styles.subtitle}>The app hit an unexpected error. The team has been notified.</div>
          <div style={styles.errBox}>
            <code style={styles.code}>{msg}</code>
          </div>
          <div style={styles.actions}>
            <button onClick={this.handleReload} style={styles.primary}>Reload App</button>
            <button onClick={this.handleClearStorage} style={styles.secondary}>Sign out &amp; reset</button>
          </div>
          <div style={styles.hint}>
            If this keeps happening, share a screenshot with the team.
          </div>
        </div>
      </div>
    );
  }
}

const styles = {
  wrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #0B0F19 0%, #1E1B4B 100%)',
    padding: 20, fontFamily: 'Inter, -apple-system, system-ui, sans-serif'
  },
  card: {
    maxWidth: 480, background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(99,102,241,0.25)',
    borderRadius: 16, padding: 32, textAlign: 'center', color: '#E2E8F0',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
  },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 800, marginBottom: 6, color: '#F8FAFC' },
  subtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 18, lineHeight: 1.5 },
  errBox: {
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 8, padding: '10px 12px', marginBottom: 20, textAlign: 'left',
    maxHeight: 120, overflow: 'auto'
  },
  code: { fontSize: 11, color: '#FCA5A5', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', wordBreak: 'break-word' },
  actions: { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 },
  primary: {
    background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', border: 'none',
    padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer'
  },
  secondary: {
    background: 'transparent', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.3)',
    padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
  },
  hint: { fontSize: 11, color: '#64748B' }
};
