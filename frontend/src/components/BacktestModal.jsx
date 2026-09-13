import React, { useState, useRef } from 'react';
import axios from 'axios';
import { X, FlaskConical } from 'lucide-react';
import API_URL from '../config';

export default function BacktestModal({ ticker, onClose }) {
  const [slPct, setSlPct] = useState(7);
  const [tpPct, setTpPct] = useState(20);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cache = useRef({});

  const run = async () => {
    const key = `${ticker}-${slPct}-${tpPct}`;
    if (cache.current[key]) { setResult(cache.current[key]); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await axios.post(`${API_URL}/api/stock/backtest`, { ticker, slPct: +slPct, tpPct: +tpPct });
      cache.current[key] = r.data;
      setResult(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Błąd backtestingu.');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
      onClick={onClose}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '2rem', maxWidth: '700px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FlaskConical size={20} color="var(--accent-purple)" /> Backtest — Golden Cross ({ticker})
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={22} /></button>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
          Strategia: wejście na <strong style={{ color: '#fff' }}>Golden Cross (EMA50 &gt; EMA200)</strong>, wyjście na Death Cross lub SL/TP. Dane: ostatnie 2 lata OHLCV.
        </p>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.2rem' }}>
          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>STOP LOSS %</label>
            <input type="number" value={slPct} onChange={e => setSlPct(e.target.value)} min="1" max="50"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '6px 10px', color: '#fff', width: '90px', fontSize: '0.85rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>TAKE PROFIT %</label>
            <input type="number" value={tpPct} onChange={e => setTpPct(e.target.value)} min="1" max="200"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '6px 10px', color: '#fff', width: '90px', fontSize: '0.85rem' }} />
          </div>
          <button onClick={run} disabled={loading}
            style={{ background: 'var(--accent-purple)', border: 'none', borderRadius: '8px', padding: '8px 20px', color: '#fff', fontWeight: 'bold', cursor: loading ? 'wait' : 'pointer', fontSize: '0.85rem', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Liczy...' : '▶ Uruchom'}
          </button>
        </div>

        {error && <p style={{ color: 'var(--accent-red)', fontSize: '0.82rem' }}>{error}</p>}

        {result && (
          <>
            {result.message ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{result.message}</p>
            ) : (
              <>
                {/* STATS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', marginBottom: '1.2rem' }}>
                  {[
                    { label: 'Transakcji',  val: result.totalTrades,              color: '#fff' },
                    { label: 'Win Rate',    val: `${result.winRate}%`,            color: result.winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)' },
                    { label: 'Śr. zwrot',   val: `${result.avgRet > 0 ? '+' : ''}${result.avgRet}%`, color: result.avgRet > 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                    { label: 'Łączny PnL',  val: `${result.totalRet > 0 ? '+' : ''}${result.totalRet}%`, color: result.totalRet > 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                    { label: 'Najlepsza',   val: `+${result.best}%`,             color: 'var(--accent-green)' },
                    { label: 'Najgorsza',   val: `${result.worst}%`,             color: 'var(--accent-red)' },
                    { label: 'SL użyty',    val: `${result.slPct}%`,             color: 'var(--text-muted)' },
                    { label: 'TP użyty',    val: `${result.tpPct}%`,             color: 'var(--text-muted)' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.7rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{s.label}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* TRADES TABLE */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        {['Wejście', 'Wyjście', 'Entry $', 'Exit $', 'PnL %', 'Powód', 'Dni'].map(h => (
                          <th key={h} style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{t.entry}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{t.exit}</td>
                          <td style={{ padding: '6px 8px', color: '#fff' }}>${t.entryPrice}</td>
                          <td style={{ padding: '6px 8px', color: '#fff' }}>${t.exitPrice}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 'bold', color: t.pnlPct > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{t.pnlPct > 0 ? '+' : ''}{t.pnlPct}%</td>
                          <td style={{ padding: '6px 8px', color: t.exitReason === 'TP' ? 'var(--accent-green)' : t.exitReason === 'SL' ? 'var(--accent-red)' : '#f59e0b' }}>{t.exitReason}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{t.durationDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
