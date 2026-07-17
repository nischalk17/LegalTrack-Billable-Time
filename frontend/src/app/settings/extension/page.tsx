'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { extensionPairing } from '@/lib/api';
import { Puzzle, RefreshCw } from 'lucide-react';

export default function ExtensionSettingsPage() {
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generate = async () => {
    setLoading(true);
    setError('');
    if (intervalRef.current) clearInterval(intervalRef.current);
    try {
      const res = await extensionPairing.start();
      setCode(res.code);
      const expiresAt = new Date(res.expires_at).getTime();
      const tick = () => {
        const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0 && intervalRef.current) {
          clearInterval(intervalRef.current);
          setCode(null);
        }
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to generate pairing code');
    }
    setLoading(false);
  };

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Browser Extension</h1>
        <p className="page-sub">Pair the LegalTrack extension to automatically capture billable browser time</p>
      </div>

      <div className="table-wrap" style={{ padding: 24, maxWidth: 480 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Install the extension, open its popup, and enter a pairing code below. Codes expire after 5 minutes.
        </p>

        {error && (
          <div style={{ background: 'rgba(248,81,73,.1)', border: '1px solid rgba(248,81,73,.3)', borderRadius: 6, padding: '8px 12px', color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {code ? (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 32, letterSpacing: 4, fontWeight: 600, padding: '16px 0' }}>
              {code}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Expires in {secondsLeft}s
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            <Puzzle size={16} /> No active pairing code
          </div>
        )}

        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          <RefreshCw size={14} /> {code ? 'Generate New Code' : 'Generate Pairing Code'}
        </button>
      </div>
    </div>
  );
}
