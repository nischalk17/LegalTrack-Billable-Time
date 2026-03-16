'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { suggestions, BillableSuggestion } from '@/lib/api';
import { Zap, Check, X, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

const CATEGORY_LABELS: Record<string, string> = {
  legal_research: '⚖️ Legal Research',
  document_review: '📄 Document Review',
  drafting: '✍️ Drafting',
  client_communication: '📧 Client Communication',
  client_meeting: '🤝 Client Meeting',
  court_filing: '🏛️ Court Filing',
  analysis: '📊 Analysis',
  research: '🔍 Research',
  general_work: '💼 General Work',
};

function AcceptModal({ suggestion, onClose, onAccept }: {
  suggestion: BillableSuggestion;
  onClose: () => void;
  onAccept: (client: string, matter: string, notes: string) => Promise<void>;
}) {
  const [client, setClient] = useState('');
  const [matter, setMatter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{width:440}}>
        <div className="modal-header">
          <span className="modal-title">Accept Suggestion</span>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:12,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>{suggestion.description}</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>
            {Math.floor(suggestion.duration_minutes/60)}h {suggestion.duration_minutes%60}m
            · {format(new Date(suggestion.date), 'MMM dd, yyyy')}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-group">
            <label>Client *</label>
            <input value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Acme Corp" autoFocus />
          </div>
          <div className="form-group">
            <label>Matter</label>
            <input value={matter} onChange={e => setMatter(e.target.value)} placeholder="e.g. Contract Review" />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." style={{minHeight:60}} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-green" disabled={!client || saving}
            onClick={async () => { setSaving(true); await onAccept(client, matter, notes); setSaving(false); onClose(); }}>
            <Check size={13}/> {saving ? 'Saving...' : 'Create Time Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuggestionsPage() {
  const [data, setData] = useState<BillableSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'accepted' | 'dismissed'>('pending');
  const [acceptTarget, setAcceptTarget] = useState<BillableSuggestion | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await suggestions.list({ status: filter, date });
      setData(res.suggestions);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter, date]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await suggestions.generate(date);
      alert(`Generated ${res.generated} new suggestions`);
      if (filter === 'pending') await load();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDismiss = async (id: string) => {
    await suggestions.dismiss(id);
    setData(d => d.filter(s => s.id !== id));
  };

  const handleAccept = async (client: string, matter: string, notes: string) => {
    if (!acceptTarget) return;
    await suggestions.accept(acceptTarget.id, { client, matter, notes });
    setData(d => d.filter(s => s.id !== acceptTarget.id));
    setAcceptTarget(null);
  };

  const totalMins = data.filter(s => s.status === 'pending').reduce((a, s) => a + s.duration_minutes, 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Billable Suggestions</h1>
        <p className="page-sub">Auto-generated from tracked activity · {data.length} {filter} · {Math.floor(totalMins/60)}h {totalMins%60}m potential</p>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <input type="date" value={date} onChange={e => { setDate(e.target.value); }} style={{width:150}} />
          {(['pending','accepted','dismissed'] as const).map(f => (
            <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={12}/></button>
          <button className="btn btn-primary" onClick={generate} disabled={generating}>
            <Zap size={13}/> {generating ? 'Generating...' : 'Generate from Activities'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading suggestions...</div>
      ) : data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💡</div>
          <h3>No {filter} suggestions</h3>
          <p>
            {filter === 'pending'
              ? 'Click "Generate from Activities" to create suggestions from your tracked time.'
              : `No ${filter} suggestions for this date.`}
          </p>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {data.map(s => (
            <div key={s.id} className="card" style={{display:'flex',alignItems:'center',gap:16,padding:'14px 18px'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                  <span className="category-tag">{CATEGORY_LABELS[s.category] || s.category}</span>
                </div>
                <div style={{fontWeight:500,fontSize:14,marginBottom:2}}>{s.description}</div>
                <div style={{fontSize:12,color:'var(--text2)'}}>
                  {s.app_name && <span style={{marginRight:8}}>🖥 {s.app_name}</span>}
                  {s.domain && <span style={{marginRight:8}}>🌐 {s.domain}</span>}
                  <span>{format(new Date(s.date), 'MMM dd, yyyy')}</span>
                </div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:16,fontWeight:600,marginBottom:2}}>
                  {Math.floor(s.duration_minutes/60)}h {s.duration_minutes%60}m
                </div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{s.duration_minutes} min</div>
              </div>
              {s.status === 'pending' && (
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button className="btn btn-sm btn-green" onClick={() => setAcceptTarget(s)}>
                    <Check size={12}/> Accept
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDismiss(s.id)}>
                    <X size={12}/> Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {acceptTarget && (
        <AcceptModal
          suggestion={acceptTarget}
          onClose={() => setAcceptTarget(null)}
          onAccept={handleAccept}
        />
      )}
    </div>
  );
}
