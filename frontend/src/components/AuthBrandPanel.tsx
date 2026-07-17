import { Scale } from 'lucide-react';

export default function AuthBrandPanel() {
  return (
    <div className="auth-brand-panel">
      <div className="auth-brand-mark"><Scale size={18} /></div>
      <h1 className="auth-brand-title">Billable time, kept like a ledger.</h1>
      <p className="auth-brand-sub">
        LegalTrack captures your team's research and drafting time, matches it to the right
        client, and turns it into invoices — so your firm spends less time on timesheets.
      </p>

      {/* Ledger receipt preview instead of a generic icon+bullet list */}
      <div className="auth-mock">
        <div className="auth-mock-titlebar">
          <span>Draft Invoice</span>
          <span>INV-2026-014</span>
        </div>
        <div className="auth-mock-body">
          <div className="auth-mock-row">
            <span className="auth-mock-label">Legal research — Westlaw</span>
            <span className="auth-mock-fill" />
            <span className="auth-mock-value">1h 20m</span>
          </div>
          <div className="auth-mock-row">
            <span className="auth-mock-label">Contract drafting</span>
            <span className="auth-mock-fill" />
            <span className="auth-mock-value">2h 05m</span>
          </div>
          <div className="auth-mock-row">
            <span className="auth-mock-label">Client correspondence</span>
            <span className="auth-mock-fill" />
            <span className="auth-mock-value">0h 35m</span>
          </div>
          <div className="auth-mock-total">
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Total due</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 17, color: 'var(--text)' }}>Rs. 84,500</span>
          </div>
        </div>
      </div>
    </div>
  );
}
