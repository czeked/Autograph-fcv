import React from 'react';
import GlassCard from './GlassCard.jsx';


const sigColor = s => s === 'BULL' ? 'var(--accent-green)' : s === 'BEAR' ? 'var(--accent-red)' : s === 'OVERBOUGHT' ? 'var(--accent-red)' : s === 'OVERSOLD' ? 'var(--accent-green)' : '#f59e0b';
const sigBg = s => s === 'BULL' ? 'rgba(16,185,129,0.12)' : s === 'BEAR' ? 'rgba(239,68,68,0.12)' : s === 'OVERBOUGHT' ? 'rgba(239,68,68,0.12)' : s === 'OVERSOLD' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)';
const sigLabel = s => s === 'BULL' ? 'BULL' : s === 'BEAR' ? 'BEAR' : s === 'OVERBOUGHT' ? 'OB' : s === 'OVERSOLD' ? 'OS' : s || 'N/A';

const SignalBadge = ({ signal }) => (
  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: sigColor(signal), background: sigBg(signal), padding: '3px 10px', borderRadius: '6px', letterSpacing: '0.03em', display: 'inline-block' }}>{sigLabel(signal)}</span>
);

const isBullish = s => s === 'BULL' || s === 'OVERSOLD';
const isBearish = s => s === 'BEAR' || s === 'OVERBOUGHT';

export default function TrendMatrix({ matrix }) {
  if (!matrix?.length) return null;

  const indicators = ['emaSignal', 'macdSignal', 'rsiSignal', 'priceVsEma'];
  const bullCount = matrix.reduce((c, m) => indicators.reduce((cc, k) => cc + (isBullish(m[k]) ? 1 : 0), c), 0);
  const bearCount = matrix.reduce((c, m) => indicators.reduce((cc, k) => cc + (isBearish(m[k]) ? 1 : 0), c), 0);
  const total = bullCount + bearCount || 1;
  const alignmentPct = Math.round(Math.max(bullCount, bearCount) / total * 100);
  const dominant = bullCount >= bearCount ? 'BULL' : 'BEAR';

  return (
    <GlassCard style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 className="card-title" style={{ color: '#fff', margin: 0 }}>Trend Alignment Matrix</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>ALIGNMENT</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: dominant === 'BULL' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{alignmentPct}% {dominant}</span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em' }}>INDICATOR</th>
              {matrix.map(m => <th key={m.label} style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.05em' }}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '10px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>Price Change</td>
              {matrix.map(m => <td key={m.label} style={{ textAlign: 'center', padding: '10px 12px', color: m.pct === null ? '#64748b' : m.pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontFamily: 'var(--font-body)' }}>{m.pct === null ? 'N/A' : (m.pct >= 0 ? '+' : '') + m.pct.toFixed(1) + '%'}</td>)}
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '10px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>EMA Cross (9/21)</td>
              {matrix.map(m => <td key={m.label} style={{ textAlign: 'center', padding: '8px 12px' }}><SignalBadge signal={m.emaSignal} /></td>)}
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '10px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>MACD</td>
              {matrix.map(m => <td key={m.label} style={{ textAlign: 'center', padding: '8px 12px' }}><SignalBadge signal={m.macdSignal} /></td>)}
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '10px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>RSI Zone</td>
              {matrix.map(m => <td key={m.label} style={{ textAlign: 'center', padding: '8px 12px' }}><SignalBadge signal={m.rsiSignal} /></td>)}
            </tr>
            <tr>
              <td style={{ padding: '10px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>Price vs EMA200</td>
              {matrix.map(m => <td key={m.label} style={{ textAlign: 'center', padding: '8px 12px' }}><SignalBadge signal={m.priceVsEma || 'N/A'} /></td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
