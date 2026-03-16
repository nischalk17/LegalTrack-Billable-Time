'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area
} from 'recharts';
import { 
  Calendar, Users, Banknote, Clock, Monitor, Globe, Activity, 
  ChevronLeft, ChevronRight, AlertCircle, RefreshCw, BarChart2, Lightbulb
} from 'lucide-react';
import { formatNPR, formatDuration, formatHour, categoryLabel, fillDateGaps } from '@/lib/chartHelpers';
import { analytics as api } from '@/lib/api';

const COLORS = {
  browser:  '#58a6ff',
  desktop:  '#bc8cff',
  billable: '#3fb950',
  untagged: '#d29922',
  accent:   '#1f6feb',
  red:      '#f85149',
  surface:  '#1c2330',
  border:   '#21262d'
};

const CLIENT_PALETTE = ['#58a6ff','#3fb950','#bc8cff','#d29922','#f85149','#79c0ff'];

// --- Components ---

const LoadingSkeleton = ({ height = 220 }: { height?: number }) => (
  <div className="skeleton-container" style={{ height, background: 'var(--surface2)', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
    <div className="skeleton-pulse" />
    <style jsx>{`
      .skeleton-pulse {
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
        animation: pulse 1.5s infinite;
      }
      @keyframes pulse {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `}</style>
  </div>
);

const EmptyState = ({ message = "No data available", emoji = "📊" }: { message?: string, emoji?: string }) => (
  <div className="empty-state" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', padding: 20 }}>
    <span style={{ fontSize: '2rem', marginBottom: 8 }}>{emoji}</span>
    <p>{message}</p>
  </div>
);

const ErrorState = ({ message, retry }: { message: string, retry: () => void }) => (
  <div style={{ color: COLORS.red, display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'rgba(248, 81, 73, 0.1)', borderRadius: 6, fontSize: '0.9rem' }}>
    <AlertCircle size={16} />
    <span>{message}</span>
    <button onClick={retry} className="retry-btn">
      <RefreshCw size={14} /> Retry
    </button>
    <style jsx>{`
      .retry-btn {
        margin-left: auto;
        background: none;
        border: none;
        color: var(--text);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4%;
        text-decoration: underline;
      }
    `}</style>
  </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: 'var(--text2)', marginBottom: 4 }}>{label}</p>
        {payload.map((entry: any, index: number) => {
          let value = entry.value;
          const k = entry.dataKey;
          const n = entry.name;
          
          if (n === 'Minutes' || n === 'Duration' || k === 'minutes' || k === 'total_minutes') {
            value = formatDuration(entry.value);
          } else if (n === 'Daily Revenue' || n === 'Total Trend' || n === 'Revenue' || k === 'amount_npr' || k === 'cumulative_npr' || k === 'total_npr') {
            value = formatNPR(entry.value);
          }
          
          return (
            <p key={index} style={{ margin: 0, fontSize: '0.9rem', color: entry.color || entry.fill }}>
              {entry.name}: {value}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

// --- Tabs ---

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'clients' | 'revenue'>('daily');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Daily State
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyData, setDailyData] = useState<any>(null);

  // Clients State
  const [clientDates, setClientDates] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [clientData, setClientData] = useState<any>(null);

  // Revenue State
  const [revenuePeriod, setRevenuePeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [revenueData, setRevenueData] = useState<any>(null);
  const [categoryData, setCategoryData] = useState<any>(null);
  const [billStatusData, setBillStatusData] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'daily') {
        setDailyData(await api.getDaily(dailyDate));
      } else if (activeTab === 'clients') {
        setClientData(await api.getClients(clientDates.from, clientDates.to));
      } else if (activeTab === 'revenue') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        
        const [rev, cat, bills] = await Promise.all([
          api.getRevenue(revenuePeriod),
          api.getCategories(thirtyDaysAgo, today),
          api.getBillsStatus()
        ]);
        
        setRevenueData(rev);
        setCategoryData(cat);
        setBillStatusData(bills);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, dailyDate, clientDates, revenuePeriod]);

  return (
    <div className="analytics-container" style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart2 size={24} color={COLORS.accent} /> Analytics Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text2)', fontSize: '0.9rem' }}>Insights into your billable time and productivity</p>
        </div>
      </header>

      <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 1 }}>
        {(['daily', 'clients', 'revenue'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${COLORS.accent}` : '2px solid transparent',
              color: activeTab === tab ? 'var(--text)' : 'var(--text2)',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              fontSize: '0.95rem',
              textTransform: 'capitalize',
              transition: 'all 0.2s'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && <div style={{ marginBottom: 20 }}><ErrorState message={error} retry={fetchData} /></div>}

      <div className="tab-content">
        {activeTab === 'daily' && (
          <div className="daily-tab">
            <div className="controls" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="date-picker" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px' }}>
                <Calendar size={14} style={{ marginRight: 8, color: 'var(--text2)' }} />
                <input 
                  type="date" 
                  value={dailyDate} 
                  onChange={(e) => setDailyDate(e.target.value)}
                  style={{ background: 'none', border: 'none', color: 'var(--text)', outline: 'none', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Tracked', value: formatDuration(dailyData?.total_minutes || 0), icon: Clock, color: COLORS.accent },
                { label: 'Browser Time', value: formatDuration(dailyData?.source_split.find((s:any) => s.source_type === 'browser')?.minutes || 0), icon: Globe, color: COLORS.browser },
                { label: 'Desktop Time', value: formatDuration(dailyData?.source_split.find((s:any) => s.source_type === 'desktop')?.minutes || 0), icon: Monitor, color: COLORS.desktop },
                { label: 'Untagged', value: formatDuration(dailyData?.untagged_minutes || 0), icon: AlertCircle, color: dailyData?.untagged_minutes > 0 ? COLORS.untagged : 'var(--text2)' },
              ].map((stat, i) => (
                <div key={i} className="stat-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 16, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: '0.8rem', marginBottom: 4 }}>
                    <stat.icon size={14} style={{ color: stat.color }} /> {stat.label}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{loading ? '...' : stat.value}</div>
                </div>
              ))}
            </div>

            <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
              <div className="chart-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 500 }}>Hours by Hour of Day</h3>
                {loading ? <LoadingSkeleton height={220} /> : (
                  dailyData?.hours_by_hour.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dailyData.hours_by_hour}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis 
                          dataKey="hour" 
                          tickFormatter={formatHour} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'var(--text2)', fontSize: 12 }} 
                        />
                        <YAxis 
                          tickFormatter={(m) => `${(m/60).toFixed(1)}h`} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'var(--text2)', fontSize: 12 }} 
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar name="Minutes" dataKey="minutes" fill={COLORS.browser} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyState message="No activity tracked on this date" emoji="🌙" />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
                <div className="chart-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 500 }}>Source Split</h3>
                  {loading ? <LoadingSkeleton height={220} /> : (
                    dailyData?.source_split.length > 0 ? (
                      <div style={{ position: 'relative', height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dailyData.source_split}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="minutes"
                              nameKey="source_type"
                            >
                              {dailyData.source_split.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.source_type === 'browser' ? COLORS.browser : COLORS.desktop} />
                              ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend verticalAlign="bottom" height={36} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{loading ? '...' : (dailyData?.total_minutes / 60).toFixed(1)}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text2)', textTransform: 'uppercase' }}>Hours</div>
                        </div>
                      </div>
                    ) : <EmptyState message="No source data" emoji="💻" />
                  )}
                </div>

                <div className="chart-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 500 }}>Top 5 Apps</h3>
                  {loading ? <LoadingSkeleton height={220} /> : (
                    dailyData?.top_apps.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart layout="vertical" data={dailyData.top_apps}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis type="number" hide />
                          <YAxis 
                            type="category" 
                            dataKey="app_name" 
                            width={100} 
                            tick={{ fill: 'var(--text2)', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(t) => t.length > 18 ? t.substring(0, 18) + '...' : t}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar name="Minutes" dataKey="minutes" fill={COLORS.desktop} radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyState message="No app data" emoji="📦" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="clients-tab">
             <div className="controls" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px' }}>
                <Calendar size={14} style={{ marginRight: 8, color: 'var(--text2)' }} />
                <input 
                  type="date" 
                  value={clientDates.from} 
                  onChange={(e) => setClientDates(prev => ({...prev, from: e.target.value}))}
                  style={{ background: 'none', border: 'none', color: 'var(--text)', outline: 'none', fontSize: '0.9rem', width: 130 }}
                />
                <span style={{ margin: '0 8px', color: 'var(--text2)' }}>to</span>
                <input 
                  type="date" 
                  value={clientDates.to} 
                  onChange={(e) => setClientDates(prev => ({...prev, to: e.target.value}))}
                  style={{ background: 'none', border: 'none', color: 'var(--text)', outline: 'none', fontSize: '0.9rem', width: 130 }}
                />
              </div>
            </div>

            <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { 
                  label: 'Total Hours', 
                  value: (() => {
                    const clientMin = (clientData?.by_client || []).reduce((acc: number, r: any) => acc + Number(r.total_minutes || 0), 0);
                    const untaggedMin = Number(clientData?.untagged_minutes || 0);
                    return formatDuration(clientMin + untaggedMin);
                  })(), 
                  icon: Clock, 
                  color: COLORS.accent 
                },
                { label: 'Total Billable NPR', value: formatNPR(clientData?.total_amount_npr || 0), icon: Banknote, color: COLORS.billable },
                { label: 'Top Client', value: clientData?.by_client[0]?.client_name || 'N/A', icon: Users, color: CLIENT_PALETTE[0] },
              ].map((stat, i) => (
                <div key={i} className="stat-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 16, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: '0.8rem', marginBottom: 4 }}>
                    <stat.icon size={14} style={{ color: stat.color }} /> {stat.label}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{loading ? '...' : stat.value}</div>
                </div>
              ))}
            </div>

            <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
              <div className="chart-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 500 }}>Billable Hours by Client</h3>
                {loading ? <LoadingSkeleton height={300} /> : (
                  clientData?.by_client.length > 0 || clientData?.untagged_minutes > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart layout="vertical" data={[...clientData.by_client, { client_id: 'untagged', client_name: 'Untagged', total_minutes: clientData.untagged_minutes }]}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" tickFormatter={(m) => `${(m/60).toFixed(1)}h`} stroke="var(--text2)" fontSize={11} />
                        <YAxis 
                          type="category" 
                          dataKey="client_name" 
                          width={120} 
                          tick={{ fill: 'var(--text2)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(t) => t === 'Untagged' ? '⚠️ Untagged' : (t.length > 18 ? t.substring(0, 15) + '...' : t)}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="total_minutes" name="Duration">
                          { [...clientData.by_client, { client_name: 'Untagged' }].map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.client_name === 'Untagged' ? COLORS.untagged : CLIENT_PALETTE[index % CLIENT_PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyState message="No clients billed in this period" />
                )}
              </div>

              <div className="chart-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 500 }}>Revenue Share</h3>
                {loading ? <LoadingSkeleton height={280} /> : (
                  clientData?.by_client.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={clientData.by_client}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, amount_npr }: any) => `${name} (${formatNPR(amount_npr)})`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="amount_npr"
                          nameKey="client_name"
                        >
                          {clientData.by_client.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={CLIENT_PALETTE[index % CLIENT_PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <EmptyState message="No revenue recorded" />
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="revenue-tab">
            <div className="controls" style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
              {(['7d', '30d', '90d'] as const).map(p => (
                <button 
                  key={p}
                  onClick={() => setRevenuePeriod(p)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 20,
                    border: '1px solid var(--border)',
                    background: revenuePeriod === p ? COLORS.accent : 'var(--surface)',
                    color: revenuePeriod === p ? 'white' : 'var(--text2)',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
                </button>
              ))}
            </div>

            <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Revenue', value: formatNPR(revenueData?.total_npr || 0), icon: Banknote, color: COLORS.billable },
                { label: 'Avg Daily', value: formatNPR(revenueData?.avg_daily_npr || 0), icon: Activity, color: COLORS.accent },
                { label: 'Total Hours', value: `${revenueData?.total_hours || 0}h`, icon: Clock, color: COLORS.browser },
                { label: 'Best Day', value: revenueData?.trend.length > 0 ? formatNPR(Math.max(...revenueData.trend.map((t:any) => t.amount_npr))) : 'N/A', icon: Lightbulb, color: COLORS.untagged },
              ].map((stat, i) => (
                <div key={i} className="stat-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 16, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: '0.8rem', marginBottom: 4 }}>
                    <stat.icon size={14} style={{ color: stat.color }} /> {stat.label}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{loading ? '...' : stat.value}</div>
                </div>
              ))}
            </div>

            <div className="chart-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
               <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 500 }}>Revenue Trend</h3>
               {loading ? <LoadingSkeleton height={260} /> : (
                 revenueData?.trend.length > 0 ? (
                   <ResponsiveContainer width="100%" height={260}>
                     <ComposedChart data={(() => {
                        const filled = fillDateGaps(revenueData.trend, parseInt(revenuePeriod.replace('d', '')));
                        let runningTotal = 0;
                        return filled.map(item => {
                          runningTotal += item.amount_npr;
                          return { ...item, cumulative_npr: runningTotal };
                        });
                     })()}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                       <XAxis 
                        dataKey="date" 
                        tickFormatter={(d) => {
                          const dt = new Date(d);
                          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }}
                        tick={{ fill: 'var(--text2)', fontSize: 11 }}
                        axisLine={false}
                       />
                       <YAxis 
                         yAxisId="left"
                         tickFormatter={(v) => `Rs. ${v < 1000 ? v : (v/1000).toFixed(0)+'k'}`} 
                         tick={{ fill: 'var(--text2)', fontSize: 11 }}
                         axisLine={false}
                       />
                       <YAxis 
                         yAxisId="right" 
                         orientation="right" 
                         tickFormatter={(v) => `Rs. ${v < 1000 ? v : (v/1000).toFixed(0)+'k'}`}
                         tick={{ fill: 'var(--text2)', fontSize: 11 }}
                         axisLine={false}
                       />
                       <Tooltip content={<CustomTooltip />} />
                       <Bar yAxisId="left" dataKey="amount_npr" name="Daily Revenue" fill={COLORS.accent} opacity={0.7} radius={[4, 4, 0, 0]} />
                       <Line 
                         yAxisId="right" 
                         type="monotone" 
                         dataKey="cumulative_npr"
                         name="Total Trend"
                         stroke={COLORS.billable} 
                         strokeWidth={2} 
                         dot={false}
                       />
                     </ComposedChart>
                   </ResponsiveContainer>
                 ) : <EmptyState message="No revenue trend data" />
               )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
               <div className="chart-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 500 }}>Work Categories</h3>
                  {loading ? <LoadingSkeleton height={240} /> : (
                    categoryData?.categories.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={categoryData.categories}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            dataKey="minutes"
                            nameKey="label"
                          >
                            {categoryData.categories.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={CLIENT_PALETTE[index % CLIENT_PALETTE.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} formatter={(v) => formatDuration(v as number)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <EmptyState message="No category data" />
                  )}
               </div>

               <div className="chart-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 500 }}>Bill Status</h3>
                  {loading ? <LoadingSkeleton height={240} /> : (
                    billStatusData?.statuses.length > 0 ? (
                      <div style={{ position: 'relative', height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={billStatusData.statuses}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              dataKey="total_npr"
                              nameKey="status"
                            >
                              {billStatusData.statuses.map((entry: any, index: number) => {
                                const statusColors: any = { paid: COLORS.billable, sent: COLORS.browser, draft: '#8b949e' };
                                return <Cell key={`cell-${index}`} fill={statusColors[entry.status] || COLORS.accent} />;
                              })}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} formatter={(v) => formatNPR(v as number)} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{formatNPR(billStatusData.statuses.reduce((s:any, r:any) => s + Number(r.total_npr || 0), 0))}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text2)', textTransform: 'uppercase' }}>Total Invoiced</div>
                        </div>
                      </div>
                    ) : <EmptyState message="No bills recorded" />
                  )}
               </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .analytics-container {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .stat-card {
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
}
