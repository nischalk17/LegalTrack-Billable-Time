'use client';
import { useEffect, useState } from 'react';
import { activities, entries, suggestions, analytics, ActivityStats } from '@/lib/api';
import { Clock, Monitor, Globe, Laptop, Puzzle, UserPlus, KeyRound, Lightbulb, FileText } from 'lucide-react';
import Link from 'next/link';
import { ResponsiveContainer, BarChart, Bar } from 'recharts';
import Skeleton from '@/components/ui/Skeleton';

function formatHours(seconds: string | number) {
  const s = Number(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DashboardPage() {
  const [stats, setStats]     = useState<ActivityStats | null>(null);
  const [hoursByHour, setHoursByHour] = useState<{ hour: number; minutes: number }[]>([]);
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
      analytics.getDaily(today),
    ]).then(([s, e, sug, act, daily]) => {
      setStats(s);
      setEntriesCount(e.total);
      setPendingCount(sug.suggestions.length);
      setRecentActivities(act.activities);
      setHoursByHour(daily.hours_by_hour || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const totalSeconds = stats?.by_source.reduce((acc, s) => acc + Number(s.total_seconds), 0) || 0;
  const browserTime = Number(stats?.by_source.find(s => s.source_type === 'browser')?.total_seconds || 0);
  const desktopTime = Number(stats?.by_source.find(s => s.source_type === 'desktop')?.total_seconds || 0);
  const maxSourceTime = Math.max(browserTime, desktopTime, 1);
  const topApp = stats?.top_apps?.[0];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Today — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {loading ? (
        <div className="bento-grid">
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
      ) : (
        <div className="bento-grid">
          <div className="bento-hero">
            <div>
              <div className="stat-label">Total Tracked Today</div>
              <div className="bento-hero-value">{formatHours(totalSeconds)}</div>
              <div className="stat-sub">{stats?.by_source.reduce((a,s) => a + Number(s.event_count), 0) || 0} tracked events</div>
            </div>
            {hoursByHour.length > 0 && (
              <div style={{ height: 48, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hoursByHour}>
                    <Bar dataKey="minutes" fill="var(--accent)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bento-card">
            <div className="card-title">Source Split</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}><Globe size={12} /> Browser</span>
                  <span className="duration">{formatHours(browserTime)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(browserTime / maxSourceTime) * 100}%`, background: 'var(--accent)', borderRadius: 3 }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}><Laptop size={12} /> Desktop</span>
                  <span className="duration">{formatHours(desktopTime)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(desktopTime / maxSourceTime) * 100}%`, background: 'var(--purple)', borderRadius: 3 }} />
                </div>
              </div>
            </div>
          </div>

          <div className="bento-card bento-small">
            <div className="stat-label">Manual Entries</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{entriesCount}</div>
            <div className="stat-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={11} /> Logged time entries</div>
          </div>
          <div className="bento-card bento-small">
            <div className="stat-label">Pending Suggestions</div>
            <div className="stat-value" style={{ color: 'var(--yellow)' }}>{pendingCount}</div>
            <div className="stat-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Lightbulb size={11} /> Ready to convert</div>
          </div>
          <div className="bento-card bento-small">
            <div className="stat-label">Top Application</div>
            <div className="stat-value" style={{ fontSize: 18, fontFamily: 'var(--font-sans)' }}>{topApp?.app_name || '—'}</div>
            <div className="stat-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Monitor size={11} /> {topApp ? formatHours(topApp.total_seconds) : 'No activity yet'}</div>
          </div>
        </div>
      )}

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        {/* Top Apps */}
        <div className="card">
          <div className="card-title">Top Applications Today</div>
          {loading ? <Skeleton height={120} /> : stats?.top_apps.length === 0 ? (
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
          {loading ? <Skeleton height={120} /> : recentActivities.length === 0 ? (
            <div style={{color:'var(--text2)',fontSize:13}}>
              No activity yet. Pair the browser extension to start tracking automatically.
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {recentActivities.slice(0,6).map((a) => {
                const SourceIcon = a.source_type === 'browser' ? Globe : Laptop;
                return (
                  <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border)',paddingBottom:6}}>
                    <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:8}}>
                      <SourceIcon size={13} style={{color:'var(--text3)', flexShrink:0}} />
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {a.window_title || a.domain || a.app_name}
                        </div>
                        <div style={{fontSize:11,color:'var(--text3)'}}>{a.app_name || a.domain}</div>
                      </div>
                    </div>
                    <span className="duration" style={{marginLeft:8}}>{Math.round(a.duration_seconds/60)}m</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Setup instructions */}
      <div className="card" style={{marginTop:16, borderColor:'var(--border2)'}}>
        <div className="card-title">Setup Guide</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
          {[
            { icon: Puzzle, title: 'Pair the Extension', steps: ['Load /extension unpacked in Chrome', 'Go to Settings → Extension', 'Generate a pairing code', 'Enter it in the extension popup'], href: '/settings/extension' },
            { icon: UserPlus, title: 'Invite Your Team', steps: ['Go to Settings → Team', 'Invite a teammate by email', 'Assign their role', 'They share your clients & bills'], href: '/settings/team' },
            { icon: KeyRound, title: 'Set Tracking Rules', steps: ['Go to Rules', 'Map a domain/app to a client', 'Activity auto-tags to that client', 'Review suggestions before billing'], href: '/rules' },
          ].map(({ icon: Icon, title, steps, href }) => (
            <Link key={title} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{fontWeight:500,marginBottom:8,display:'flex',alignItems:'center',gap:8,color:'var(--text)'}}>
                <Icon size={15} style={{color:'var(--accent)'}} /> {title}
              </div>
              <ol style={{paddingLeft:16,color:'var(--text2)',fontSize:12,display:'flex',flexDirection:'column',gap:3}}>
                {steps.map((s,i) => <li key={i}>{s}</li>)}
              </ol>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
