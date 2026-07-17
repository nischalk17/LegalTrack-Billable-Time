'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import AuthBrandPanel from '@/components/AuthBrandPanel';
import PasswordRules, { isPasswordValid } from '@/components/PasswordRules';
import ThemeToggle from '@/components/ThemeToggle';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(form.password)) {
      setPasswordTouched(true);
      setError('Password does not meet the requirements below');
      return;
    }
    setLoading(true); setError('');
    try {
      const { token, user } = await auth.register(form.email, form.password, form.name);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-sub">Start tracking your billable time automatically</p>
          {error && <div className="auth-error">{error}</div>}
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="form-group">
              <label>Full Name</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                onFocus={() => setPasswordTouched(true)}
                required
              />
              {passwordTouched && <PasswordRules password={form.password} />}
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%',justifyContent:'center'}}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          <p className="auth-link">Already have an account? <Link href="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
