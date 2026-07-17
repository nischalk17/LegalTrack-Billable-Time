'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { organizations, Organization, OrgRole } from '@/lib/api';
import { UserPlus, Trash2, Users } from 'lucide-react';

const ROLES: OrgRole[] = ['owner', 'admin', 'lawyer', 'paralegal'];
const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner', admin: 'Admin', lawyer: 'Lawyer', paralegal: 'Paralegal'
};

export default function TeamSettingsPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('lawyer');
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await organizations.me();
      setOrg(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const canManage = org?.role === 'owner' || org?.role === 'admin';

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    setError('');
    try {
      await organizations.invite(inviteEmail, inviteRole);
      setInviteEmail('');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to invite member');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: OrgRole) => {
    setError('');
    try {
      await organizations.updateMemberRole(userId, role);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
    }
  };

  const handleRemove = async (userId: string) => {
    setError('');
    try {
      await organizations.removeMember(userId);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Team</h1>
        <p className="page-sub">
          {org ? <>Members of <strong>{org.name}</strong></> : 'Manage who has access to your organization'}
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,81,73,.1)', border: '1px solid rgba(248,81,73,.3)', borderRadius: 6, padding: '8px 12px', color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {canManage && (
        <div className="table-wrap" style={{ padding: 20, marginBottom: 16 }}>
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
              <label>Invite by email</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teammate@lawfirm.com" required />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as OrgRole)}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" type="submit" disabled={inviting}>
              <UserPlus size={14} /> {inviting ? 'Inviting...' : 'Invite'}
            </button>
          </form>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            They must already have a LegalTrack account under this email.
          </p>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading team...</div>
      ) : !org || org.members.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={28} /></div>
          <h3>No members yet</h3>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {org.members.map(m => (
                <tr key={m.user_id}>
                  <td>{m.name}</td>
                  <td>{m.email}</td>
                  <td>
                    {canManage ? (
                      <select value={m.role} onChange={e => handleRoleChange(m.user_id, e.target.value as OrgRole)}>
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    ) : ROLE_LABELS[m.role]}
                  </td>
                  {canManage && (
                    <td>
                      <button className="btn btn-sm btn-danger" onClick={() => handleRemove(m.user_id)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
