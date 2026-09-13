import GlassCard from './GlassCard.jsx';

const fmt = (v, dec = 1, suffix = '') => v != null ? Number(v).toFixed(dec) + suffix : 'N/A';
const fmtB = (v) => v != null ? '$' + (v / 1000).toFixed(1) + 'B' : 'N/A';

const valColor = (val, good, bad) => {
  if (val == null) return 'var(--text-muted)';
  return val <= good ? 'var(--accent-green)' : val >= bad ? 'var(--accent-red)' : '#f59e0b';
};

const Metric = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: color || '#fff', fontFamily: 'var(--font-body)' }}>{value}</span>
  </div>
);

const SectionTitle = ({ children, color }) => (
  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: color || 'var(--accent-blue)', letterSpacing: '0.08em', marginBottom: '6px', marginTop: '10px' }}>{children}</div>
);

export default function FundamentalsPanel({ fundamentals, relativeStrength }) {
  if (!fundamentals) return null;
  const f = fundamentals;
  const rs = relativeStrength || {};

  return (
    <GlassCard style={{ borderTop: '3px solid #8b5cf6' }}>
      <h3 className="card-title" style={{ color: '#fff', marginBottom: '0.8rem', fontSize: '0.9rem' }}>
        Analiza Fundamentalna
      </h3>

      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {f.company_name && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{f.company_name}</span>}
        {f.sector && <span style={{ fontSize: '0.62rem', color: 'var(--accent-purple)', background: 'rgba(139,92,246,0.12)', padding: '1px 8px', borderRadius: '4px' }}>{f.sector}</span>}
        {f.market_cap && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>MCap: {fmtB(f.market_cap)}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1.5rem' }}>
        <div>
          <SectionTitle>WYCENA</SectionTitle>
          <Metric label="P/E (TTM)" value={fmt(f.pe_ttm)} color={valColor(f.pe_ttm, 20, 50)} />
          <Metric label="P/E (Forward)" value={fmt(f.pe_forward)} color={valColor(f.pe_forward, 18, 40)} />
          <Metric label="PEG" value={fmt(f.peg, 2)} color={valColor(f.peg, 1.0, 2.5)} />
          <Metric label="P/B" value={fmt(f.pb, 2)} color={valColor(f.pb, 3, 10)} />
          <Metric label="P/S (TTM)" value={fmt(f.ps_ttm, 2)} color={valColor(f.ps_ttm, 5, 15)} />
          <Metric label="EV/EBITDA" value={fmt(f.ev_ebitda)} color={valColor(f.ev_ebitda, 15, 30)} />

          <SectionTitle color="var(--accent-green)">WZROST</SectionTitle>
          <Metric label="EPS Growth 3Y" value={fmt(f.eps_growth_3y, 1, '%')} color={f.eps_growth_3y > 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
          <Metric label="EPS Growth 5Y" value={fmt(f.eps_growth_5y, 1, '%')} color={f.eps_growth_5y > 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
          <Metric label="Revenue Growth 3Y" value={fmt(f.revenue_growth_3y, 1, '%')} color={f.revenue_growth_3y > 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
        </div>

        <div>
          <SectionTitle color="#f59e0b">RENTOWNOŚĆ</SectionTitle>
          <Metric label="ROE" value={fmt(f.roe_ttm, 1, '%')} color={valColor(f.roe_ttm, -999, -999)} />
          <Metric label="ROA" value={fmt(f.roa_ttm, 1, '%')} />
          <Metric label="Marża netto" value={fmt(f.net_margin, 1, '%')} color={f.net_margin > 15 ? 'var(--accent-green)' : f.net_margin > 0 ? '#f59e0b' : 'var(--accent-red)'} />
          <Metric label="Marża brutto" value={fmt(f.gross_margin, 1, '%')} />
          <Metric label="Marża oper." value={fmt(f.operating_margin, 1, '%')} />

          <SectionTitle color="var(--accent-red)">ZDROWIE FINANSOWE</SectionTitle>
          <Metric label="Current Ratio" value={fmt(f.current_ratio, 2)} color={valColor(f.current_ratio, -999, -999)} />
          <Metric label="Debt/Equity" value={fmt(f.debt_equity, 2)} color={valColor(f.debt_equity, 0.5, 2.0)} />
          <Metric label="FCF/Share" value={f.fcf_per_share != null ? '$' + fmt(f.fcf_per_share, 2) : 'N/A'} color={f.fcf_per_share > 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
          <Metric label="Beta" value={fmt(f.beta, 2)} color={f.beta > 1.5 ? 'var(--accent-red)' : f.beta < 0.8 ? 'var(--accent-blue)' : '#fff'} />
          {f.dividend_yield > 0 && <Metric label="Div Yield" value={fmt(f.dividend_yield, 2, '%')} color="var(--accent-green)" />}
        </div>
      </div>

      {Object.keys(rs).length > 0 && (
        <div style={{ marginTop: '12px', padding: '8px 10px', background: 'rgba(139,92,246,0.06)', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.15)' }}>
          <SectionTitle color="#a78bfa">SIŁA RELATYWNA vs S&P 500</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '4px' }}>
            {Object.entries(rs).map(([period, v]) => (
              <div key={period} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '2px' }}>{period.toUpperCase()}</div>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: v.alpha > 0 ? '#00e5a0' : '#ff4d6a' }}>
                  {v.alpha > 0 ? '+' : ''}{v.alpha}%
                </div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{v.stock}% vs {v.spy}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
