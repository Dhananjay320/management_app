import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

// Reads the user's effective monitoring status from the server. Centralized
// so any feature can gate itself on `cfg.screenshots.enabled`, etc., without
// re-fetching. Also exposes whether the user needs to (re-)accept the policy.
//
// Returns:
//   { loading, config, bypass, needsAcceptance, accept, reload }
export default function useMonitoringConfig() {
  const [state, setState] = useState({ loading: true, config: null, bypass: false, needsAcceptance: false });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/monitoring/my-status');
      setState({
        loading: false,
        config: data.config,
        bypass: !!data.bypass,
        needsAcceptance: !!data.needsAcceptance,
        acceptedVersion: data.acceptedVersion
      });
    } catch {
      setState({ loading: false, config: null, bypass: false, needsAcceptance: false });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const accept = useCallback(async () => {
    try {
      await api.post('/monitoring/accept');
      await load();
    } catch (err) {
      throw err;
    }
  }, [load]);

  return { ...state, accept, reload: load };
}
