'use client';
import { useEffect, useState } from 'react';
import { activities, entries, suggestions, ActivityStats } from '@/lib/api';
import { Clock, Monitor, Globe, FileText, Lightbulb, Zap } from 'lucide-react';

function formatHours(seconds: string | number) {
  const s = Number(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DashboardPage() {
  const [stats, setStats]     = useState<ActivityStats | null>(null);
  const [entriesCount, setEntriesCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    Promise.all([
      activities.stats(today),
      entries.list({ limit: 5 }),
      suggestions.list({ status: 'pending' }),
      activities.list({ limit: 8 }),
    ]).then(([s, e, sug, act]) => {
      setStats(s);
      setEntriesCount(e.total);
      setPendingCount(sug.suggestions.length);
      setRecentActivities(act.activities);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const totalSeconds = stats?.by_source.reduce((acc, s) => acc + Number(s.total_seconds), 0) || 0;
  const browserTime = stats?.by_source.find(s => s.source_type === 'browser')?.total_seconds || 0;
  const desktopTime = stats?.by_source.find(s => s.source_type === 'desktop')?.total_seconds || 0;

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Today — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Tracked Today</div>
          <div className="stat-value">{formatHours(totalSeconds)}</div>
          <div className="stat-sub">{stats?.by_source.reduce((a,s) => a + Number(s.event_count), 0) || 0} events</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Browser Time</div>
          <div className="stat-value" style={{color:'var(--accent)'}}>{formatHours(browserTime)}</div>
          <div className="stat-sub">Research &amp; online work</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Desktop Time</div>
          <div className="stat-value" style={{color:'var(--purple)'}}>{formatHours(desktopTime)}</div>
          <div className="stat-sub">Apps &amp; documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Manual Entries</div>
          <div className="stat-value" style={{color:'var(--green)'}}>{entriesCount}</div>
          <div className="stat-sub">Logged time entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Suggestions</div>
          <div className="stat-value" style={{color:'var(--yellow)'}}>{pendingCount}</div>
          <div className="stat-sub">Ready to convert</div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        {/* Top Apps */}
        <div className="card">
          <div className="card-title">Top Applications Today</div>
          {stats?.top_apps.length === 0 ? (
            <div style={{color:'var(--text2)',fontSize:13}}>No activity tracked yet today</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {stats?.top_apps.map((app, i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <Monitor size={13} style={{color:'var(--text3)'}}/>
                    <span style={{fontSize:13}}>{app.app_name}</span>
                  </div>
                  <span className="duration">{formatHours(app.total_seconds)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="card-title">Recent Activity</div>
          {recentActivities.length === 0 ? (
            <div style={{color:'var(--text2)',fontSize:13}}>
              No activity yet. Install the Chrome extension and desktop tracker to start.
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {recentActivities.slice(0,6).map((a) => (
                <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border)',paddingBottom:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {a.source_type === 'browser' ? '🌐' : '🖥'} {a.window_title || a.domain || a.app_name}
                    </div>
                    <div style={{fontSize:11,color:'var(--text3)'}}>{a.app_name || a.domain}</div>
                  </div>
                  <span className="duration" style={{marginLeft:8}}>{Math.round(a.duration_seconds/60)}m</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Setup instructions */}
      <div className="card" style={{marginTop:16, borderColor:'var(--border2)'}}>
        <div className="card-title"><Zap size={12} style={{display:'inline',marginRight:4}}/>Setup Guide</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
          {[
            { icon:'🌐', title:'Chrome Extension', steps:['Open chrome://extensions', 'Enable Developer mode', 'Load Unpacked → /extension folder', 'Paste your auth token in popup'] },
            { icon:'🖥', title:'Desktop Tracker (Windows)', steps:['cd tracker && npm install', 'Copy .env.example to .env', 'Paste JWT token in AUTH_TOKEN', 'Run: npm start'] },
            { icon:'🔑', title:'Get Your Token', steps:['Log in to this dashboard', 'Copy token from browser DevTools', 'Application → Local Storage', 'Key: auth_token'] },
          ].map(({icon,title,steps}) => (
            <div key={title}>
              <div style={{fontWeight:500,marginBottom:8}}>{icon} {title}</div>
              <ol style={{paddingLeft:16,color:'var(--text2)',fontSize:12,display:'flex',flexDirection:'column',gap:3}}>
                {steps.map((s,i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
