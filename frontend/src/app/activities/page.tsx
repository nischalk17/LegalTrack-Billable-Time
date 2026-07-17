'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { activities, clients, Client, Activity } from '@/lib/api';
import { Globe, Monitor, RefreshCw, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export default function ActivitiesPage() {
  const [data, setData] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'browser' | 'desktop'>('all');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  // For assignment dropdown
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignClient, setAssignClient] = useState('');
  const [assignMatter, setAssignMatter] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: LIMIT, offset, date };
      if (filter !== 'all') params.source_type = filter;
      const res = await activities.list(params);
      setData(res.activities);
      setTotal(res.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadClients = async () => {
    if (allClients.length === 0) {
      const c = await clients.list();
      setAllClients(c);
    }
  };

  useEffect(() => { load(); }, [filter, date, offset]);

  const handleAssign = async (id: string) => {
    if (!assignClient) return;
    setSavingAssign(true);
    try {
      await activities.assign(id, { client_id: assignClient, matter: assignMatter });
      setAssigningId(null);
      setAssignClient('');
      setAssignMatter('');
      load();
    } catch(e) {}
    setSavingAssign(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Activity Timeline</h1>
        <p className="page-sub">All tracked browser and desktop events</p>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setOffset(0); }}
            style={{width:150}} />
          {(['all','browser','desktop'] as const).map(f => (
            <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setFilter(f); setOffset(0); }}>
              {f === 'all' ? 'All' : f === 'browser' ? '🌐 Browser' : '🖥 Desktop'}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <span style={{fontSize:12,color:'var(--text2)'}}>{total} events</span>
          <button className="btn btn-sm btn-secondary" onClick={load}><RefreshCw size={12}/></button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>App / Browser</th>
              <th>Title / Domain</th>
              <th>File</th>
              <th>Client Matter</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{textAlign:'center',padding:32,color:'var(--text2)'}}>Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="empty-state">
                  <div className="empty-state-icon">📭</div>
                  <h3>No activities found</h3>
                  <p>Install the Chrome extension or desktop tracker to start capturing activity.</p>
                </div>
              </td></tr>
            ) : data.map(a => (
              <tr key={a.id}>
                <td>
                  <span className={`badge badge-${a.source_type}`}>
                    {a.source_type === 'browser' ? <Globe size={11}/> : <Monitor size={11}/>}
                    {a.source_type}
                  </span>
                </td>
                <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{a.app_name || '—'}</td>
                <td style={{maxWidth:280}}>
                  <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}} title={a.window_title || a.domain || ''}>
                    {a.window_title || a.domain || '—'}
                  </div>
                  {a.domain && <div style={{fontSize:11,color:'var(--text3)'}}>{a.domain}</div>}
                </td>
                <td style={{fontSize:12,color:'var(--text2)'}}>{a.file_name || '—'}</td>
                
                <td>
                  {a.client_id ? (
                    <div style={{fontSize:12}}>
                      <div style={{fontWeight:500, color:'var(--accent)'}}>{a.client_name}</div>
                      {a.matter && <div style={{color:'var(--text2)', fontSize:11}}>{a.matter}</div>}
                    </div>
                  ) : (
                    <div style={{position:'relative'}}>
                      {assigningId === a.id ? (
                        <div style={{background:'var(--surface2)', padding:8, borderRadius:6, border:'1px solid var(--border)', position:'absolute', top:0, left:0, zIndex:10, width:220, boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>
                          <select className="form-control" style={{marginBottom:4, fontSize:11, padding:4}} value={assignClient} onChange={e=>setAssignClient(e.target.value)}>
                            <option value="">Select client...</option>
                            {allClients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <input type="text" className="form-control" style={{marginBottom:4, fontSize:11, padding:4}} placeholder="Matter (optional)" value={assignMatter} onChange={e=>setAssignMatter(e.target.value)} />
                          <div style={{display:'flex', gap:4}}>
                            <button className="btn btn-secondary btn-sm" style={{flex:1, padding:2}} onClick={()=>setAssigningId(null)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" style={{flex:1, padding:2}} disabled={savingAssign || !assignClient} onClick={()=>handleAssign(a.id)}>Save</button>
                          </div>
                        </div>
                      ) : (
                        <span className="badge" style={{background:'#fef08a', color:'#854d0e', cursor:'pointer'}} onClick={() => { setAssigningId(a.id); loadClients(); }}>
                          Untagged <ChevronDown size={10} style={{marginLeft:2, display:'inline'}}/>
                        </span>
                      )}
                    </div>
                  )}
                </td>

                <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text2)'}}>
                  {format(new Date(a.start_time), 'HH:mm:ss')}
                </td>
                <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text2)'}}>
                  {format(new Date(a.end_time), 'HH:mm:ss')}
                </td>
                <td><span className="duration">{formatDuration(a.duration_seconds)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > LIMIT && (
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:16}}>
          <button className="btn btn-secondary btn-sm" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}>← Prev</button>
          <span style={{fontSize:12,color:'var(--text2)',alignSelf:'center'}}>{Math.floor(offset/LIMIT)+1} / {Math.ceil(total/LIMIT)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total}>Next →</button>
        </div>
      )}
    </div>
  );
}
