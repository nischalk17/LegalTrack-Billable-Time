'use client';
import { use, useEffect, useState } from 'react';
import { clients, bills, Client, Bill } from '@/lib/api';
import { Download, FileText, ChevronLeft, CalendarClock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

function GenerateBillModal({ clientId, clientName, onClose, onGenerated }: {
  clientId: string; clientName: string;
  onClose: () => void; onGenerated: () => void;
}) {
  const [form, setForm] = useState({ date_from: '', date_to: new Date().toISOString().split('T')[0], matter: '' });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.date_from || !form.date_to) {
      setError('Date range is required'); return;
    }
    setGenerating(true); setError('');
    try {
      await bills.generate({ client_id: clientId, ...form });
      onGenerated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Generate Bill for {clientName}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && <div style={{background:'rgba(248,81,73,.1)',border:'1px solid rgba(248,81,73,.3)',borderRadius:6,padding:'8px 12px',color:'var(--red)',fontSize:12,marginBottom:12}}>{error}</div>}
        <p style={{fontSize: 13, color: 'var(--text2)', marginBottom: 16}}>This will aggregate all unbilled time entries within the given date range.</p>
        <div className="form-grid">
          <div className="form-group">
            <label>From Date *</label>
            <input type="date" value={form.date_from} onChange={e => setForm({...form, date_from: e.target.value})} />
          </div>
          <div className="form-group">
            <label>To Date *</label>
            <input type="date" value={form.date_to} onChange={e => setForm({...form, date_to: e.target.value})} />
          </div>
          <div className="form-group full">
            <label>Matter (Optional filter)</label>
            <input value={form.matter} onChange={e => setForm({...form, matter: e.target.value})} placeholder="General representation" />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<(Client & { total_billed: number }) | null>(null);
  const [clientBills, setClientBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenModal, setShowGenModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const dbClient = await clients.get(id);
      setClient(dbClient);
      const allBills = await bills.list();
      setClientBills(allBills.filter(b => b.client_id === id));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleDownloadPdf = async (id: string, number: string) => {
    try {
      const blob = await bills.downloadPdf(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) { alert('Download failed'); }
  };

  const updateStatus = async (id: string, s: 'draft'|'sent'|'paid') => {
    await bills.updateStatus(id, s);
    load();
  };

  if (loading) return <div style={{padding: 32}}>Loading client...</div>;
  if (!client) return <div style={{padding: 32}}>Client not found</div>;

  return (
    <div>
      <div style={{marginBottom: 20}}>
        <Link href="/clients" style={{display:'inline-flex',alignItems:'center',gap:6,color:'var(--text2)',textDecoration:'none',fontSize:13}}>
          <ChevronLeft size={14}/> Back to Clients
        </Link>
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:32}}>
        <div>
          <h1 className="page-title">{client.name}</h1>
          <p className="page-sub">Client details and billing history</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowGenModal(true)}>
          <FileText size={14} /> Generate Bill
        </button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))',gap:16,marginBottom:32}}>
        <div style={{background:'var(--surface)',padding:20,borderRadius:8,border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--text2)',marginBottom:8,textTransform:'uppercase',letterSpacing:0.5}}>Contact Info</div>
          {client.contact_person && <div style={{fontWeight:500}}>{client.contact_person}</div>}
          {client.email && <div><a href={`mailto:${client.email}`} style={{color:'var(--accent)',textDecoration:'none'}}>{client.email}</a></div>}
          {client.phone && <div>{client.phone}</div>}
          {client.address && <div style={{color:'var(--text2)',marginTop:4,fontSize:13}}>{client.address}</div>}
        </div>
        <div style={{background:'var(--surface)',padding:20,borderRadius:8,border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--text2)',marginBottom:8,textTransform:'uppercase',letterSpacing:0.5}}>Billing Details</div>
          <div style={{display:'flex',justifyContent:'space-between',paddingBottom:8,borderBottom:'1px solid var(--border)',marginBottom:8}}>
            <span style={{color:'var(--text2)'}}>Rate:</span>
            <span style={{fontFamily:'var(--font-mono)'}}>Rs. {client.default_hourly_rate.toLocaleString('en-IN')}/hr</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',paddingBottom:8,borderBottom:'1px solid var(--border)',marginBottom:8}}>
            <span style={{color:'var(--text2)'}}>VAT:</span>
            <span>{client.is_vat_applicable ? '13% Applicable' : 'Exempt'}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{color:'var(--text2)'}}>PAN:</span>
            <span style={{fontFamily:'var(--font-mono)'}}>{client.pan_number || 'N/A'}</span>
          </div>
        </div>
        <div style={{background:'var(--surface)',padding:20,borderRadius:8,border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--text2)',marginBottom:8,textTransform:'uppercase',letterSpacing:0.5}}>Financial Summary</div>
          <div style={{fontSize:28,fontWeight:600,fontFamily:'var(--font-mono)',display:'flex',alignItems:'baseline',gap:6}}>
            <span style={{fontSize:14,color:'var(--text2)'}}>Rs.</span> {client.total_billed.toLocaleString('en-IN')}
          </div>
          <div style={{fontSize:12,color:'var(--text3)'}}>Total Billed (Sent + Paid)</div>
        </div>
      </div>

      <h3 style={{marginBottom: 16, fontSize: 16, fontWeight: 600}}>Past Bills</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Period</th>
              <th>Created</th>
              <th>Total (NPR)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clientBills.length === 0 ? (
              <tr><td colSpan={6} style={{padding:32,textAlign:'center',color:'var(--text2)'}}>No bills generated yet</td></tr>
            ) : clientBills.map(b => (
              <tr key={b.id}>
                <td style={{fontFamily:'var(--font-mono)',fontWeight:500}}>{b.bill_number}</td>
                <td>
                  <div style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'var(--text2)'}}>
                    <CalendarClock size={12}/> 
                    {b.date_from ? format(new Date(b.date_from), 'MMM dd') : 'Start'} <ArrowRight size={10}/> {b.date_to ? format(new Date(b.date_to), 'MMM dd, yyyy') : 'End'}
                  </div>
                </td>
                <td style={{fontSize:13,color:'var(--text2)'}}>{format(new Date(b.created_at), 'MMM dd, yyyy')}</td>
                <td style={{fontFamily:'var(--font-mono)',fontWeight:500}}>Rs. {b.total_npr.toLocaleString('en-IN')}</td>
                <td>
                  <span className={`badge ${b.status==='paid'?'badge-suggestion':b.status==='sent'?'badge-browser':'badge-manual'}`}>
                    {b.status.toUpperCase()}
                  </span>
                </td>
                <td>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleDownloadPdf(b.id, b.bill_number)} title="Download PDF"><Download size={12}/></button>
                    {b.status === 'draft' && <button className="btn btn-sm btn-primary" onClick={() => updateStatus(b.id, 'sent')}>Mark Sent</button>}
                    {b.status === 'sent' && <button className="btn btn-sm" style={{background:'var(--green)',color:'black'}} onClick={() => updateStatus(b.id, 'paid')}>Mark Paid</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showGenModal && (
        <GenerateBillModal clientId={client.id} clientName={client.name} onClose={() => setShowGenModal(false)} onGenerated={load} />
      )}
    </div>
  );
}
