'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';
import PasswordRules, { isPasswordValid } from '@/components/PasswordRules';
import { KeyRound } from 'lucide-react';

export default function AccountSettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!isPasswordValid(newPassword)) {
      setPasswordTouched(true);
      setError('New password does not meet the requirements below');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await auth.changePassword(currentPassword, newPassword);
      setSuccess('Password changed. Redirecting to sign in...');
      setTimeout(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        router.push('/login');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Account</h1>
        <p className="page-sub">Change your password</p>
      </div>

      <div className="table-wrap" style={{ padding: 24, maxWidth: 420 }}>
        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}
        {success && (
          <div className="auth-error" style={{ background: 'rgba(63,185,80,.1)', borderColor: 'rgba(63,185,80,.3)', color: 'var(--green)', marginBottom: 16 }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Current password</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onFocus={() => setPasswordTouched(true)}
              required
            />
            {passwordTouched && <PasswordRules password={newPassword} />}
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: 'center' }}>
            <KeyRound size={14} /> {loading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12 }}>
          Changing your password signs you out everywhere, including this device.
        </p>
      </div>
    </div>
  );
}
