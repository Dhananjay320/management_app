import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

export default function SetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setPassword } = useAuth();
  const navigate = useNavigate();

  const hasMinLength = newPassword.length >= 8;
  const hasNumber = /\d/.test(newPassword);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasMinLength || !hasNumber || !hasSpecial || !passwordsMatch) return;
    setError('');
    setLoading(true);
    try {
      await setPassword(newPassword);
      navigate('/onboarding');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set password.');
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
          <p className="auth-tagline">Secure your account</p>
        </div>
      </div>
      <div className="auth-form-side">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card-header">
            <div className="auth-icon-box amber">🔐</div>
            <h2>Set Your Password</h2>
            <p>Welcome! Please create a new password to secure your account.</p>
          </div>

          <div className="auth-warning">
            ⚠️ You're using a temporary password. Please set a new one to continue.
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label>New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Create a strong password" required />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm your password" required />
          </div>

          <div className="password-rules">
            <div className={hasMinLength ? 'rule pass' : 'rule'}>✓ At least 8 characters</div>
            <div className={hasNumber ? 'rule pass' : 'rule'}>✓ At least one number</div>
            <div className={hasSpecial ? 'rule pass' : 'rule'}>✓ At least one special character</div>
            <div className={passwordsMatch ? 'rule pass' : 'rule'}>✓ Passwords match</div>
          </div>

          <button type="submit" className="btn-primary btn-green" disabled={loading || !hasMinLength || !hasNumber || !hasSpecial || !passwordsMatch}>
            {loading ? 'Setting password...' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
