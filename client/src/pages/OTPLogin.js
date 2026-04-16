import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

export default function OTPLogin() {
  const [step, setStep] = useState('email'); // 'email' or 'verify'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { requestOTP, verifyOTP } = useAuth();
  const navigate = useNavigate();

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await requestOTP(email);
      setMessage(data.message);
      setStep('verify');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to request OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await verifyOTP(email, code);
      if (data.isFirstLogin) {
        navigate('/set-password');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-gradient">
        <div className="auth-brand">
          <div className="auth-logo">A</div>
          <h1 className="auth-brand-name">Avadeti Team</h1>
          <p className="auth-tagline">Your company, one platform</p>
        </div>
      </div>
      <div className="auth-form-side">
        {step === 'email' ? (
          <form className="auth-card" onSubmit={handleRequestOTP}>
            <span className="link back-link" onClick={() => navigate('/login')}>← Back to Login</span>
            <div className="auth-card-header">
              <div className="auth-icon-box purple">🔒</div>
              <h2>Login with OTP</h2>
              <p>Enter your email to request a one-time password</p>
            </div>
            {error && <div className="auth-error">{error}</div>}
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@avadeti.com" required autoFocus />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Requesting...' : 'Request OTP'}
            </button>
          </form>
        ) : (
          <form className="auth-card" onSubmit={handleVerifyOTP}>
            <span className="link back-link" onClick={() => setStep('email')}>← Back</span>
            <div className="auth-card-header">
              <div className="auth-icon-box green">🛡️</div>
              <h2>Enter OTP</h2>
              <p className="auth-message">{message}</p>
            </div>
            {error && <div className="auth-error">{error}</div>}
            <div className="form-group">
              <label>6-Digit OTP</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="otp-input"
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <div className="auth-alt-action">
              <span className="link" onClick={handleRequestOTP}>Resend OTP</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
