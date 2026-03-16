'use client';
import './globals.css';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Clock, FileText, Lightbulb, LogOut, Scale, Users, Sliders, BarChart2 } from 'lucide-react';
import { activities } from '@/lib/api';
import ActiveSessionBar from '@/components/ActiveSessionBar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [untaggedCount, setUntaggedCount] = useState(0);
  const isAuthPage = pathname === '/login' || pathname === '/register';

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userData = localStorage.getItem('user');
    if (!token && !isAuthPage) {
      router.push('/login');
    } else if (userData) {
      setUser(JSON.parse(userData));
      if (!isAuthPage) {
        activities.getUntaggedCount().then(res => setUntaggedCount(res.count)).catch(() => {});
      }
    }
  }, [pathname]);

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const navItems = [
    { href: '/',            label: 'Dashboard',   icon: LayoutDashboard },
    { href: '/activities',  label: 'Activities',  icon: Clock, badge: untaggedCount > 0 ? `${untaggedCount} untagged` : undefined },
    { href: '/rules',       label: 'Rules',       icon: Sliders },
    { href: '/entries',     label: 'Time Entries', icon: FileText },
    { href: '/clients',     label: 'Clients',     icon: Users },
    { href: '/suggestions', label: 'Suggestions', icon: Lightbulb },
    { href: '/analytics',   label: 'Analytics',   icon: BarChart2 },
  ];

  return (
    <html lang="en">
      <head>
        <title>LegalTrack - Billable Time</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        {isAuthPage ? children : (
          <div className="app-shell">
            <aside className="sidebar">
              <div className="sidebar-logo">
                <Scale size={18} />
                <span>LegalTrack</span>
              </div>
              <nav className="sidebar-nav">
                {navItems.map(({ href, label, icon: Icon, badge }) => (
                  <Link key={href} href={href} className={`nav-item ${pathname === href ? 'active' : ''}`}>
                    <Icon size={16} />
                    <span>{label}</span>
                    {badge && <span style={{marginLeft:'auto', background:'#eab308', color:'#713f12', fontSize:'10px', padding:'2px 6px', borderRadius:'10px', fontWeight:600}}>{badge}</span>}
                  </Link>
                ))}
              </nav>
              <div className="sidebar-footer">
                {user && <div className="user-info"><div className="user-name">{user.name}</div><div className="user-email">{user.email}</div></div>}
                <button onClick={logout} className="logout-btn"><LogOut size={14} /> Logout</button>
              </div>
            </aside>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ActiveSessionBar />
              <main className="main-content" style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
