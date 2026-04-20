// ============================================================================
// useRetry + retryWithBackoff — retry helpers for flaky async operations.
// ============================================================================
// Session 14 (C11). Centralizes the "try a few times with backoff" pattern
// so modules don't re-invent it.
//
// Use retryWithBackoff() for one-shot calls (e.g. a save button handler).
// Use useRetry() for calls wired to component lifecycle (e.g. initial load).
// ============================================================================

import { useCallback, useRef } from 'react';

/**
 * Execute an async function, retrying with exponential backoff if it rejects.
 *
 * Only retries on transient failures — network errors or 5xx responses.
 * 4xx errors (401, 403, 404) are NOT retried; they're genuine "don't do that"
 * signals and retrying won't help.
 *
 * @param {Function} fn           - async function to execute
 * @param {Object}   opts
 *   retries        max attempts (default 3)
 *   initialDelay   first backoff in ms (default 500)
 *   maxDelay       cap on backoff in ms (default 5000)
 *   factor         exponent (default 2)
 *   shouldRetry    custom predicate: (err, attempt) => boolean
 *   onRetry        callback: (err, attempt, delay) => void
 *   signal         AbortSignal to abort retries
 */
export async function retryWithBackoff(fn, opts = {}) {
  const {
    retries = 3,
    initialDelay = 500,
    maxDelay = 5000,
    factor = 2,
    shouldRetry,
    onRetry,
    signal,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;

      // Don't retry if caller cancelled
      if (err?.name === 'AbortError' || signal?.aborted) throw err;

      // On last attempt, give up
      if (attempt >= retries) break;

      // Decide if this error is retryable
      let retryable;
      if (typeof shouldRetry === 'function') {
        retryable = shouldRetry(err, attempt);
      } else {
        retryable = isTransientError(err);
      }
      if (!retryable) break;

      // Backoff — capped, with jitter
      const base = Math.min(maxDelay, initialDelay * Math.pow(factor, attempt));
      const delay = base * (0.7 + Math.random() * 0.6);  // ±30% jitter

      if (onRetry) {
        try { onRetry(err, attempt + 1, delay); } catch {}
      }

      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }
      });
    }
  }
  throw lastErr;
}

/**
 * Heuristic for transient errors. True for network failures and 5xx.
 * Treats axios-shaped errors + fetch-shaped errors.
 */
export function isTransientError(err) {
  if (!err) return false;

  // Axios
  if (err.response) {
    const status = err.response.status;
    return status >= 500 && status < 600;
  }

  // No response at all (network layer issue)
  if (err.request) return true;

  // fetch() errors
  if (err instanceof TypeError) return true;

  // Custom flag
  if (err.retryable === true) return true;

  return false;
}

/**
 * Hook form. Returns `(fn, opts) => promise` you can call multiple times.
 * Uses a ref-stored AbortController so unmount cancels in-flight retries.
 *
 * Usage:
 *   const retry = useRetry();
 *   const data = await retry(() => api.get('/tasks'), { retries: 2 });
 */
export function useRetry() {
  const abortRef = useRef(null);

  return useCallback((fn, opts = {}) => {
    // Cancel any previous call from this hook instance
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return retryWithBackoff(fn, { ...opts, signal: controller.signal });
  }, []);
}
