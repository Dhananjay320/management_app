import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.isFirstLogin) {
        navigate('/set-password');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-gradient">
        <div className="auth-brand">
          <img src="/niyoq-logo.png" alt="Avadeti" style={{ maxWidth: 280, maxHeight: 140, objectFit: 'contain', marginBottom: 18 }} />
          <p className="auth-tagline" style={{ marginTop: 0 }}>Your company, one platform</p>
        </div>
      </div>
      <div className="auth-form-side">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card-header">
            <h2>Welcome Back!</h2>
            <p>Sign in to Niyoq</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@niyoq.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <div className="form-row">
            <label className="checkbox-label">
              <input type="checkbox" /> Remember me
            </label>
            <span className="link" onClick={() => navigate('/forgot-password')}>Forgot Password?</span>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="auth-alt-action">
            <span className="link" onClick={() => navigate('/otp-login')}>Login with OTP →</span>
          </div>

          <div className="auth-footer">Niyoq v1.0 · Your company, one platform</div>
        </form>
      </div>
    </div>
  );
}
