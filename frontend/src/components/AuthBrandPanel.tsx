const ENTRIES = [
  { idx: '01', desc: 'Legal research — Westlaw', time: '1h 20m' },
  { idx: '02', desc: 'Contract drafting', time: '2h 05m' },
  { idx: '03', desc: 'Client correspondence', time: '0h 35m' },
  { idx: '04', desc: 'Deposition review', time: '0h 48m' },
];

export default function AuthBrandPanel() {
  return (
    <div className="auth-brand-panel">
      <div className="auth-brand-mark">LegalTrack / Docket</div>
      <h1 className="auth-brand-title">
        Billable hours, <em>tracked automatically</em>, matched to the right client.
      </h1>
      <p className="auth-brand-sub">
        LegalTrack captures your team's research and drafting time in the background,
        tags it to the right matter, and turns it into invoices — no manual timesheets.
      </p>

      <div className="auth-mock">
        {ENTRIES.map(e => (
          <div className="auth-mock-row" key={e.idx}>
            <span className="auth-mock-idx">{e.idx}</span>
            <span className="auth-mock-label">{e.desc}</span>
            <span className="auth-mock-value">{e.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
