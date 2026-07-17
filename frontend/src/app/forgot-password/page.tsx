'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import AuthBrandPanel from '@/components/AuthBrandPanel';
import ThemeToggle from '@/components/ThemeToggle';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await auth.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
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
          <h1 className="auth-title">Forgot password</h1>
          <p className="auth-sub">We'll email you a 6-digit code to reset it.</p>
          {error && <div className="auth-error">{error}</div>}
          {sent ? (
            <>
              <div className="auth-error" style={{ background: 'rgba(63,185,80,.1)', borderColor: 'rgba(63,185,80,.3)', color: 'var(--green)' }}>
                If an account exists for that email, a reset code has been sent. Check your inbox.
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
                onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email)}`)}
              >
                Enter code
              </button>
            </>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Sending...' : 'Send reset code'}
              </button>
            </form>
          )}
          <p className="auth-link">Remembered it? <Link href="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
