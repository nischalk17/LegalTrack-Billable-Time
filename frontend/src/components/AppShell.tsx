'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Clock, FileText, Lightbulb, LogOut, Scale, Users, Sliders, BarChart2, Puzzle, UserCog, KeyRound } from 'lucide-react';
import { activities, organizations, auth, OrganizationSummary } from '@/lib/api';
import ActiveSessionBar from '@/components/ActiveSessionBar';
import ThemeToggle from '@/components/ThemeToggle';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [untaggedCount, setUntaggedCount] = useState(0);
  const [myOrgs, setMyOrgs] = useState<OrganizationSummary[]>([]);
  const [switching, setSwitching] = useState(false);
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
        organizations.mine().then(setMyOrgs).catch(() => {});
      }
    }
  }, [pathname, isAuthPage, router]);

  const handleSwitchOrg = async (organizationId: string) => {
    setSwitching(true);
    try {
      await organizations.switch(organizationId);
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  };

  const logout = async () => {
    await auth.logout();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const navItems = [
    { href: '/',            label: 'Dashboard',   icon: LayoutDashboard },
    { href: '/activities',  label: 'Activities',  icon: Clock, badge: untaggedCount > 0 ? `${untaggedCount} untagged` : undefined },
    { href: '/rules',       label: 'Rules',       icon: Sliders },
    { href: '/entries',     icon: FileText,       label: 'Time Entries' },
    { href: '/clients',     icon: Users,          label: 'Clients' },
    { href: '/suggestions', icon: Lightbulb,       label: 'Suggestions' },
    { href: '/analytics',   icon: BarChart2,      label: 'Analytics' },
    { href: '/settings/team',      icon: UserCog,  label: 'Team' },
    { href: '/settings/extension', icon: Puzzle,   label: 'Extension' },
    { href: '/settings/account',   icon: KeyRound, label: 'Account' },
  ];

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-mark"><Scale size={15} /></span>
          <span>LegalTrack</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(({ href, label, icon: Icon, badge }: any) => (
            <Link key={href} href={href} className={`nav-item ${pathname === href ? 'active' : ''}`}>
              <Icon size={16} />
              <span>{label}</span>
              {badge && <span style={{marginLeft:'auto', background:'rgba(210,153,34,.2)', color:'var(--yellow)', fontSize:'10px', padding:'2px 6px', borderRadius:'10px', fontWeight:600}}>{badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          {myOrgs.length > 1 && (
            <select
              value={myOrgs.find(o => o.is_active)?.id || ''}
              onChange={e => handleSwitchOrg(e.target.value)}
              disabled={switching}
              style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
            >
              {myOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {user && <div className="user-info"><div className="user-name">{user.name}</div><div className="user-email">{user.email}</div></div>}
          <ThemeToggle />
          <button onClick={logout} className="logout-btn"><LogOut size={14} /> Logout</button>
        </div>
      </aside>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ActiveSessionBar />
        <main className="main-content fade-in" style={{ flex: 1, overflowY: 'auto' }} key={pathname}>{children}</main>
      </div>
    </div>
  );
}
