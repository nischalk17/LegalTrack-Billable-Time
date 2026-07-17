import { Scale, Clock, FileText, Users2 } from 'lucide-react';

export default function AuthBrandPanel() {
  return (
    <div className="auth-brand-panel">
      <div className="auth-brand-mark"><Scale size={22} /></div>
      <h1 className="auth-brand-title">Billable time, tracked automatically.</h1>
      <p className="auth-brand-sub">
        LegalTrack captures your team's research and drafting time, matches it to the right
        client, and turns it into invoices — so your firm spends less time on timesheets.
      </p>
      <div className="auth-brand-list">
        <div className="auth-brand-list-item"><Clock size={15} /> Passive time capture from the browser</div>
        <div className="auth-brand-list-item"><Users2 size={15} /> Shared clients and rules across your team</div>
        <div className="auth-brand-list-item"><FileText size={15} /> Draft invoices generated automatically</div>
      </div>
    </div>
  );
}
