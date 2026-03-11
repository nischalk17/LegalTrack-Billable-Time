'use client';
import { useEffect, useState } from 'react';
import { activities, Activity } from '@/lib/api';
import { Globe, Monitor, RefreshCw } from 'lucide-react';
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

  useEffect(() => { load(); }, [filter, date, offset]);

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
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text2)'}}>Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={7}>
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
                  <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}}>
                    {a.window_title || a.domain || '—'}
                  </div>
                  {a.domain && <div style={{fontSize:11,color:'var(--text3)'}}>{a.domain}</div>}
                </td>
                <td style={{fontSize:12,color:'var(--text2)'}}>{a.file_name || '—'}</td>
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
