import { Scale } from 'lucide-react';

export default function AuthBrandPanel() {
  return (
    <div className="auth-brand-panel">
      <div className="auth-brand-mark"><Scale size={20} /></div>
      <h1 className="auth-brand-title">Billable time, tracked automatically.</h1>
      <p className="auth-brand-sub">
        LegalTrack captures your team's research and drafting time, matches it to the right
        client, and turns it into invoices — so your firm spends less time on timesheets.
      </p>

      {/* Mock product preview instead of a generic icon+bullet list */}
      <div className="auth-mock">
        <div className="auth-mock-titlebar">
          <span className="auth-mock-dot" />
          <span className="auth-mock-dot" />
          <span className="auth-mock-dot" />
        </div>
        <div className="auth-mock-body">
          <div className="auth-mock-row">
            <div className="auth-mock-bar" style={{ maxWidth: '55%' }} />
            <span className="auth-mock-chip" style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}>Browser</span>
          </div>
          <div className="auth-mock-row">
            <div className="auth-mock-bar" style={{ maxWidth: '75%' }} />
            <span className="auth-mock-chip" style={{ background: 'color-mix(in srgb, var(--purple) 18%, transparent)', color: 'var(--purple)' }}>Desktop</span>
          </div>
          <div className="auth-mock-row">
            <div className="auth-mock-bar" style={{ maxWidth: '35%' }} />
            <span className="auth-mock-chip" style={{ background: 'color-mix(in srgb, var(--green) 18%, transparent)', color: 'var(--green)' }}>Billed</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>This week</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Rs. 84,500</span>
          </div>
        </div>
      </div>
    </div>
  );
}
