'use client';
import { useEffect, useState } from 'react';
import { PlayCircle, StopCircle, CornerDownRight } from 'lucide-react';
import { clients, Client } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function ActiveSessionBar() {
  const [session, setSession] = useState<any>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [matter, setMatter] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchActiveSession = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/sessions/active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        if (data) {
          localStorage.setItem('active_session_cache', JSON.stringify({ data, timestamp: Date.now() }));
          setElapsedSeconds(Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000));
        } else {
          localStorage.removeItem('active_session_cache');
        }
      }
    } catch { }
  };

  useEffect(() => {
    const cached = localStorage.getItem('active_session_cache');
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 60000 && data) {
        setSession(data);
        setElapsedSeconds(Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000));
      } else {
        fetchActiveSession();
      }
    } else {
      fetchActiveSession();
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  const loadClients = async () => {
    const res = await clients.list();
    setAllClients(res);
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    setLoading(true);
    const token = localStorage.getItem('auth_token');
    try {
      const res = await fetch(`${API_URL}/api/sessions/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: selectedClient, matter })
      });
      if (res.ok) {
        localStorage.removeItem('active_session_cache');
        await fetchActiveSession();
        setShowModal(false);
        setMatter('');
        setSelectedClient('');
      }
    } finally { setLoading(false); }
  };

  const handleEnd = async () => {
    const token = localStorage.getItem('auth_token');
    try {
      await fetch(`${API_URL}/api/sessions/end`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      localStorage.removeItem('active_session_cache');
      setSession(null);
    } catch { }
  };

  if (!session) return null;

  return (
    <>
      <div style={{
        background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
        padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '13px', zIndex: 50, position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
          <span style={{ color: 'var(--text2)' }}>Tracking:</span>
          <span style={{ fontWeight: 500, color: 'var(--accent)' }}>{session.client_name}</span>
          {session.matter && <><span>—</span><span style={{ color: 'var(--text1)' }}>{session.matter}</span></>}
          <span style={{ marginLeft: '16px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>⏱ {formatDuration(elapsedSeconds)}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowModal(true); loadClients(); }} style={{ padding: '4px 8px', fontSize: '11px' }}>
            <CornerDownRight size={12} style={{ marginRight: '4px' }} /> Switch
          </button>
          <button className="btn btn-sm" onClick={handleEnd} style={{ background: '#ef4444', color: 'white', padding: '4px 8px', fontSize: '11px', border: 'none' }}>
            <StopCircle size={12} style={{ marginRight: '4px' }} /> End
          </button>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Switch Active Matter</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleStart} className="card-body">
              <div className="form-group">
                <label>Client</label>
                <select className="form-control" value={selectedClient} onChange={e => setSelectedClient(e.target.value)} required>
                  <option value="">Select a client...</option>
                  {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Matter (Optional)</label>
                <input type="text" className="form-control" value={matter} onChange={e => setMatter(e.target.value)} placeholder="e.g. Property Dispute" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Switching...' : 'Switch Session'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
