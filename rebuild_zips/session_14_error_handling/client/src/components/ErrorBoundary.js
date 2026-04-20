import React from 'react';
import './ErrorBoundary.css';

/**
 * ErrorBoundary — top-level + module-level React error boundary.
 *
 * Session 14 (C11): unhandled errors used to white-screen the whole app.
 * Now they render a friendly fallback with "Try again" + "Go home" actions.
 *
 * Usage:
 *   <ErrorBoundary scope="root">
 *     <App />
 *   </ErrorBoundary>
 *
 *   // Per-module, smaller fallback:
 *   <ErrorBoundary scope="tasks" compact>
 *     <TasksPage />
 *   </ErrorBoundary>
 *
 * Props:
 *   - scope: string     — used for console grouping + analytics hook
 *   - compact: boolean  — renders inline mini-card instead of full-page
 *   - fallback: ReactNode — fully custom fallback (overrides the default)
 *   - onReset: () => void — optional hook called when user clicks "Try again"
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const scope = this.props.scope || 'unknown';
    // Console log with clear grouping for developer visibility
    console.group(`[ErrorBoundary:${scope}] caught`);
    console.error(error);
    console.error(errorInfo?.componentStack);
    console.groupEnd();

    this.setState({ errorInfo });

    // Future: wire to error-tracking service (Sentry, Rollbar, etc).
    // Kept pluggable via optional onError prop so no hard dependency.
    if (typeof this.props.onError === 'function') {
      try { this.props.onError(error, errorInfo, scope); } catch {}
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset(); } catch {}
    }
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Custom fallback wins
    if (this.props.fallback) return this.props.fallback;

    const scope = this.props.scope || 'app';
    const compact = !!this.props.compact;
    const isDev = process.env.NODE_ENV !== 'production';
    const errorMessage = this.state.error?.message || 'An unexpected error occurred.';

    return (
      <div className={`ad-eb ${compact ? 'ad-eb--compact' : 'ad-eb--full'}`} role="alert">
        <div className="ad-eb__icon" aria-hidden="true">⚠️</div>
        <div className="ad-eb__body">
          <h3 className="ad-eb__title">
            {compact ? 'This section ran into a problem.' : 'Something went wrong.'}
          </h3>
          <p className="ad-eb__message">
            {compact
              ? 'Try again, or refresh the page. The rest of the app is still running.'
              : 'The app hit an unexpected error. Try again, or go back to the home screen.'}
          </p>
          <div className="ad-eb__actions">
            <button type="button" className="ad-eb__btn ad-eb__btn--primary" onClick={this.handleReset}>
              Try again
            </button>
            {!compact && (
              <button type="button" className="ad-eb__btn" onClick={this.handleGoHome}>
                Go home
              </button>
            )}
          </div>

          {isDev && (
            <details className="ad-eb__details">
              <summary>Error details ({scope})</summary>
              <pre className="ad-eb__pre">{errorMessage}</pre>
              {this.state.errorInfo?.componentStack && (
                <pre className="ad-eb__pre ad-eb__pre--stack">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </details>
          )}
        </div>
      </div>
    );
  }
}
