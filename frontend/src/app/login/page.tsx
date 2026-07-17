'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import AuthBrandPanel from '@/components/AuthBrandPanel';

const IS_DEV = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(IS_DEV ? 'demo@legaltrack.com' : '');
  const [password, setPassword] = useState(IS_DEV ? 'demo1234' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { token, user } = await auth.login(email, password);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthBrandPanel />
      <div className="auth-form-panel">
        <div className="auth-card">
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-sub">Track and bill your legal work automatically</p>
          {error && <div className="auth-error">{error}</div>}
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={{ marginBottom: 0 }}>Password</label>
                <Link href="/forgot-password" style={{ color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}>Forgot password?</Link>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%', justifyContent:'center'}}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="auth-link">No account? <Link href="/register">Register</Link></p>
          {IS_DEV && (
            <p style={{marginTop:12, fontSize:11, color:'var(--text3)', textAlign:'center'}}>Demo: demo@legaltrack.com / demo1234</p>
          )}
        </div>
      </div>
    </div>
  );
}
