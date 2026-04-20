// ============================================================================
// useFetchSafe — "load data with retry, error state, and loading" pattern.
// ============================================================================
// Session 14 (C11). Most pages have boilerplate like:
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [err, setErr] = useState(null);
//   useEffect(() => { api.get(...).then(setData).catch(setErr)... }, [...])
//
// useFetchSafe wraps that boilerplate with retry + abort handling.
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { retryWithBackoff } from './useRetry';

/**
 * Fetch data with loading + error state + retry.
 *
 * @param {Function} fetcher  - async function returning the data
 * @param {Array}    deps     - dependency array (like useEffect)
 * @param {Object}   opts     - passed to retryWithBackoff
 *
 * @returns {{ data, error, loading, refetch }}
 *
 * Usage:
 *   const { data: tasks, error, loading, refetch } = useFetchSafe(
 *     async () => (await api.get('/tasks')).data,
 *     [filterType],
 *   );
 */
export function useFetchSafe(fetcher, deps = [], opts = {}) {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef(null);

  // Always read the latest fetcher/opts without retriggering the effect.
  const fetcherRef = useRef(fetcher);
  const optsRef    = useRef(opts);
  fetcherRef.current = fetcher;
  optsRef.current    = opts;

  const run = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await retryWithBackoff(
        () => fetcherRef.current(),
        { ...optsRef.current, signal: controller.signal }
      );
      if (!controller.signal.aborted) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;  // silent on unmount/dep change
      setError(err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    return () => { if (abortRef.current) abortRef.current.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refetch: run };
}
