'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { clients as clientsApi, Client } from '@/lib/api';
import { Plus, Pencil, Trash2, X, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const EMPTY_CLIENT = {
  name: '', contact_person: '', email: '', phone: '', address: '', pan_number: '',
  default_hourly_rate: 5000, is_vat_applicable: true, notes: ''
};

function ClientModal({ client, onClose, onSave }: {
  client: Partial<Client> | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [form, setForm] = useState<any>(client ? {
    name: client.name, contact_person: client.contact_person || '',
    email: client.email || '', phone: client.phone || '',
    address: client.address || '', pan_number: client.pan_number || '',
    default_hourly_rate: client.default_hourly_rate ?? 5000,
    is_vat_applicable: client.is_vat_applicable ?? true,
    notes: client.notes || ''
  } : { ...EMPTY_CLIENT });
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name) {
      setError('Client name is required'); return;
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
      <div className="modal" style={{maxWidth: 600}}>
        <div className="modal-header">
          <span className="modal-title">{client?.id ? 'Edit Client' : 'New Client'}</span>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        {error && <div style={{background:'rgba(248,81,73,.1)',border:'1px solid rgba(248,81,73,.3)',borderRadius:6,padding:'8px 12px',color:'var(--red)',fontSize:12,marginBottom:12}}>{error}</div>}
        <div className="form-grid">
          <div className="form-group full">
            <label>Client Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Acme Corp" />
          </div>
          <div className="form-group">
            <label>Contact Person</label>
            <input value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+977..." />
          </div>
          <div className="form-group">
            <label>PAN Number</label>
            <input value={form.pan_number} onChange={e => set('pan_number', e.target.value)} placeholder="123456789" />
          </div>
          <div className="form-group full">
            <label>Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Company Address" />
          </div>
          <div className="form-group">
            <label>Default Rate (NPR/hr) *</label>
            <input type="number" min={0} step={100} value={form.default_hourly_rate} onChange={e => set('default_hourly_rate', parseInt(e.target.value) || 0)} />
          </div>
          <div className="form-group" style={{display:'flex', alignItems:'center', marginTop: 28}}>
            <label style={{display:'flex', alignItems:'center', gap: 8, cursor:'pointer', margin: 0}}>
              <input type="checkbox" checked={form.is_vat_applicable} onChange={e => set('is_vat_applicable', e.target.checked)} style={{width:'auto'}} />
              VAT Applicable (13%)
            </label>
          </div>
          <div className="form-group full">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional notes..." />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : client?.id ? 'Update Client' : 'Create Client'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalClient, setModalClient] = useState<Partial<Client> | null | false>(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clientsApi.list();
      setClients(res);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form: any) => {
    if ((modalClient as Client)?.id) {
      await clientsApi.update((modalClient as Client).id, form);
    } else {
      await clientsApi.create(form);
    }
    await load();
  };

  const handleDelete = async (id: string) => {
    await clientsApi.delete(id);
    setDeleteId(null);
    await load();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Clients</h1>
        <p className="page-sub">Manage your clients and their billing settings</p>
      </div>

      <div className="toolbar">
        <div className="toolbar-left" />
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => setModalClient({})}>
            <Plus size={14}/> New Client
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact Person</th>
              <th>Phone</th>
              <th>Rate (NPR/hr)</th>
              <th>VAT</th>
              <th style={{width: 100, textAlign: 'right'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{textAlign:'center',padding:32,color:'var(--text2)'}}>Loading...</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={6}>
                <div className="empty-state">
                  <div className="empty-state-icon">🏢</div>
                  <h3>No clients added</h3>
                  <p>Add your first client to start generating bills.</p>
                </div>
              </td></tr>
            ) : clients.map(c => (
              <tr key={c.id}>
                <td style={{fontWeight:500}}>
                  <Link href={`/clients/${c.id}`} style={{color:'var(--accent)',textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
                    {c.name}
                  </Link>
                </td>
                <td style={{color:'var(--text2)'}}>{c.contact_person || '—'}</td>
                <td style={{color:'var(--text2)'}}>{c.phone || '—'}</td>
                <td style={{fontFamily:'var(--font-mono)'}}>Rs. {(c.default_hourly_rate).toLocaleString('en-IN')}</td>
                <td>{c.is_vat_applicable ? <span className="badge badge-browser">Yes</span> : <span className="badge badge-desktop">No</span>}</td>
                <td style={{textAlign: 'right'}}>
                  <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                    <Link href={`/clients/${c.id}`} className="btn btn-sm btn-secondary"><ChevronRight size={14}/></Link>
                    <button className="btn btn-sm btn-secondary" onClick={() => setModalClient(c)}><Pencil size={11}/></button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteId(c.id)}><Trash2 size={11}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalClient !== false && (
        <ClientModal client={modalClient} onClose={() => setModalClient(false)} onSave={handleSave} />
      )}

      {deleteId && (
        <div className="modal-overlay">
          <div className="modal" style={{width:360}}>
            <div className="modal-header"><span className="modal-title">Delete Client</span></div>
            <p style={{color:'var(--text2)',fontSize:13}}>Are you sure you want to delete this client? All their pending bills will be moved/deleted depending on relations.</p>
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
