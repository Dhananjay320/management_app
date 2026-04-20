import './ErrorState.css';

/**
 * ErrorState — inline error display with optional retry button.
 *
 * Pairs with useFetchSafe's `error` state. Different from ErrorBoundary:
 *   - ErrorBoundary catches RENDER crashes (throws in component tree)
 *   - ErrorState displays DATA-LOAD errors (failed fetches)
 *
 * Usage:
 *   const { data, error, loading, refetch } = useFetchSafe(...);
 *   if (error) return <ErrorState error={error} onRetry={refetch} />;
 *
 * Props:
 *   - error: Error-like object (from axios or fetch)
 *   - onRetry: optional callback for the "Try again" button
 *   - compact: smaller inline variant for sidebars / panels
 *   - message: override the default friendly message
 */
export default function ErrorState({ error, onRetry, compact, message }) {
  const status = error?.response?.status;
  const serverMsg = error?.response?.data?.error;

  // Friendly messaging by status. Unknown errors get a generic message.
  let friendly = message;
  if (!friendly) {
    if (status === 401) friendly = 'Your session expired. Please sign in again.';
    else if (status === 403) friendly = 'You don\u2019t have permission to see this.';
    else if (status === 404) friendly = 'Couldn\u2019t find that. It may have been removed.';
    else if (status >= 500)  friendly = 'The server hit a problem. Try again in a moment.';
    else if (error?.request) friendly = 'Network issue. Check your connection and try again.';
    else                     friendly = 'Couldn\u2019t load this.';
  }

  return (
    <div className={`ad-errstate ${compact ? 'ad-errstate--compact' : ''}`} role="alert">
      <div className="ad-errstate__body">
        <div className="ad-errstate__message">{friendly}</div>
        {serverMsg && serverMsg !== friendly && (
          <div className="ad-errstate__detail">{serverMsg}</div>
        )}
      </div>
      {onRetry && (
        <button type="button" className="ad-errstate__btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
