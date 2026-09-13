import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Star, X, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import API_URL from '../config';

const LS_KEY = 'autograph_watchlist';

function loadWatchlist() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function saveWatchlist(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export default function Watchlist({ currentTicker, onSelect }) {
  const [open, setOpen]     = useState(false);
  const [tickers, setTickers] = useState(loadWatchlist);
  const [quotes, setQuotes]  = useState({});
  const [loading, setLoading] = useState(false);
  const quotesTs = React.useRef(0);
  const QUOTE_TTL = 60_000;

  const isWatched = currentTicker && tickers.includes(currentTicker);

  const toggle = () => {
    const updated = isWatched
      ? tickers.filter(t => t !== currentTicker)
      : [...tickers, currentTicker];
    setTickers(updated);
    saveWatchlist(updated);
  };

  const remove = (t) => {
    const updated = tickers.filter(x => x !== t);
    setTickers(updated);
    saveWatchlist(updated);
  };

  const refreshQuotes = useCallback(async (force = false) => {
    if (!tickers.length) return;
    if (!force && Date.now() - quotesTs.current < QUOTE_TTL) return;
    setLoading(true);
    const results = await Promise.allSettled(
      tickers.map(t => axios.get(`${API_URL}/api/stock/quote/${t}`).then(r => r.data))
    );
    const map = {};
    results.forEach((r, i) => { if (r.status === 'fulfilled') map[tickers[i]] = r.value; });
    setQuotes(map);
    quotesTs.current = Date.now();
    setLoading(false);
  }, [tickers, QUOTE_TTL]);

  useEffect(() => { if (open) refreshQuotes(); }, [open, refreshQuotes]);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        {currentTicker && (
          <button
            onClick={toggle}
            title={isWatched ? 'Usuń z watchlisty' : 'Dodaj do watchlisty'}
            style={{ background: isWatched ? 'rgba(250,204,21,0.12)' : '#2a2a2a', border: `1px solid ${isWatched ? 'rgba(250,204,21,0.4)' : '#333'}`, borderRadius: '7px', color: isWatched ? '#facc15' : '#777', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
          >
            <Star size={15} fill={isWatched ? '#facc15' : 'none'} />
          </button>
        )}
        <button
          onClick={() => setOpen(p => !p)}
          style={{ background: open ? 'rgba(250,204,21,0.1)' : '#2a2a2a', border: `1px solid ${open ? 'rgba(250,204,21,0.35)' : '#333'}`, borderRadius: '7px', color: open ? '#facc15' : '#b0b0b0', padding: '6px 12px', cursor: 'pointer', fontSize: '0.79rem', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
        >
          <Star size={14} fill={tickers.length ? '#facc15' : 'none'} color={tickers.length ? '#facc15' : 'currentColor'} />
          Watchlist {tickers.length > 0 && <span style={{ background: '#facc15', color: '#000', borderRadius: '10px', padding: '1px 6px', fontSize: '0.7rem', fontWeight: 'bold' }}>{tickers.length}</span>}
        </button>
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '300px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '12px', padding: '1rem', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#facc15', letterSpacing: '0.08em' }}>WATCHLIST</span>
            <button onClick={() => refreshQuotes(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {tickers.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
              Brak obserwowanych. Kliknij ★ przy tickerze.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {tickers.map(t => {
                const q = quotes[t];
                return (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', cursor: 'pointer' }}
                    onClick={() => { onSelect(t); setOpen(false); }}>
                    <span style={{ fontWeight: 'bold', color: '#fff', flex: 1, fontSize: '0.85rem' }}>{t}</span>
                    {q ? (
                      <>
                        <span style={{ fontSize: '0.82rem', color: '#fff' }}>${q.price?.toFixed(2)}</span>
                        <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '2px', color: q.changePct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 'bold' }}>
                          {q.changePct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {q.changePct > 0 ? '+' : ''}{q.changePct}%
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                    )}
                    <button onClick={e => { e.stopPropagation(); remove(t); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', marginLeft: '2px' }}>
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
