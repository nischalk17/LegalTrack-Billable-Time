'use client';
export const dynamic = 'force-dynamic';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import AuthBrandPanel from '@/components/AuthBrandPanel';
import PasswordRules, { isPasswordValid } from '@/components/PasswordRules';
import ThemeToggle from '@/components/ThemeToggle';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(password)) {
      setPasswordTouched(true);
      setError('Password does not meet the requirements below');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true); setError('');
    try {
      await auth.resetPassword(email, otp, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: any) {
      setError(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthBrandPanel />
      <div className="auth-form-panel">
        <ThemeToggle compact />
        <div className="auth-card">
          <h1 className="auth-title">Reset password</h1>
          <p className="auth-sub">Enter the code we emailed you and choose a new password.</p>
          {error && <div className="auth-error">{error}</div>}
          {done ? (
            <div className="auth-error" style={{ background: 'rgba(63,185,80,.1)', borderColor: 'rgba(63,185,80,.3)', color: 'var(--green)' }}>
              Password updated. Redirecting to sign in...
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>6-digit code</label>
                <input
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  required
                  style={{ fontFamily: 'var(--font-mono)', letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
                />
              </div>
              <div className="form-group">
                <label>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setPasswordTouched(true)}
                  required
                />
                {passwordTouched && <PasswordRules password={password} />}
              </div>
              <div className="form-group">
                <label>Confirm new password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Resetting...' : 'Reset password'}
              </button>
            </form>
          )}
          <p className="auth-link">Need a new code? <Link href="/forgot-password">Start over</Link></p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-page" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
