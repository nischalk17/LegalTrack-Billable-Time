'use client';
import { useEffect, useState } from 'react';
import { rules, clients, TrackingRule, Client } from '@/lib/api';
import { Trash2, Edit, Plus, Check } from 'lucide-react';

export default function RulesPage() {
  const [data, setData] = useState<TrackingRule[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<TrackingRule>>({
    rule_type: 'domain', match_type: 'contains', priority: 0
  });

  const [testInput, setTestInput] = useState({ domain: '', app_name: '', window_title: '', file_name: '' });
  const [testResult, setTestResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([rules.list(), clients.list()]);
      setData(rRes);
      setAllClients(cRes);
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) await rules.update(editingId, form);
      else await rules.create(form as TrackingRule);
      setShowModal(false);
      load();
    } catch(e) {}
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await rules.test(testInput);
      setTestResult(res);
    } catch(e) { setTestResult({ error: 'Failed to test' }); }
  };

  const openForm = (r?: TrackingRule) => {
    if (r) {
      setEditingId(r.id);
      setForm({ client_id: r.client_id, matter: r.matter, rule_type: r.rule_type, pattern: r.pattern, match_type: r.match_type, priority: r.priority });
    } else {
      setEditingId(null);
      setForm({ rule_type: 'domain', match_type: 'contains', priority: 0 });
    }
    setShowModal(true);
  };

  const getPlaceholder = (type: string) => {
    if (type === 'domain') return 'e.g. westlaw.com';
    if (type === 'app_name') return 'e.g. Microsoft Word';
    if (type === 'window_title') return 'e.g. Motion';
    if (type === 'file_extension') return 'e.g. .docx';
    return '';
  };

  return (
    <div>
      <div className="page-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h1 className="page-title">Tracking Rules</h1>
          <p className="page-sub">Auto-tag activities to clients via window / app matching</p>
        </div>
        <button className="btn btn-primary" onClick={() => openForm()}><Plus size={14} style={{marginRight:4}}/> New Rule</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Rule Type</th>
              <th>Pattern</th>
              <th>Match Type</th>
              <th>Mapped Client</th>
              <th>Mapped Matter</th>
              <th align="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{textAlign:'center',padding:20}}>Loading...</td></tr> : 
             data.length === 0 ? <tr><td colSpan={7} style={{textAlign:'center',padding:20}}>No rules. Create one to auto-tag activities.</td></tr> :
             data.map(r => (
               <tr key={r.id}>
                 <td><span className="badge badge-secondary">{r.priority}</span></td>
                 <td>{r.rule_type.replace('_', ' ')}</td>
                 <td style={{fontFamily:'var(--font-mono)', fontSize:12}}>"{r.pattern}"</td>
                 <td>{r.match_type.replace('_', ' ')}</td>
                 <td style={{fontWeight:500, color:'var(--accent)'}}>{r.client_name}</td>
                 <td>{r.matter || '—'}</td>
                 <td align="right">
                   <button className="btn btn-sm" onClick={() => openForm(r)} style={{background:'transparent', color:'var(--text2)'}} title="Edit"><Edit size={14}/></button>
                   <button className="btn btn-sm" onClick={async () => { if(confirm('Delete?')) { await rules.delete(r.id); load(); } }} style={{background:'transparent', color:'var(--red)'}} title="Delete"><Trash2 size={14}/></button>
                 </td>
               </tr>
             ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:32}}>
        <div className="card-header"><h3>Test Rules Engine</h3></div>
        <div className="card-body">
          <form onSubmit={handleTest} style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end'}}>
            <div className="form-group" style={{flex:1, minWidth:150}}>
              <label>Domain</label>
              <input type="text" className="form-control" value={testInput.domain} onChange={e=>setTestInput({...testInput, domain:e.target.value})} />
            </div>
            <div className="form-group" style={{flex:1, minWidth:150}}>
              <label>App Name</label>
              <input type="text" className="form-control" value={testInput.app_name} onChange={e=>setTestInput({...testInput, app_name:e.target.value})} />
            </div>
            <div className="form-group" style={{flex:1, minWidth:150}}>
              <label>Window Title</label>
              <input type="text" className="form-control" value={testInput.window_title} onChange={e=>setTestInput({...testInput, window_title:e.target.value})} />
            </div>
            <div className="form-group" style={{flex:1, minWidth:150}}>
              <label>File Name</label>
              <input type="text" className="form-control" value={testInput.file_name} onChange={e=>setTestInput({...testInput, file_name:e.target.value})} />
            </div>
            <button className="btn btn-secondary" style={{height:35, marginBottom:16}}>Test</button>
          </form>

          {testResult && (
            <div style={{marginTop:16, padding:16, background:'var(--surface2)', borderRadius:8}}>
              {testResult.match ? (
                <div style={{color:'var(--green)', display:'flex', alignItems:'center', gap:8}}>
                  <Check size={16}/> 
                  <span>Matched: <b>{testResult.client_name}</b> {testResult.matter ? `(${testResult.matter})` : ''} via rule "{testResult.rule.pattern}" ({testResult.rule.rule_type})</span>
                </div>
              ) : (
                <div style={{color:'var(--text2)'}}>No matching rule found. This activity would be Untagged.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Rule' : 'New Rule'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className="card-body">
              <div className="form-group">
                <label>Client Target</label>
                <select className="form-control" value={form.client_id || ''} onChange={e=>setForm({...form, client_id:e.target.value})} required>
                  <option value="">Select client...</option>
                  {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Matter Target (Optional)</label>
                <input type="text" className="form-control" value={form.matter || ''} onChange={e=>setForm({...form, matter:e.target.value})} />
              </div>
              <div style={{display:'flex', gap:16}}>
                <div className="form-group" style={{flex:1}}>
                  <label>Rule Type</label>
                  <select className="form-control" value={form.rule_type} onChange={e=>setForm({...form, rule_type:e.target.value as any})} required>
                    <option value="domain">Domain</option>
                    <option value="app_name">App Name</option>
                    <option value="window_title">Window Title</option>
                    <option value="file_extension">File Extension</option>
                  </select>
                </div>
                <div className="form-group" style={{flex:1}}>
                  <label>Match Type</label>
                  <select className="form-control" value={form.match_type} onChange={e=>setForm({...form, match_type:e.target.value as any})} required>
                    <option value="contains">Contains</option>
                    <option value="exact">Exact</option>
                    <option value="starts_with">Starts With</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Pattern</label>
                <input type="text" className="form-control" value={form.pattern || ''} onChange={e=>setForm({...form, pattern:e.target.value})} placeholder={getPlaceholder(form.rule_type!)} required />
              </div>
              <div className="form-group">
                <label>Priority (Higher runs first)</label>
                <input type="number" className="form-control" value={form.priority || 0} onChange={e=>setForm({...form, priority:parseInt(e.target.value)})} required />
              </div>
              <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
