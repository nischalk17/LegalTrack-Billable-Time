'use client';
import { useEffect, useState } from 'react';
import { entries, ManualEntry } from '@/lib/api';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';

const EMPTY_FORM = {
  client: '', matter: '', description: '', date: new Date().toISOString().split('T')[0],
  duration_minutes: 60, source_type: 'manual', notes: ''
};

function EntryModal({ entry, onClose, onSave }: {
  entry: Partial<ManualEntry> | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [clientsArr, setClientsArr] = useState<{id:string, name:string}[]>([]);
  const [form, setForm] = useState<any>(entry ? {
    client: entry.client, matter: entry.matter || '',
    description: entry.description, date: entry.date,
    duration_minutes: entry.duration_minutes,
    source_type: entry.source_type || 'manual', notes: entry.notes || ''
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    import('@/lib/api').then(m => m.clients.list().then(setClientsArr));
  }, []);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.client || !form.description || !form.date || !form.duration_minutes) {
      setError('Client, description, date, and duration are required'); return;
    }
    setSaving(true); setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{entry?.id ? 'Edit Entry' : 'New Time Entry'}</span>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        {error && <div style={{background:'rgba(248,81,73,.1)',border:'1px solid rgba(248,81,73,.3)',borderRadius:6,padding:'8px 12px',color:'var(--red)',fontSize:12,marginBottom:12}}>{error}</div>}
        <div className="form-grid">
          <div className="form-group">
            <label>Client *</label>
            <select value={form.client} onChange={e => set('client', e.target.value)}>
              <option value="">Select a client...</option>
              {clientsArr.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Matter</label>
            <input value={form.matter} onChange={e => set('matter', e.target.value)} placeholder="e.g. Contract Review" />
          </div>
          <div className="form-group full">
            <label>Description *</label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="What work was done?" />
          </div>
          <div className="form-group">
            <label>Date *</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Duration (minutes) *</label>
            <input type="number" min={1} value={form.duration_minutes} onChange={e => set('duration_minutes', parseInt(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label>Source Type</label>
            <select value={form.source_type} onChange={e => set('source_type', e.target.value)}>
              <option value="manual">Manual</option>
              <option value="browser">Browser</option>
              <option value="desktop">Desktop</option>
              <option value="suggestion">Suggestion</option>
            </select>
          </div>
          <div className="form-group">
            <label>Duration (hours)</label>
            <input type="text" readOnly value={`${Math.floor(form.duration_minutes/60)}h ${form.duration_minutes%60}m`}
              style={{background:'var(--bg)',color:'var(--text2)',cursor:'default'}} />
          </div>
          <div className="form-group full">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional notes..." />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : entry?.id ? 'Update Entry' : 'Create Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EntriesPage() {
  const [data, setData] = useState<ManualEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalEntry, setModalEntry] = useState<Partial<ManualEntry> | null | false>(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [showExport, setShowExport] = useState(false);
  const [exportDates, setExportDates] = useState({ from: '', to: '' });
  const [exportClient, setExportClient] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const q = new URLSearchParams();
      if (exportDates.from) q.append('date_from', exportDates.from);
      if (exportDates.to) q.append('date_to', exportDates.to);
      if (exportClient) q.append('client', exportClient);
      
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/reports/pdf?${q.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Export failed');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TimeReport_${exportDates.from||'all'}_${exportDates.to||'all'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      setShowExport(false);
    } catch (err: any) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await entries.list({ limit: 50 });
      setData(res.entries);
      setTotal(res.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form: any) => {
    if ((modalEntry as ManualEntry)?.id) {
      await entries.update((modalEntry as ManualEntry).id, form);
    } else {
      await entries.create(form);
    }
    await load();
  };

  const handleDelete = async (id: string) => {
    await entries.delete(id);
    setDeleteId(null);
    await load();
  };

  const totalMins = data.reduce((a, e) => a + e.duration_minutes, 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Time Entries</h1>
        <p className="page-sub">Manual billable time entries — {total} total · {Math.floor(totalMins/60)}h {totalMins%60}m logged</p>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          {showExport && (
            <div style={{display:'flex',gap:8,alignItems:'center',background:'var(--surface)',padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)'}}>
              <input type="date" value={exportDates.from} onChange={e => setExportDates(d => ({...d, from: e.target.value}))} className="form-input" style={{padding:'4px 8px',fontSize:13,height:28}} />
              <span style={{color:'var(--text2)'}}>to</span>
              <input type="date" value={exportDates.to} onChange={e => setExportDates(d => ({...d, to: e.target.value}))} className="form-input" style={{padding:'4px 8px',fontSize:13,height:28}} />
              <input type="text" placeholder="Client (optional)" value={exportClient} onChange={e => setExportClient(e.target.value)} className="form-input" style={{padding:'4px 8px',fontSize:13,height:28,width:120}} />
              <button className="btn btn-sm btn-primary" onClick={handleExport} disabled={exporting}>
                {exporting ? '...' : 'Download'}
              </button>
              {exportError && <span style={{color:'var(--red)',fontSize:12,marginLeft:8}}>{exportError}</span>}
            </div>
          )}
        </div>
        <div className="toolbar-right">
          <button className="btn btn-secondary" onClick={() => setShowExport(!showExport)}>
            Export PDF
          </button>
          <button className="btn btn-primary" onClick={() => setModalEntry({})}>
            <Plus size={14}/> New Entry
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Matter</th>
              <th>Description</th>
              <th>Duration</th>
              <th>Source</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{textAlign:'center',padding:32,color:'var(--text2)'}}>Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <h3>No entries yet</h3>
                  <p>Create your first manual time entry or accept a suggestion.</p>
                </div>
              </td></tr>
            ) : data.map(e => (
              <tr key={e.id}>
                <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{format(new Date(e.date), 'MMM dd, yyyy')}</td>
                <td style={{fontWeight:500}}>{e.client}</td>
                <td style={{color:'var(--text2)',fontSize:12}}>{e.matter || '—'}</td>
                <td style={{maxWidth:240}}>
                  <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.description}</div>
                </td>
                <td>
                  <span className="duration">{Math.floor(e.duration_minutes/60)}h {e.duration_minutes%60}m</span>
                  <div style={{fontSize:11,color:'var(--text3)'}}>{e.duration_minutes} min</div>
                </td>
                <td><span className={`badge badge-${e.source_type}`}>{e.source_type}</span></td>
                <td style={{fontSize:12,color:'var(--text2)',maxWidth:160}}>
                  <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.notes || '—'}</div>
                </td>
                <td>
                  <div style={{display:'flex',gap:6}}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setModalEntry(e)}><Pencil size={11}/></button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteId(e.id)}><Trash2 size={11}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Entry modal */}
      {modalEntry !== false && (
        <EntryModal
          entry={modalEntry}
          onClose={() => setModalEntry(false)}
          onSave={handleSave}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal" style={{width:360}}>
            <div className="modal-header"><span className="modal-title">Delete Entry</span></div>
            <p style={{color:'var(--text2)',fontSize:13}}>Are you sure you want to delete this time entry? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteId)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
