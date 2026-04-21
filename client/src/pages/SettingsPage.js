import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/ai.css';

const FEATURES = [
  { icon: '💬', label: 'Summarize chat thread', priority: 'low', trigger: 'Summarize button in chat' },
  { icon: '📋', label: 'Extract tasks from MoM', priority: 'high', trigger: 'Analyse button in MoM' },
  { icon: '✉️', label: 'Draft email from one line', priority: 'low', trigger: 'Draft button in email composer' },
  { icon: '📝', label: 'Format raw meeting notes', priority: 'high', trigger: 'Format button in MoM' },
  { icon: '📊', label: 'Generate meeting summary', priority: 'high', trigger: 'Generate Summary after meeting ends' },
];

export default function SettingsPage() {
  // eslint-disable-next-line no-unused-vars
  const { user: _user } = useAuth();
  const [aiConfig, setAiConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  // Activation form
  const [mode, setMode] = useState('code'); // 'code' or 'direct'
  const [activationCode, setActivationCode] = useState('');
  const [directProvider, setDirectProvider] = useState('gemini');
  const [directKey, setDirectKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [company, setCompany] = useState(null);

  // Company AI key (main_admin only)
  const [companyKeyConfig, setCompanyKeyConfig] = useState(null);
  const [companyProvider, setCompanyProvider] = useState('gemini');
  const [companyApiKey, setCompanyApiKey] = useState('');
  const [companyMsg, setCompanyMsg] = useState('');
  const [companyErr, setCompanyErr] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      const [aiRes, companyRes] = await Promise.all([
        api.get('/ai/config'),
        api.get('/onboarding/company')
      ]);
      setAiConfig(aiRes.data);
      setCompany(companyRes.data);
    } catch {}

    // Load company key status if main_admin
    if (_user?.role === 'main_admin') {
      try {
        const { data } = await api.get('/ai/company-key');
        setCompanyKeyConfig(data);
      } catch {}
    }

    setLoading(false);
  }, [_user?.role]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const activateWithCode = async () => {
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/ai/activate', { activationCode });
      setMessage(data.message);
      setActivationCode('');
      loadConfig();
    } catch (err) {
      setError(err.response?.data?.error || 'Activation failed.');
    }
  };

  const activateDirect = async () => {
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/ai/activate-direct', { provider: directProvider, apiKey: directKey });
      setMessage(data.message);
      setDirectKey('');
      loadConfig();
    } catch (err) {
      setError(err.response?.data?.error || 'Activation failed.');
    }
  };

  const deactivate = async () => {
    try {
      await api.delete('/ai/config');
      setMessage('AI deactivated.');
      loadConfig();
    } catch {}
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--ink-3)' }}>Loading...</div>;

  return (
    <div className="ai-settings">
      <h2>Settings</h2>

      {/* Company Info Card — per spec Section 17, accessible anytime from settings */}
      {company && (
        <div className="ai-status-card" style={{ marginBottom: 16 }}>
          <div className="ai-status-header">
            <span className="ai-status-title">{company.name || 'Company Info'}</span>
          </div>
          {company.tagline && <div style={{ fontSize: 12, color: '#6366F1', fontWeight: 600, marginBottom: 6 }}>{company.tagline}</div>}
          {company.about && <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8 }}>{company.about}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--ink-3)' }}>
            {company.email && <span>✉️ {company.email}</span>}
            {company.phone && <span>📞 {company.phone}</span>}
            {company.address && <span>📍 {company.address}</span>}
            {company.website && <span>🌐 {company.website}</span>}
          </div>
          {(company.social?.linkedin || company.social?.twitter) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {company.social.linkedin && <a href={company.social.linkedin} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#6366F1', textDecoration: 'none', fontWeight: 600 }}>LinkedIn</a>}
              {company.social.twitter && <a href={company.social.twitter} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#6366F1', textDecoration: 'none', fontWeight: 600 }}>Twitter</a>}
            </div>
          )}
        </div>
      )}

      {/* AI Config Status */}
      <div className="ai-status-card">
        <div className="ai-status-header">
          <span className="ai-status-title">AI Configuration</span>
          <span className={`ai-status-badge ${aiConfig?.configured ? 'active' : 'inactive'}`}>
            {aiConfig?.configured ? `${aiConfig.provider} Active` : 'Not Configured'}
          </span>
        </div>
        {aiConfig?.configured && (
          <div className="ai-status-info">
            <div className="ai-status-row">
              <span className="ai-status-label">Provider</span>
              <span className="ai-status-value">{aiConfig.provider?.charAt(0).toUpperCase() + aiConfig.provider?.slice(1)}</span>
            </div>
            <div className="ai-status-row">
              <span className="ai-status-label">Key</span>
              <span className="ai-status-value">••••••••</span>
            </div>
            {aiConfig.expiresAt && (
              <div className="ai-status-row">
                <span className="ai-status-label">Expires</span>
                <span className="ai-status-value">{new Date(aiConfig.expiresAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              </div>
            )}
            <div className="ai-status-row">
              <span className="ai-status-label">Activated</span>
              <span className="ai-status-value">{new Date(aiConfig.activatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>
        )}
      </div>

      {/* Activation Form */}
      <div className="ai-activate-form">
        <h3>{aiConfig?.configured ? 'Update AI Configuration' : 'Activate AI'}</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className={`ai-feature-btn ${mode === 'code' ? '' : ''}`}
            style={mode === 'code' ? { background: 'rgba(99,102,241,0.1)', borderColor: '#6366F1' } : {}}
            onClick={() => setMode('code')}
          >
            Activation Code
          </button>
          <button
            className={`ai-feature-btn`}
            style={mode === 'direct' ? { background: 'rgba(99,102,241,0.1)', borderColor: '#6366F1' } : {}}
            onClick={() => setMode('direct')}
          >
            Direct API Key
          </button>
        </div>

        {mode === 'code' ? (
          <>
            <div className="ai-form-group">
              <label>Activation Code</label>
              <input
                value={activationCode}
                onChange={e => setActivationCode(e.target.value)}
                placeholder="GEMINI:encrypted_key:2027-01:CHECKSUM"
              />
              <div className="hint">Get your activation code from your administrator.</div>
            </div>
            <button className="ai-activate-btn" onClick={activateWithCode} disabled={!activationCode.trim()}>
              Activate
            </button>
          </>
        ) : (
          <>
            <div className="ai-form-group">
              <label>Provider</label>
              <select value={directProvider} onChange={e => setDirectProvider(e.target.value)}>
                <option value="gemini">Google Gemini (Free tier)</option>
                <option value="openai">OpenAI (Paid)</option>
                <option value="claude">Anthropic Claude (Paid)</option>
              </select>
            </div>
            <div className="ai-form-group">
              <label>API Key</label>
              <input
                type="password"
                value={directKey}
                onChange={e => setDirectKey(e.target.value)}
                placeholder="Your API key"
              />
              <div className="hint">Key is encrypted before storage. Never visible in plain text.</div>
            </div>
            <button className="ai-activate-btn" onClick={activateDirect} disabled={!directKey.trim()}>
              Activate
            </button>
          </>
        )}

        {aiConfig?.configured && (
          <button className="ai-deactivate-btn" onClick={deactivate}>Deactivate</button>
        )}

        {message && <div style={{ marginTop: 10, fontSize: 12, color: '#10B981', fontWeight: 600 }}>{message}</div>}
        {error && <div style={{ marginTop: 10, fontSize: 12, color: '#EF4444', fontWeight: 600 }}>{error}</div>}
      </div>

      {/* Company AI Key — main_admin only */}
      {_user?.role === 'main_admin' && (
        <div className="ai-activate-form" style={{ marginTop: 16 }}>
          <h3>Company AI Key</h3>
          <p style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12 }}>
            Set a company-wide fallback AI key. High-priority features will use this key when a user&apos;s personal key is not configured or fails.
          </p>

          {companyKeyConfig?.configured && (
            <div className="ai-status-card" style={{ marginBottom: 12 }}>
              <div className="ai-status-header">
                <span className="ai-status-title">Company Key</span>
                <span className="ai-status-badge active">{companyKeyConfig.provider} Active</span>
              </div>
              <div className="ai-status-info">
                <div className="ai-status-row">
                  <span className="ai-status-label">Provider</span>
                  <span className="ai-status-value">{companyKeyConfig.provider?.charAt(0).toUpperCase() + companyKeyConfig.provider?.slice(1)}</span>
                </div>
                <div className="ai-status-row">
                  <span className="ai-status-label">Key</span>
                  <span className="ai-status-value">••••••••</span>
                </div>
              </div>
            </div>
          )}

          <div className="ai-form-group">
            <label>Provider</label>
            <select value={companyProvider} onChange={e => setCompanyProvider(e.target.value)}>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Anthropic Claude</option>
            </select>
          </div>
          <div className="ai-form-group">
            <label>API Key</label>
            <input
              type="password"
              value={companyApiKey}
              onChange={e => setCompanyApiKey(e.target.value)}
              placeholder="Company API key"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="ai-activate-btn"
              onClick={async () => {
                setCompanyErr('');
                setCompanyMsg('');
                try {
                  const { data } = await api.post('/ai/company-key', { provider: companyProvider, apiKey: companyApiKey });
                  setCompanyMsg(data.message);
                  setCompanyApiKey('');
                  loadConfig();
                } catch (err) {
                  setCompanyErr(err.response?.data?.error || 'Failed to set company key.');
                }
              }}
              disabled={!companyApiKey.trim()}
            >
              Activate Company Key
            </button>
            {companyKeyConfig?.configured && (
              <button
                className="ai-deactivate-btn"
                onClick={async () => {
                  try {
                    await api.delete('/ai/company-key');
                    setCompanyMsg('Company key deactivated.');
                    loadConfig();
                  } catch {}
                }}
              >
                Deactivate
              </button>
            )}
          </div>
          {companyMsg && <div style={{ marginTop: 10, fontSize: 12, color: '#10B981', fontWeight: 600 }}>{companyMsg}</div>}
          {companyErr && <div style={{ marginTop: 10, fontSize: 12, color: '#EF4444', fontWeight: 600 }}>{companyErr}</div>}
        </div>
      )}

      {/* AI Features Info */}
      <div className="ai-features-info">
        <h4>Available AI Features</h4>
        <div className="ai-feature-list">
          {FEATURES.map((f, i) => (
            <div key={i} className="ai-feature-item">
              <span className="ai-feature-item-icon">{f.icon}</span>
              <div style={{ flex: 1 }}>
                <span className="ai-feature-item-label">{f.label}</span>
                <span className={`ai-feature-item-priority ${f.priority}`} style={{ marginLeft: 6 }}>{f.priority}</span>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>{f.trigger}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          <strong>High priority</strong> features use company fallback key if your quota is exhausted.<br />
          <strong>Low priority</strong> features notify you to try again later.
        </div>
      </div>
    </div>
  );
}
