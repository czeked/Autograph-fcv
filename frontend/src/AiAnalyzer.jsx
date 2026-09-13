import './AiAnalyzer.css';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import API_URL from './config';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, Title, Tooltip, Filler, Legend as ChartLegend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  Search, TrendingUp, TrendingDown, Activity, ChevronDown, ChevronUp, Bot, BrainCircuit, Target, AlertTriangle, Calendar, ExternalLink, HelpCircle, Printer, SlidersHorizontal
} from 'lucide-react';
import GlassCardComponent from './components/GlassCard.jsx';
import LegendModal from './components/Legend.jsx';
import IndicatorsGrid from './components/IndicatorsGrid.jsx';
import IndicatorPrefsModal from './components/IndicatorPrefsModal.jsx';
import { DEFAULT_PREFS, PREFS_LS_KEY, loadPrefs, INDICATOR_GROUPS, savePrefs } from './components/indicatorPrefs.js';
import TrendMatrix from './components/TrendMatrix.jsx';
import Watchlist from './components/Watchlist.jsx';
import FundamentalsPanel from './components/FundamentalsPanel.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import zoomPlugin from 'chartjs-plugin-zoom';
import { useSettings } from './SettingsContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, Title, Tooltip, Filler, ChartLegend, zoomPlugin);

// --- KOMPONENTY POMOCNICZE UI ---

const GlassCard = ({ children, className = "", style = {} }) => (
  <GlassCardComponent className={className} style={style}>{children}</GlassCardComponent>
);

const SentimentGauge = ({ score }) => {
  const rotation = (score / 100) * 180 - 90;
  let color = 'var(--accent-red)';
  let text = 'NIEDŹWIEDŹ';
  if (score > 40) { color = '#f59e0b'; text = 'NEUTRALNY'; }
  if (score > 60) { color = 'var(--accent-green)'; text = 'BYK'; }

  return (
    <div className="gauge-container">
      <div className="gauge-wrapper">
        <div className="gauge-bg" />
        <div
          className="gauge-fill"
          style={{
            borderTopColor: color,
            borderRightColor: color,
            transform: `rotate(${rotation}deg)`
          }}
        />
        <div className="gauge-score" style={{ color }}>{score}</div>
      </div>
      <span className="gauge-label">{text}</span>
    </div>
  );
};


// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--accent-red)' }}>
          <AlertTriangle size={48} style={{ marginBottom: '1rem' }} />
          <h3>Blad renderowania dashboardu</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{this.state.error?.message}</p>
          <button className="tf-btn" style={{ marginTop: '1rem' }} onClick={() => this.setState({ hasError: false, error: null })}>
            Sprobuj ponownie
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- SKELETON LOADERS ---
const SkeletonCard = ({ height = 120, label = '' }) => (
  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '0.75rem', height, animation: 'pulse 1.5s infinite' }}>
    {label && <div style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', fontWeight: 'bold', marginBottom: '0.5rem', letterSpacing: '0.08em' }}>{label}</div>}
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '12px', width: '60%', marginBottom: '8px' }} />
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '4px', height: '10px', width: '40%', marginBottom: '6px' }} />
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '4px', height: '10px', width: '50%' }} />
  </div>
);

// --- GŁÓWNA APLIKACJA ---

export default function AiAnalyzer() {
  const { settings: appSettings } = useSettings();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [symbol, setSymbol] = useState(() => localStorage.getItem('aianalyzer_last_symbol') || '');

  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('aianalyzer_last_timeframe') || '1M');
  const timeframes = ['1W', '1M', '3M', '6M', '1Y'];


  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aianalyzer_last_data')) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [expandedDay, setExpandedDay] = useState(null);
  const [deepDiveDay, setDeepDiveDay] = useState(null);
  const [dayStreamText, setDayStreamText] = useState('');
  const [dayLoading, setDayLoading] = useState(false);
  const [dayArticles, setDayArticles] = useState([]);
  const [showEMA, setShowEMA] = useState(true);
  const [isFirstVisit] = useState(() => !localStorage.getItem(PREFS_LS_KEY));
  const [prefs, setPrefs] = useState(() => loadPrefs() || DEFAULT_PREFS);
  const [showPrefsModal, setShowPrefsModal] = useState(() => !localStorage.getItem(PREFS_LS_KEY));
  const [showBB, setShowBB] = useState(false);
  const [showMACD, setShowMACD] = useState(true);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('aianalyzer_last_active_tab') || 'sygnal');
  const DEFAULT_GLOWNA_ORDER = ['indicators','quant','aiscan','bullbear','trendmatrix','globaldata','fundamentals','anomalies'];
  const [glownaOrder, setGlownaOrder] = useState(() => { try { const s = localStorage.getItem('ag_glowna_order'); if (s) return JSON.parse(s); } catch {} return DEFAULT_GLOWNA_ORDER; });
  const [editingOrder, setEditingOrder] = useState(false);
  const moveGlownaSection = (id, dir) => setGlownaOrder(prev => { const a = [...prev]; const i = a.indexOf(id); const j = i + dir; if (j < 0 || j >= a.length) return prev; [a[i], a[j]] = [a[j], a[i]]; localStorage.setItem('ag_glowna_order', JSON.stringify(a)); return [...a]; });
  const anomalyRef = React.useRef(null);

  // Persist session data
  useEffect(() => {
    if (symbol) localStorage.setItem('aianalyzer_last_symbol', symbol);
    if (data) localStorage.setItem('aianalyzer_last_data', JSON.stringify(data));
    if (activeTab) localStorage.setItem('aianalyzer_last_active_tab', activeTab);
    if (timeframe) localStorage.setItem('aianalyzer_last_timeframe', timeframe);
  }, [symbol, data, activeTab, timeframe]);

  // Sync with global settings when they change
  useEffect(() => {
    if (appSettings.analyzer_defaultTimeframe) setTimeframe(appSettings.analyzer_defaultTimeframe);
    if (appSettings.analyzer_showEMA !== undefined) setShowEMA(appSettings.analyzer_showEMA);
    if (appSettings.analyzer_showBB !== undefined) setShowBB(appSettings.analyzer_showBB);
    if (appSettings.analyzer_showVolume !== undefined) setShowMACD(appSettings.analyzer_showVolume);
  }, [appSettings]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      axios.get(`${API_URL}/api/stock/search?q=${query}`)
        .then(res => setSuggestions(res.data)).catch(() => { });
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      handleSelect(suggestions[0].ticker);
    }
  };

  const fetchAnalysis = async (tickerToFetch) => {
    if (!tickerToFetch) return;
    setLoading(true); setError(''); setExpandedDay(null); setDayStreamText('');
    try {
      const response = await axios.post(`${API_URL}/api/stock/analyze`, {
        ticker: tickerToFetch,
        timeframe: '1Y',
      }, { timeout: 120_000 });
      setData(response.data);
      setActiveTab('glowna');
      setTimeframe('1Y'); // Resetujemy okno na pełny wgląd

      // Dispatch notifications for the notification system — SMART filtering
      const d = response.data;
      const notifItems = [];
      const t = d.ticker || tickerToFetch;

      // Quant recommendation — respect confidence filter
      if (d.analysis?.quant_analysis?.recommendation) {
        const rec = d.analysis.quant_analysis.recommendation;
        const confidence = d.analysis?.quant_analysis?.confidence || 'medium';
        const confFilter = appSettings?.analyzer_confidenceFilter || 'all';
        const shouldNotify = confFilter === 'all' ||
          (confFilter === 'high' && confidence === 'high') ||
          (confFilter === 'medium+' && (confidence === 'high' || confidence === 'medium'));
        if (shouldNotify && rec !== 'TRZYMAJ') {
          notifItems.push({ type: "percent", text: `📊 ${t}: Rekomendacja Quant — ${rec}`, ticker: t });
        }
      }
      // Sentiment — only extreme readings
      if (d.analysis?.sentiment_score != null) {
        const s = d.analysis.sentiment_score;
        if (s > 70 || s < 30) {
          const sLabel = s > 70 ? 'SILNY BYK' : 'SILNY NIEDŹWIEDŹ';
          notifItems.push({ type: "news", text: `🌡️ ${t}: Sentyment rynku — ${sLabel} (${s}/100)`, ticker: t });
        }
      }
      // Anomalies
      if (d.analysis?.anomalies?.length > 0) {
        notifItems.push({ type: "news", text: `⚡ ${t}: Wykryto ${d.analysis.anomalies.length} anomalii cenowych`, ticker: t });
      }
      // Earnings / Reports notifications
      if (d.analysis?.fundamentals) {
        const fund = d.analysis.fundamentals;
        if (fund.earningsGrowth != null && Math.abs(fund.earningsGrowth) > 15) {
          const dir = fund.earningsGrowth > 0 ? 'wzrost' : 'spadek';
          notifItems.push({ type: "reports", text: `📈 ${t}: Raport — ${dir} zysków o ${Math.abs(fund.earningsGrowth).toFixed(1)}%`, ticker: t });
        }
        if (fund.revenueGrowth != null && Math.abs(fund.revenueGrowth) > 20) {
          const dir = fund.revenueGrowth > 0 ? 'wzrost' : 'spadek';
          notifItems.push({ type: "reports", text: `💰 ${t}: Raport — ${dir} przychodów o ${Math.abs(fund.revenueGrowth).toFixed(1)}%`, ticker: t });
        }
      }
      // ESPI/regulatory detection from news
      if (d.analysis?.news && d.analysis.news.length > 0) {
        const regulatoryNews = d.analysis.news.filter(n =>
          n.title && /SEC|ESPI|EBI|regulat|compliance|enforcement|filing|prospectus/i.test(n.title)
        );
        if (regulatoryNews.length > 0) {
          notifItems.push({ type: "espi", text: `📋 ${t}: Komunikat regulacyjny — ${regulatoryNews[0].title}`, ticker: t });
        }
      }
      if (d.setup_warning) {
        notifItems.push({ type: "percent", text: `⚠️ ${t}: ${d.setup_warning}`, ticker: t });
      }
      if (notifItems.length > 0) {
        window.dispatchEvent(new CustomEvent("autograph:notification", {
          detail: { source: "stocks", items: notifItems }
        }));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Błąd pobierania danych z rynku.");
    } finally {
      setLoading(false);
    }
  };

  const expandDay = (dateStr) => {
    if (expandedDay === dateStr) {
      setExpandedDay(null);
      setDayArticles([]);
      return;
    }
    setExpandedDay(dateStr);
    setDeepDiveDay(null);
    setDayStreamText('');
    setTimeout(() => anomalyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

    // Zamiast strzelać do osobnego zacinającego się API, ładujemy to natychmiast z danych głównych
    const anom = data.analysis?.anomalies?.find(a => a.date === dateStr);
    if (anom && anom.articles) {
      setDayArticles(anom.articles);
    } else {
      setDayArticles([]);
    }
  };

  const generateDeepDive = async (dateStr) => {
    setDeepDiveDay(dateStr);
    setDayStreamText('');
    setDayLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/stock/analyze-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: symbol, date: dateStr })
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '');
            if (dataStr === '[DONE]') { setDayLoading(false); break; }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) setDayStreamText(prev => prev + parsed.text);
            } catch (ignore) { 
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setDayStreamText("Błąd ładowania szczegółów z Quantum Core...");
      setDayLoading(false);
    }
  };

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
  };

  const handleSelect = (ticker) => {
    setSymbol(ticker);
    setQuery('');
    setSuggestions([]);
    fetchAnalysis(ticker);
  };

  const filteredHistory = useMemo(() => {
    if (!data?.history) return [];
    let days = 365;
    if (timeframe === '1D') days = 2;
    if (timeframe === '1W') days = 10;
    if (timeframe === '1M') days = 30;
    if (timeframe === '3M') days = 90;
    if (timeframe === '6M') days = 180;
    if (timeframe === '1Y') days = 365;

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - days);
    return data.history.filter(h => new Date(h.t).getTime() >= limitDate.getTime());
  }, [data, timeframe]);

  const chartData = useMemo(() => {
    if (!filteredHistory.length) return null;
    const historySlice = filteredHistory;

    const anomalyDates = new Set(data.analysis?.anomalies?.map(a => a.date) || []);
    // volatile_days = top 40 dni z największym ruchem cenowym (z backendu, pure matematyka)
    const volatileDatesSet = new Set((data.volatile_days || []).map(v => v.date));
    const startIdx = data.history.findIndex(h => h.t === historySlice[0].t);
    const sliceSeries = (arr) => arr ? arr.slice(startIdx, startIdx + historySlice.length) : [];

    const labels = historySlice.map(h => new Date(h.t).toLocaleDateString());
    const prices = historySlice.map(h => h.c);

    const pointRadii = historySlice.map(h => {
      const d = new Date(h.t).toISOString().split('T')[0];
      if (volatileDatesSet.has(d)) return 7;
      if (anomalyDates.has(d)) return 4;
      return 0;
    });
    const pointColors = historySlice.map(h => {
      const d = new Date(h.t).toISOString().split('T')[0];
      if (volatileDatesSet.has(d)) return 'var(--accent-purple)'; // Największe anomalie na fioletowo
      if (anomalyDates.has(d)) return 'rgba(139,92,246, 0.4)'; // Zwykłe dni z newsami bledsze
      return 'transparent';
    });
    const pointBorders = historySlice.map(h => {
      const d = new Date(h.t).toISOString().split('T')[0];
      if (volatileDatesSet.has(d)) return 'rgba(139,92,246, 0.8)';
      if (anomalyDates.has(d)) return 'rgba(139,92,246, 0.2)';
      return 'transparent';
    });

    return {
      labels,
      datasets: [
        {
          label: 'Cena USD',
          data: prices,
          borderColor: 'var(--accent-blue)',
          backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(0, 229, 255, 0.4)');
            gradient.addColorStop(1, 'rgba(0, 229, 255, 0.0)');
            return gradient;
          },
          borderWidth: 3,
          pointRadius: pointRadii,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointBorders,
          pointBorderWidth: 2,
          pointHoverRadius: 11,
          fill: true,
          tension: 0.1
        },
        ...(showEMA && data?.chart_series ? [
          { label: 'EMA 50', data: sliceSeries(data.chart_series.ema50), borderColor: 'rgba(255,165,0,0.85)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false },
          { label: 'EMA 200', data: sliceSeries(data.chart_series.ema200), borderColor: 'rgba(255,80,80,0.85)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false }
        ] : []),
        ...(showBB && data?.chart_series ? [
          { label: 'BB Upper', data: sliceSeries(data.chart_series.bb_upper), borderColor: 'rgba(139,92,246,0.55)', borderWidth: 1, pointRadius: 0, tension: 0.1, fill: false, borderDash: [5, 3] },
          { label: 'BB Middle', data: sliceSeries(data.chart_series.bb_middle), borderColor: 'rgba(139,92,246,0.3)', borderWidth: 1, pointRadius: 0, tension: 0.1, fill: false, borderDash: [2, 3] },
          { label: 'BB Lower', data: sliceSeries(data.chart_series.bb_lower), borderColor: 'rgba(139,92,246,0.55)', borderWidth: 1, pointRadius: 0, tension: 0.1, fill: false, borderDash: [5, 3] }
        ] : [])
      ]
    };
  }, [filteredHistory, data, showEMA, showBB]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    onClick: (event, elements) => {
      if (elements && elements.length > 0) {
        const idx = elements[0].index;
        const h = filteredHistory[idx];
        const dStr = new Date(h.t).toISOString().split('T')[0];
        expandDay(dStr);
        setActiveTab('anomalie');
      }
    },
    plugins: {
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x',
        }
      },
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(11, 15, 25, 0.95)',
        titleFont: { family: 'Outfit', size: 16 },
        bodyFont: { family: 'Inter', size: 14 },
        padding: 16,
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        displayColors: false,
        callbacks: {
          afterBody: (context) => {
            const idx = context[0].dataIndex;
            const h = filteredHistory[idx];
            const dStr = new Date(h.t).toISOString().split('T')[0];
            const anom = data.analysis?.anomalies?.find(a => a.date === dStr);
            const vol = (data.volatile_days || []).find(v => v.date === dStr);
            if (anom) return `\n⚡ AI: ${anom.short_desc}\n(Kliknij po szczegółową analizę!)`;
            if (vol) return `\n📈 Ruch: ${vol.pct > 0 ? '+' : ''}${vol.pct.toFixed(2)}%\n(Kliknij po analizę Quantum!)`;
            return '';
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { maxTicksLimit: 8, color: '#64748b', font: { family: 'Inter' } }
      },
      y: {
        position: 'right',
        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
        ticks: { color: '#94a3b8', font: { family: 'Inter', weight: 600 } }
      }
    }
  };

  return (
    <>
      <Header />

      {showPrefsModal && (
        <IndicatorPrefsModal
          prefs={prefs}
          onSave={(p) => { setPrefs(p); setShowPrefsModal(false); }}
          onClose={() => setShowPrefsModal(false)}
          isFirstTime={isFirstVisit && !localStorage.getItem(PREFS_LS_KEY)}
        />
      )}

      <div className="analyzer-page">
      <main className="main-content">

        {/* TOOLBAR */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '2rem', padding: '8px 12px', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '10px' }}>
          <div className="search-container" style={{ flex: 1 }}>
            <div className="search-input-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="Ticker lub nazwa spółki (np. AAPL, NVDA)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            {suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map((s, i) => (
                  <div key={i} className="suggestion-item" onClick={() => handleSelect(s.ticker)}>
                    <span className="suggestion-ticker">{s.ticker}</span>
                    <span className="suggestion-name">{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: '1px', height: '22px', background: '#2e2e2e', flexShrink: 0 }} />

          <Watchlist currentTicker={data?.ticker} onSelect={handleSelect} />
          <button onClick={() => window.print()} className="header-btn">
            <Printer size={13} /> PDF
          </button>
          <button onClick={() => setShowPrefsModal(true)} className="header-btn header-btn--purple">
            <SlidersHorizontal size={13} /> Preferencje
          </button>
        </div>

    

        {!data && !loading && !error && (
          <div className="empty-state">
            <Target size={64} color="var(--text-muted)" />
            <h2>Wybierz aktywo, aby rozpocząć.</h2>
            <p>System pobierze historię bazową, a algorytm wygeneruje wnioski AI pod Twoje ramy czasowe.</p>
          </div>
        )}

        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p className="loading-text">Trwa praca Quant AI...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <AlertTriangle size={64} color="var(--accent-red)" style={{ marginBottom: '1rem' }} />
            <h2 style={{ color: 'var(--accent-red)' }}>{error}</h2>
          </div>
        )}

        {data && !loading && (
          <ErrorBoundary>
          <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>

            {/* LEWA STRONA (Wykres, Anomalie) */}
            <div className="main-panel">

              <div className="asset-header">
                <div>
                  <h2 className="asset-title">{data.ticker}</h2>
                  <div className="asset-price-row">
                    {(() => {
                      const filtered = filteredHistory;
                      const first = filtered[0];
                      const last = filtered[filtered.length - 1];
                      if (!first || !last) return null;
                      const pct = ((last.c - first.c) / first.c) * 100;
                      const isUp = pct >= 0;
                      return (
                        <>
                          <span className="asset-price">${last.c.toFixed(2)}</span>
                          <span className={`asset-change ${isUp ? 'color-green' : 'color-red'}`}>
                            {isUp ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                            {isUp ? '+' : ''}{pct.toFixed(2)}%
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="timeframe-selector">
                  {timeframes.map(tf => (
                    <button
                      key={tf}
                      onClick={() => handleTimeframeChange(tf)}
                      className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', marginTop: '-4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>OVERLAY:</span>
                <button onClick={() => setShowEMA(p => !p)} className={`tf-btn ${showEMA ? 'active' : ''}`} style={{ fontSize: '0.7rem', padding: '3px 10px', opacity: showEMA ? 1 : 0.55 }}>EMA 50/200</button>
                <button onClick={() => setShowMACD(p => !p)} className="tf-btn" style={{ fontSize: '0.7rem', padding: '3px 10px', opacity: showMACD ? 1 : 0.5 }}>Volume</button>
                <button onClick={() => setShowBB(p => !p)} className={`tf-btn ${showBB ? 'active' : ''}`} style={{ fontSize: '0.7rem', padding: '3px 10px', opacity: showBB ? 1 : 0.55 }}>Bollinger Bands</button>
              </div>
              <GlassCard className="chart-container">
                {chartData ? <Line data={chartData} options={chartOptions} /> : null}
              </GlassCard>

              {/* === VERDICT BANNER === */}
              {data.analysis?.quant_analysis?.recommendation && (() => {
                const rec = data.analysis.quant_analysis.recommendation;
                const score = data.composite_score ?? 50;
                const isBuy = rec === 'LONG';
                const isSell = rec === 'SHORT';
                const vColor = isBuy ? 'var(--accent-green)' : isSell ? 'var(--accent-red)' : '#f59e0b';
                const vBg = isBuy ? 'rgba(16,185,129,0.07)' : isSell ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)';
                const vBorder = isBuy ? 'rgba(16,185,129,0.3)' : isSell ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)';
                const vLabel = isBuy ? 'KUP' : isSell ? 'NIE KUPUJ' : 'OBSERWUJ';
                const conf = data.analysis.quant_analysis?.confidence_level || '';
                const confLabel = conf === 'WYSOKA' ? 'wysokie przekonanie' : conf === 'NISKA' ? 'niskie przekonanie' : 'średnie przekonanie';
                const vIcon = isBuy ? '↑' : isSell ? '↓' : '→';
                const reasons = isBuy
                  ? (data.analysis.bull_case || []).slice(0, 3)
                  : (data.analysis.bear_case || []).slice(0, 3);
                return (
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                    gap: '2rem', alignItems: 'center',
                    background: vBg, border: `1px solid ${vBorder}`,
                    borderLeft: `4px solid ${vColor}`,
                    borderRadius: '10px', padding: '1.5rem 2rem',
                    margin: '1rem 0',
                  }}>
                    <div style={{ textAlign: 'center', minWidth: '120px' }}>
                      <div style={{ fontSize: '3rem', fontWeight: 900, color: vColor, lineHeight: 1 }}>{vIcon}</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: vColor, letterSpacing: '0.04em', marginTop: '4px' }}>{vLabel}</div>
                      <div style={{ fontSize: '0.65rem', color: vColor, opacity: 0.7, marginTop: '6px', fontWeight: 600, letterSpacing: '0.1em' }}>{score}/100</div>
                      <div style={{ fontSize: '0.68rem', color: vColor, opacity: 0.55, marginTop: '2px', letterSpacing: '0.05em' }}>{confLabel}</div>
                    </div>
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                        {[
                          { label: 'WEJŚCIE', val: data.analysis.quant_analysis.entry_target, c: '#fff' },
                          { label: 'STOP LOSS', val: data.analysis.quant_analysis.stop_loss, c: 'var(--accent-red)' },
                          { label: 'TAKE PROFIT', val: data.analysis.quant_analysis.take_profit, c: 'var(--accent-green)' },
                        ].map(({ label, val, c }) => (
                          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 14px' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: c }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {data.analysis.computed_rr != null && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          R:R <strong style={{ color: data.analysis.computed_rr >= 2 ? 'var(--accent-green)' : data.analysis.computed_rr >= 1 ? '#f59e0b' : 'var(--accent-red)' }}>1:{Number(data.analysis.computed_rr).toFixed(1)}</strong>
                          {data.analysis.rr_warning && <span style={{ marginLeft: '10px', color: '#f59e0b' }}>⚠ {data.analysis.rr_warning}</span>}
                        </div>
                      )}
                    </div>
                    {reasons.length > 0 && (
                      <div style={{ minWidth: '260px', maxWidth: '340px', borderLeft: `1px solid ${vBorder}`, paddingLeft: '2rem' }}>
                        <div style={{ fontSize: '0.68rem', color: vColor, fontWeight: 700, letterSpacing: '0.1em', marginBottom: '10px' }}>
                          {isBuy ? 'SCENARIUSZ OPTYMISTYCZNY' : isSell ? 'SCENARIUSZ PESYMISTYCZNY' : 'NA CO ZWRÓCIĆ UWAGĘ'}
                        </div>
                        {reasons.map((r, i) => (
                          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                            <span style={{ color: vColor, fontWeight: 700, flexShrink: 0 }}>{isBuy ? '+' : isSell ? '−' : '·'}</span>
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {false && activeTab === 'sygnal' && data.quant_stats && (
                <IndicatorsGrid qs={data.quant_stats} visibleCards={prefs} />
              )}

              {showMACD && (() => {
                if (!filteredHistory.length) return null;
                const labels = filteredHistory.map(h => new Date(h.t).toLocaleDateString());
                const volumes = filteredHistory.map(h => h.v || 0);
                const volColors = filteredHistory.map((h, i) => {
                  if (i === 0) return 'rgba(100,116,139,0.5)';
                  return h.c >= filteredHistory[i - 1].c ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)';
                });
                const avg20 = volumes.length >= 20
                  ? volumes.map((_, i) => i >= 19 ? volumes.slice(i - 19, i + 1).reduce((s, v) => s + v, 0) / 20 : null)
                  : volumes.map(() => null);
                const lastVol = volumes[volumes.length - 1];
                const lastAvg = avg20.filter(v => v != null).pop();
                const volRatio = lastAvg ? (lastVol / lastAvg).toFixed(2) : null;
                const volData = {
                  labels,
                  datasets: [
                    { type: 'bar', label: 'Volume', data: volumes, backgroundColor: volColors, borderWidth: 0, borderRadius: 1, barPercentage: 0.85 },
                    { type: 'line', label: 'Avg 20d', data: avg20, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false }
                  ]
                };
                return (
                  <GlassCard style={{ marginTop: '1rem', marginBottom: '1.5rem', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff', letterSpacing: '0.08em' }}>WOLUMEN</span>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <span>Last: <strong style={{ color: '#fff' }}>{lastVol ? (lastVol / 1e6).toFixed(1) + 'M' : '—'}</strong></span>
                        <span>Avg 20d: <strong style={{ color: '#f59e0b' }}>{lastAvg ? (lastAvg / 1e6).toFixed(1) + 'M' : '—'}</strong></span>
                        {volRatio && <span>Ratio: <strong style={{ color: parseFloat(volRatio) > 1.5 ? 'var(--accent-green)' : parseFloat(volRatio) < 0.7 ? 'var(--accent-red)' : '#fff' }}>{volRatio}x</strong></span>}
                      </div>
                    </div>
                    <div style={{ height: '120px' }}>
                      <Line data={volData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(11,15,25,0.95)', callbacks: { label: ctx => ctx.dataset.type === 'bar' ? `Vol: ${(ctx.raw / 1e6).toFixed(2)}M` : `Avg: ${(ctx.raw / 1e6).toFixed(2)}M` } } }, scales: { x: { display: false }, y: { position: 'right', grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { color: '#64748b', font: { size: 9 }, callback: v => (v / 1e6).toFixed(0) + 'M' }, border: { display: false } } } }} />
                    </div>
                  </GlassCard>
                );
              })()}


              {/* === CONSENSUS BANNER === */}
              {data.analysis?.quant_analysis?.recommendation && (() => {
                const rec = data.analysis.quant_analysis.recommendation;
                const score = data.composite_score ?? 50;
                const conf = data.analysis.quant_analysis.confidence_level || '';
                const recColor = rec === 'LONG' ? 'var(--accent-green)' : rec === 'SHORT' ? 'var(--accent-red)' : '#f59e0b';
                const recBg = rec === 'LONG' ? 'rgba(16,185,129,0.06)' : rec === 'SHORT' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)';
                const recBorder = rec === 'LONG' ? 'rgba(16,185,129,0.25)' : rec === 'SHORT' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)';
                const recIcon = rec === 'LONG' ? '↑' : rec === 'SHORT' ? '↓' : '→';
                const scoreBarWidth = Math.max(5, Math.min(100, score));
                const bd = data.scoring_breakdown || {};
                const setupColors = { TREND: 'var(--accent-blue)', REVERSAL: 'var(--accent-red)', PULLBACK: '#f59e0b', RANGE: '#94a3b8', BREAKOUT: 'var(--accent-purple)' };
                const setupCol = setupColors[data.setup_type] || 'var(--text-muted)';
                const ScoreBar = ({ label, value }) => {
                  const barCol = value > 60 ? '#00e5a0' : value > 40 ? '#ffb020' : '#ff4d6a';
                  const glowCol = value > 60 ? 'rgba(0,229,160,0.4)' : value > 40 ? 'rgba(255,176,32,0.4)' : 'rgba(255,77,106,0.4)';
                  return (
                    <div style={{ flex: 1, minWidth: '90px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: barCol }}>{value ?? '—'}</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.12)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${value ?? 0}%`, height: '100%', background: barCol, borderRadius: '3px', transition: 'width 0.6s ease', boxShadow: `0 0 8px ${glowCol}` }} />
                      </div>
                    </div>
                  );
                };
                return (
                  <div className="consensus-banner" style={{ background: recBg, border: `1px solid ${recBorder}`, borderRadius: '16px', padding: '1.5rem 2rem', marginTop: '2.5rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: recColor }} />
                    {data.generated_at && (
                      <div style={{ position: 'absolute', top: '8px', right: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {data._cached && (
                          <span title="Dane z cache — maks. 2h stare" style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '4px', padding: '1px 5px', letterSpacing: '0.06em', cursor: 'help' }}>⟳ CACHE</span>
                        )}
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                          {new Date(data.generated_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ fontSize: '2rem', lineHeight: 1, color: recColor }}>{recIcon}</span>
                          <div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '2px' }}>CONSENSUS</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: recColor, letterSpacing: '2px', lineHeight: 1 }}>{rec}</div>
                          </div>
                        </div>
                        <div style={{ width: '1px', height: '3rem', background: 'rgba(255,255,255,0.08)' }} />
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '4px' }}>COMPOSITE SCORE</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: recColor, lineHeight: 1 }}>{score}<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>/100</span></div>
                          <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                            <div style={{ width: `${scoreBarWidth}%`, height: '100%', background: recColor, borderRadius: '2px', transition: 'width 0.8s ease' }} />
                          </div>
                          {data.bull_score != null && data.bear_score != null && (
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              <span style={{ color: 'var(--accent-green)' }}>{data.bull_score}</span> vs <span style={{ color: 'var(--accent-red)' }}>{data.bear_score}</span> pkt
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '3px' }}>PEWNOŚĆ</div>
                          <div style={{ fontSize: '0.9rem', color: conf === 'WYSOKA' ? 'var(--accent-green)' : conf === 'NISKA' ? 'var(--accent-red)' : '#f59e0b', fontWeight: 700 }}>{conf || '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '3px' }}>TYP SETUPU</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: setupCol }}>{data.setup_type || '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '3px' }}>TREND</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{data.quant_stats?.trend || '—'}</div>
                        </div>
                      </div>
                    </div>
                    {data.setup_warning && (
                      <div style={{ marginTop: '0.8rem', padding: '6px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '0.72rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} /> {data.setup_warning}
                      </div>
                    )}
                    {data.analysis.setup_invalid && (
                      <div style={{ marginTop: '0.6rem', padding: '6px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', fontSize: '0.7rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {data.analysis.setup_invalid}
                      </div>
                    )}
                    {data.analysis.target_warning && (
                      <div style={{ marginTop: '0.6rem', padding: '6px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {data.analysis.target_warning}
                      </div>
                    )}
                    {data.conflict_signals?.length > 0 && (
                      <div style={{ marginTop: '0.6rem', padding: '8px 12px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontWeight: 700, marginBottom: '5px', fontSize: '0.72rem', color: '#f59e0b', letterSpacing: '0.08em' }}>
                          ⚡ WYKRYTE KONFLIKTY SYGNAŁÓW{data.raw_composite_score != null && data.composite_score != null && data.raw_composite_score !== data.composite_score ? ` (kara -${data.raw_composite_score - data.composite_score}pkt)` : ''}
                        </div>
                        {data.conflict_signals.map((s, i) => (
                          <div key={i} style={{ fontSize: '0.7rem', color: 'rgba(245,158,11,0.75)', marginBottom: '2px' }}>· {s}</div>
                        ))}
                      </div>
                    )}
                    {data.consistency_flag && (
                      <div style={{ marginTop: '0.6rem', padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <AlertTriangle size={14} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--accent-red)', lineHeight: 1.45, fontWeight: 600 }}>
                          {data.consistency_flag}
                        </span>
                      </div>
                    )}
                    {Object.keys(bd).length > 0 && (
                      <div style={{ marginTop: '1rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          <ScoreBar label="TREND" value={bd.trend} />
                          <ScoreBar label="MOMENTUM" value={bd.momentum} />
                          <ScoreBar label="VOLATILITY" value={bd.volatility} />
                          <ScoreBar label="SENTIMENT" value={bd.sentiment} />
                        </div>
                        {bd.weighted_scores && (
                          <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '6px', fontWeight: 600 }}>SCORE BREAKDOWN — skąd pochodzi {score}/100</div>
                            <div style={{ display: 'flex', gap: '0', height: '14px', borderRadius: '7px', overflow: 'hidden' }}>
                              {[
                                { key: 'trend', label: 'Trend', color: '#3b82f6' },
                                { key: 'momentum', label: 'Momentum', color: '#00e5a0' },
                                { key: 'volatility', label: 'Volatility', color: '#f59e0b' },
                                { key: 'sentiment', label: 'Sentyment', color: '#a78bfa' },
                              ].map(({ key, color }) => {
                                const w = bd.weighted_scores[key] || 0;
                                const pct = bd.weighted_total > 0 ? (w / bd.weighted_total * 100) : 25;
                                return <div key={key} style={{ width: `${pct}%`, background: color, minWidth: pct > 0 ? '4px' : 0, transition: 'width 0.6s ease' }} title={`${key}: ${w}pts`} />;
                              })}
                            </div>
                            {bd.raw && (
                              <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap', paddingTop: '7px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                {[
                                  { key: 'trend',      label: 'TREND', color: '#3b82f6' },
                                  { key: 'momentum',   label: 'MTUM',  color: '#00e5a0' },
                                  { key: 'volatility', label: 'VOL',   color: '#f59e0b' },
                                  { key: 'sentiment',  label: 'SENT',  color: '#a78bfa' },
                                ].map(({ key, label, color }) => {
                                  const r = bd.raw[key] || {};
                                  const pct = r.max > 0 ? Math.round((r.bull / r.max) * 100) : 0;
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, minWidth: '80px' }}>
                                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                                      <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em' }}>{label}</span>
                                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{r.bull ?? '—'}/{r.max ?? '—'}</span>
                                      <span style={{ fontSize: '0.65rem', color, opacity: 0.6 }}>({pct}%)</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '12px', marginTop: '5px', flexWrap: 'wrap' }}>
                              {[
                                { key: 'trend', label: 'Trend', color: '#3b82f6', weight: '40%' },
                                { key: 'momentum', label: 'Momentum', color: '#00e5a0', weight: '30%' },
                                { key: 'volatility', label: 'Volatility', color: '#f59e0b', weight: '20%' },
                                { key: 'sentiment', label: 'Sentyment', color: '#a78bfa', weight: '10%' },
                              ].map(({ key, label, color, weight }) => (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{bd.weighted_scores[key] ?? 0}</span>
                                  <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>({weight})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(data.quant_stats || data.market_structure) && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', marginRight: '2px' }}>MTF</span>
                  {[
                    { label: 'Krótki', val: data.quant_stats?.ema9_21_cross?.includes('BULLISH') ? 'BULL' : 'BEAR', bull: data.quant_stats?.ema9_21_cross?.includes('BULLISH'), sub: 'EMA9/21' },
                    { label: 'Długi',  val: data.quant_stats?.golden_death_cross?.includes('GOLDEN') ? 'BULL' : 'BEAR', bull: data.quant_stats?.golden_death_cross?.includes('GOLDEN'), sub: 'EMA50/200' },
                    { label: 'Cena',   val: data.quant_stats?.price_vs_ema200?.includes('POWYŻEJ') ? '>EMA200' : '<EMA200', bull: data.quant_stats?.price_vs_ema200?.includes('POWYŻEJ'), sub: '' },
                  ].map(({ label, val, bull, sub }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 9px', background: bull ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)', borderRadius: '6px', border: `1px solid ${bull ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{label}{sub ? ` (${sub})` : ''}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: bull ? 'var(--accent-green)' : 'var(--accent-red)' }}>{val}</span>
                    </div>
                  ))}
                  {data.market_structure?.structure && data.market_structure.high_pattern && (
                    <>
                      <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 9px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Struktura</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: data.market_structure.structure.includes('WZROST') ? 'var(--accent-green)' : data.market_structure.structure.includes('SPAD') ? 'var(--accent-red)' : '#f59e0b' }}>
                          {data.market_structure.structure} ({data.market_structure.high_pattern}+{data.market_structure.low_pattern})
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* === TAB NAVIGATION === */}
              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)', minWidth: '130px', flexShrink: 0, position: 'sticky', top: '1rem' }}>
                {[
                  { id: 'glowna', label: 'Strona Główna' },
                  { id: 'sygnal', label: 'Sygnał' },
                  { id: 'techniczna', label: 'Techniczna' },
                  { id: 'fundamentalna', label: 'Fundamentalna' },
                  { id: 'ai', label: 'AI' },
                  { id: 'anomalie', label: 'Anomalie' },
                ].map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ width: '100%', padding: '9px 14px', background: activeTab === t.id ? 'rgba(0,168,214,0.12)' : 'transparent', border: activeTab === t.id ? '1px solid rgba(0,168,214,0.35)' : '1px solid transparent', borderRadius: '8px', color: activeTab === t.id ? 'var(--accent-blue)' : 'var(--text-muted)', fontWeight: activeTab === t.id ? 700 : 400, fontSize: '0.78rem', cursor: 'pointer', letterSpacing: '0.04em', transition: 'all 0.15s', textAlign: 'left' }}>
                    {t.label}
                  </button>
                ))}
              </div>
                {/* CONTENT AREA */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>

                {activeTab === 'glowna' && (() => {
                  const qa = data.analysis?.quant_analysis;
                  const qaC = qa?.recommendation === 'LONG' ? 'var(--accent-green)' : qa?.recommendation === 'SHORT' ? 'var(--accent-red)' : '#f59e0b';
                  const btnS = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'var(--text-muted)', width: '22px', height: '22px', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 };
                  const sections = {
                    indicators: data.quant_stats ? <IndicatorsGrid qs={data.quant_stats} visibleCards={prefs} /> : null,
                    quant: prefs.aiScan && qa ? (
                      <GlassCard style={{ borderTop: `3px solid ${qaC}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                          <h3 className="card-title" style={{ margin: 0 }}><Target size={16} color={qaC} /> Analiza Quant</h3>
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: qaC, background: qa.recommendation === 'LONG' ? 'rgba(16,185,129,0.12)' : qa.recommendation === 'SHORT' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${qaC}`, padding: '3px 14px', borderRadius: '6px' }}>{qa.recommendation}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.8rem' }}>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.6rem', borderRadius: '8px' }}><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>MIKRO TREND</div><div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{qa.micro_trend}</div></div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.6rem', borderRadius: '8px' }}><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>MAKRO TREND</div><div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{qa.macro_trend}</div></div>
                        </div>
                        {qa.entry_target && (
                          <div style={{ background: 'rgba(139,92,246,0.06)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.18)', marginBottom: '0.8rem' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--accent-purple)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.6rem' }}>TRADE SETUP</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                              <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>ENTRY</div><div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>${qa.entry_target}</div></div>
                              <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>STOP LOSS</div><div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-red)' }}>${qa.stop_loss}</div></div>
                              <div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>TAKE PROFIT</div><div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-green)' }}>${qa.take_profit}</div></div>
                            </div>
                          </div>
                        )}
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{qa.take_profit_analysis}</p>
                      </GlassCard>
                    ) : null,
                    aiscan: prefs.aiScan && data.analysis?.summary ? (
                      <GlassCard style={{ borderTop: '3px solid var(--accent-purple)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                          <h3 className="card-title" style={{ color: '#fff', margin: 0 }}><BrainCircuit size={16} color="var(--accent-purple)" /> Skan Główny (AI)</h3>
                          {data.analysis?.sentiment_score != null && (() => { const s = data.analysis.sentiment_score; const c = s > 60 ? 'var(--accent-green)' : s > 40 ? '#f59e0b' : 'var(--accent-red)'; const l = s > 60 ? 'BYK' : s > 40 ? 'NEUTRALNY' : 'NIEDŹWIEDŹ'; return <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '4px 12px', border: '1px solid rgba(255,255,255,0.08)' }}><span style={{ fontSize: '0.72rem', color: c, fontWeight: 800 }}>{l}</span><span style={{ fontWeight: 700, color: c, fontSize: '0.88rem' }}>{s}</span></div>; })()}
                        </div>
                        {data.analysis.summary.split('\n\n').map((para, i, arr) => <p key={i} className="summary-text" style={{ marginBottom: i < arr.length - 1 ? '0.9rem' : 0, lineHeight: 1.65 }}>{para}</p>)}
                      </GlassCard>
                    ) : null,
                    bullbear: prefs.bullBear && (data.analysis?.bull_case?.length > 0 || data.analysis?.bear_case?.length > 0) ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {data.analysis?.bull_case?.length > 0 && <GlassCard style={{ borderTop: '3px solid var(--accent-green)' }}><h3 className="card-title" style={{ color: 'var(--accent-green)', margin: '0 0 0.75rem' }}><TrendingUp size={15} /> Bull Case</h3><ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>{data.analysis.bull_case.slice(0, 4).map((pt, i) => <li key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '6px', lineHeight: 1.4 }}><span style={{ color: 'var(--accent-green)', fontWeight: 700, flexShrink: 0 }}>+</span>{pt}</li>)}</ul></GlassCard>}
                        {data.analysis?.bear_case?.length > 0 && <GlassCard style={{ borderTop: '3px solid var(--accent-red)' }}><h3 className="card-title" style={{ color: 'var(--accent-red)', margin: '0 0 0.75rem' }}><TrendingDown size={15} /> Bear Case</h3><ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>{data.analysis.bear_case.slice(0, 4).map((pt, i) => <li key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '6px', lineHeight: 1.4 }}><span style={{ color: 'var(--accent-red)', fontWeight: 700, flexShrink: 0 }}>-</span>{pt}</li>)}</ul></GlassCard>}
                      </div>
                    ) : null,
                    trendmatrix: prefs.trendMatrix ? <TrendMatrix matrix={data.chart_series?.trend_matrix} /> : null,
                    globaldata: prefs.globalData && data.analysis?.global_data ? (
                      <GlassCard style={{ borderTop: '3px solid #f59e0b' }}>
                        <h3 className="card-title" style={{ color: '#fff', marginBottom: '1rem' }}><Activity size={18} color="#f59e0b" /> Global Data & Fundamentals</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 2rem' }}>
                          {[ { label: 'BIEŻĄCY STATUS', val: data.analysis.global_data.current_status }, { label: 'PROGNOZA (1 MC)', val: data.analysis.global_data.future_outlook }, { label: 'SENTYMENT ELIT & PŁYNNOŚĆ', val: data.analysis.global_data.elite_view }, { label: 'PROFIL DYWIDENDOWY', val: data.analysis.global_data.dividend_trend }, { label: 'ZAINTERESOWANIE PUBLICZNE', val: data.analysis.global_data.sex_appeal }, { label: 'TWARDY KIERUNEK', val: data.analysis.global_data.final_direction, bold: true } ].map(({ label, val, bold }) => (
                            <div key={label} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{label}</div>
                              <div style={{ fontSize: '0.82rem', color: bold ? '#fff' : 'var(--text-secondary)', lineHeight: 1.4, fontWeight: bold ? 600 : 400 }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </GlassCard>
                    ) : null,
                    fundamentals: prefs.fundamentalsPanel && data.fundamentals ? <FundamentalsPanel fundamentals={data.fundamentals} relativeStrength={data.relative_strength} /> : null,
                    anomalies: prefs.anomalies && data.volatile_days?.length > 0 ? (
                      <GlassCard>
                        <h3 className="card-title" style={{ margin: '0 0 0.75rem' }}><Calendar size={16} /> Top Anomalie</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {data.volatile_days.slice(0, 3).map((v, i) => (
                            <div key={i} onClick={() => { expandDay(v.date); setActiveTab('anomalie'); }} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '7px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{v.date}</span>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: v.pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{v.pct >= 0 ? '+' : ''}{v.pct.toFixed(2)}%</span>
                            </div>
                          ))}
                        </div>
                      </GlassCard>
                    ) : null,
                  };
                  const visibleIds = glownaOrder.filter(id => !!sections[id]);
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                        <button onClick={() => setEditingOrder(p => !p)} style={{ fontSize: '0.72rem', color: editingOrder ? 'var(--accent-green)' : 'var(--text-muted)', background: editingOrder ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (editingOrder ? 'rgba(0,229,160,0.25)' : 'rgba(255,255,255,0.1)'), borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s' }}>{editingOrder ? '✓ Gotowe' : '⇅ Kolejność'}</button>
                      </div>
                      {visibleIds.map((id, idx) => (
                        <div key={id} style={{ position: 'relative' }}>
                          <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, display: editingOrder ? 'flex' : 'none', gap: '3px' }}>
                            <button onClick={() => moveGlownaSection(id, -1)} disabled={idx === 0} style={{ ...btnS, opacity: idx === 0 ? 0.3 : 1 }} title="Przesuń w górę">↑</button>
                            <button onClick={() => moveGlownaSection(id, 1)} disabled={idx === visibleIds.length - 1} style={{ ...btnS, opacity: idx === visibleIds.length - 1 ? 0.3 : 1 }} title="Przesuń w dół">↓</button>
                          </div>
                          {sections[id]}
                        </div>
                      ))}
                    </>
                  );
                })()}


                {activeTab === 'glowna' && false && (
                  <>
                    {data.quant_stats && (
                      <IndicatorsGrid qs={data.quant_stats} visibleCards={prefs} />
                    )}
                    {prefs.aiScan && data.analysis?.quant_analysis && (() => {
                      const q = data.analysis.quant_analysis;
                      const c = q.recommendation === 'LONG' ? 'var(--accent-green)' : q.recommendation === 'SHORT' ? 'var(--accent-red)' : '#f59e0b';
                      return (
                        <GlassCard style={{ borderTop: `3px solid ${c}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                            <h3 className="card-title" style={{ margin: 0 }}><Target size={16} color={c} /> Analiza Quant</h3>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: c, background: q.recommendation === 'LONG' ? 'rgba(16,185,129,0.12)' : q.recommendation === 'SHORT' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${c}`, padding: '3px 14px', borderRadius: '6px' }}>{q.recommendation}</span>
                          </div>
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{q.reasoning}</p>
                        </GlassCard>
                      );
                    })()}
                    {prefs.bullBear && (data.analysis?.bull_case?.length > 0 || data.analysis?.bear_case?.length > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {data.analysis?.bull_case?.length > 0 && (
                          <GlassCard style={{ borderTop: '3px solid var(--accent-green)' }}>
                            <h3 className="card-title" style={{ color: 'var(--accent-green)', margin: '0 0 0.75rem' }}><TrendingUp size={15} /> Bull Case</h3>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {data.analysis.bull_case.slice(0, 4).map((pt, i) => (
                                <li key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '6px', lineHeight: 1.4 }}>
                                  <span style={{ color: 'var(--accent-green)', fontWeight: 700, flexShrink: 0 }}>+</span>{pt}
                                </li>
                              ))}
                            </ul>
                          </GlassCard>
                        )}
                        {data.analysis?.bear_case?.length > 0 && (
                          <GlassCard style={{ borderTop: '3px solid var(--accent-red)' }}>
                            <h3 className="card-title" style={{ color: 'var(--accent-red)', margin: '0 0 0.75rem' }}><TrendingDown size={15} /> Bear Case</h3>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {data.analysis.bear_case.slice(0, 4).map((pt, i) => (
                                <li key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '6px', lineHeight: 1.4 }}>
                                  <span style={{ color: 'var(--accent-red)', fontWeight: 700, flexShrink: 0 }}>-</span>{pt}
                                </li>
                              ))}
                            </ul>
                          </GlassCard>
                        )}
                      </div>
                    )}
                    {prefs.trendMatrix && <TrendMatrix matrix={data.chart_series?.trend_matrix} />}
                    {prefs.fundamentalsPanel && data.fundamentals && <FundamentalsPanel fundamentals={data.fundamentals} relativeStrength={data.relative_strength} />}
                    {prefs.anomalies && data.volatile_days?.length > 0 && (
                      <GlassCard>
                        <h3 className="card-title" style={{ margin: '0 0 0.75rem' }}><Calendar size={16} /> Top Anomalie</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {data.volatile_days.slice(0, 3).map((v, i) => (
                            <div key={i} onClick={() => { expandDay(v.date); setActiveTab('anomalie'); }} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '7px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)', transition: 'border-color 0.2s' }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{v.date}</span>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: v.pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{v.pct >= 0 ? '+' : ''}{v.pct.toFixed(2)}%</span>
                            </div>
                          ))}
                        </div>
                      </GlassCard>
                    )}
                  </>
                )}


                {activeTab === 'glowna' && false && (
                  <GlassCard>
                    <div style={{ marginBottom: '1.25rem' }}>
                      <h3 className="card-title" style={{ margin: '0 0 4px' }}>⊞ Personalizacja widoku</h3>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Zaznacz sekcje i wskaźniki widoczne podczas analizy. Zmiany zapisują się automatycznie.</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                      {INDICATOR_GROUPS.map(group => (
                        <div key={group.category}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem', paddingLeft: '10px', borderLeft: '2px solid var(--accent-blue)' }}>
                            {group.category}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {group.items.map(item => {
                              const on = prefs[item.key] ?? true;
                              return (
                                <div key={item.key} onClick={() => { const np = { ...prefs, [item.key]: !on }; setPrefs(np); savePrefs(np); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '7px 10px', borderRadius: '7px', background: on ? 'rgba(0,168,214,0.07)' : 'transparent', transition: 'background 0.15s', userSelect: 'none' }}>
                                  <div style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, border: `1.5px solid ${on ? '#00a8d6' : '#3a3a3a'}`, background: on ? '#00a8d6' : '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                                    {on && <svg width="10" height="8" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <span style={{ fontSize: '0.82rem', color: on ? '#e0e0e0' : '#4a4a4a', transition: 'color 0.15s' }}>{item.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {activeTab === 'sygnal' && data.quant_stats && (
                  <IndicatorsGrid qs={data.quant_stats} visibleCards={DEFAULT_PREFS} />
                )}

                {/* Kolumna Lewa: Quant */}
                {activeTab === 'techniczna' && data.analysis?.quant_analysis && (() => {
                    const rec = data.analysis.quant_analysis.recommendation;
                    const recColor = rec === 'LONG' ? 'var(--accent-green)' : rec === 'SHORT' ? 'var(--accent-red)' : '#f59e0b';
                    const recBg = rec === 'LONG' ? 'rgba(16,185,129,0.12)' : rec === 'SHORT' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)';
                    return (
                    <GlassCard style={{ borderTop: `3px solid ${recColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 className="card-title" style={{ color: '#fff', margin: 0 }}>
                          <Target size={18} color={recColor} /> Quant Analysis
                        </h3>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: recColor, background: recBg, border: `1px solid ${recColor}`, padding: '3px 14px', borderRadius: '6px', letterSpacing: '0.08em' }}>{rec}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.7rem', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>MIKRO TREND</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{data.analysis.quant_analysis.micro_trend}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.7rem', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>MAKRO TREND</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{data.analysis.quant_analysis.macro_trend}</div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(139,92,246,0.06)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.18)', marginBottom: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--accent-purple)', fontWeight: 700, letterSpacing: '0.08em' }}>TRADE SETUP</div>
                          {data.analysis.computed_rr != null && (
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: data.analysis.computed_rr >= 2 ? 'var(--accent-green)' : data.analysis.computed_rr >= 1 ? '#f59e0b' : 'var(--accent-red)', background: data.analysis.computed_rr >= 2 ? 'rgba(16,185,129,0.12)' : data.analysis.computed_rr >= 1 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                              R:R 1:{Number(data.analysis.computed_rr).toFixed(1)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                          <div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>ENTRY</div>
                            <div style={{ fontSize: '0.88rem', color: 'var(--accent-green)', fontWeight: 700 }}>{data.analysis.quant_analysis.entry_target}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>STOP LOSS</div>
                            <div style={{ fontSize: '0.88rem', color: 'var(--accent-red)', fontWeight: 700 }}>{data.analysis.quant_analysis.stop_loss}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>TAKE PROFIT</div>
                            <div style={{ fontSize: '0.88rem', color: 'var(--accent-blue)', fontWeight: 700 }}>{data.analysis.quant_analysis.take_profit}</div>
                          </div>
                        </div>
                        {(data.analysis.computed_rr != null || data.analysis.quant_analysis.probability_long) && (
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem', padding: '0.5rem 0.7rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', alignItems: 'center' }}>
                            {data.analysis.computed_rr != null && (() => {
                              const rr = Number(data.analysis.computed_rr);
                              const rrColor = rr >= 2.0 ? 'var(--accent-green)' : rr >= 1.5 ? '#00e5a0' : rr >= 1.0 ? '#f59e0b' : 'var(--accent-red)';
                              const rrLabel = rr >= 3.0 ? 'WYBITNY' : rr >= 2.0 ? 'ATRAKCYJNY' : rr >= 1.5 ? 'KORZYSTNY' : rr >= 1.0 ? 'AKCEPTOWALNY' : 'NIEKORZYSTNY';
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>R:R</div>
                                  <div style={{ fontSize: '1rem', fontWeight: 800, color: rrColor }}>1:{rr.toFixed(1)}</div>
                                  <div style={{ fontSize: '0.65rem', color: rrColor, fontWeight: 600, background: `${rrColor}15`, padding: '1px 6px', borderRadius: '3px' }}>{rrLabel}</div>
                                </div>
                              );
                            })()}
                            {data.analysis.quant_analysis.probability_long != null && data.analysis.quant_analysis.probability_short != null && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>PROB</div>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-green)' }}>▲{data.analysis.quant_analysis.probability_long}%</span>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>/</span>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-red)' }}>▼{data.analysis.quant_analysis.probability_short}%</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                        {data.analysis.quant_analysis.take_profit_analysis}
                      </p>
                      {data.analysis.rr_warning && (
                        <div style={{ marginTop: '10px', padding: '8px 12px', background: data.analysis.computed_rr < 1.0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${data.analysis.computed_rr < 1.0 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <AlertTriangle size={16} color={data.analysis.computed_rr < 1.0 ? 'var(--accent-red)' : '#f59e0b'} style={{ flexShrink: 0, marginTop: '1px' }} />
                          <span style={{ fontSize: '0.75rem', color: data.analysis.computed_rr < 1.0 ? 'var(--accent-red)' : '#f59e0b', lineHeight: 1.45, fontWeight: 600 }}>
                            {data.analysis.rr_warning}
                          </span>
                        </div>
                      )}
                    </GlassCard>
                    );
                  })()}

                {/* Kolumna Prawa: Skan Główny (AI) */}
                {activeTab === 'ai' && <GlassCard style={{ borderTop: '3px solid var(--accent-purple)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 className="card-title" style={{ color: '#fff', margin: 0 }}>
                        <BrainCircuit size={18} color="var(--accent-purple)" /> Skan Główny (AI)
                      </h3>
                      {data.analysis?.sentiment_score != null && (() => {
                        const s = data.analysis.sentiment_score;
                        const sColor = s > 60 ? 'var(--accent-green)' : s > 40 ? '#f59e0b' : 'var(--accent-red)';
                        const sLabel = s > 60 ? 'BYK' : s > 40 ? 'NEUTRALNY' : 'NIEDŹWIEDŹ';
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '4px 12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sColor }} />
                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: sColor }}>{s}</span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{sLabel}</span>
                          </div>
                        );
                      })()}
                    </div>
                    {data.analysis?.summary?.split('\n\n').map((para, i, arr) => (
                      <p key={i} className="summary-text" style={{ marginBottom: i < arr.length - 1 ? '0.9rem' : 0, lineHeight: 1.65 }}>{para}</p>
                    ))}
                  </GlassCard>}

                {/* Global Data */}
                {activeTab === 'fundamentalna' && data.analysis?.global_data && (
                <GlassCard style={{ borderTop: '3px solid #f59e0b' }}>
                  <h3 className="card-title" style={{ color: '#fff', marginBottom: '1rem' }}>
                    <Activity size={18} color="#f59e0b" /> Global Data & Fundamentals
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 2rem' }}>
                    {[
                      { label: 'BIEŻĄCY STATUS', val: data.analysis.global_data.current_status },
                      { label: 'PROGNOZA (1 MC)', val: data.analysis.global_data.future_outlook },
                      { label: 'SENTYMENT ELIT & PŁYNNOŚĆ', val: data.analysis.global_data.elite_view },
                      { label: 'PROFIL DYWIDENDOWY', val: data.analysis.global_data.dividend_trend },
                      { label: 'ZAINTERESOWANIE PUBLICZNE', val: data.analysis.global_data.sex_appeal },
                      { label: 'TWARDY KIERUNEK', val: data.analysis.global_data.final_direction, bold: true },
                    ].map(({ label, val, bold }) => (
                      <div key={label} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{label}</div>
                        <div style={{ fontSize: '0.82rem', color: bold ? '#fff' : 'var(--text-secondary)', lineHeight: 1.4, fontWeight: bold ? 600 : 400 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

                {/* FundamentalsPanel */}
                {activeTab === 'fundamentalna' && data.fundamentals && (
                  <FundamentalsPanel fundamentals={data.fundamentals} relativeStrength={data.relative_strength} />
                )}

                {/* BULL / BEAR CASE */}
                {activeTab === 'ai' && (data.analysis?.bull_case?.length > 0 || data.analysis?.bear_case?.length > 0) && (() => {
                  const rec = data.analysis?.quant_analysis?.recommendation;
                  const bullStrong = rec === 'LONG';
                  const bearStrong = rec === 'SHORT';
                  return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  {data.analysis?.bull_case?.length > 0 && (
                    <GlassCard style={{ borderTop: '3px solid var(--accent-green)', background: bullStrong ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.02)', opacity: bearStrong ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                        <h3 className="card-title" style={{ color: 'var(--accent-green)', margin: 0, fontSize: '1rem' }}>
                          <TrendingUp size={16} style={{ marginRight: '6px' }} /> Bull Case
                        </h3>
                        {bullStrong && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-green)', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.06em' }}>DOMINANT</span>}
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {data.analysis.bull_case.map((pt, i) => (
                          <li key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: '8px', lineHeight: 1.5, padding: '6px 8px', background: 'rgba(16,185,129,0.04)', borderRadius: '6px', borderLeft: '2px solid rgba(16,185,129,0.3)' }}>
                            <span style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: '1px', fontWeight: 700 }}>+</span>{pt}
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  )}
                  {data.analysis?.bear_case?.length > 0 && (
                    <GlassCard style={{ borderTop: '3px solid var(--accent-red)', background: bearStrong ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.02)', opacity: bullStrong ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                        <h3 className="card-title" style={{ color: 'var(--accent-red)', margin: 0, fontSize: '1rem' }}>
                          <TrendingDown size={16} style={{ marginRight: '6px' }} /> Bear Case
                        </h3>
                        {bearStrong && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-red)', background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.06em' }}>DOMINANT</span>}
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {data.analysis.bear_case.map((pt, i) => (
                          <li key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: '8px', lineHeight: 1.5, padding: '6px 8px', background: 'rgba(239,68,68,0.04)', borderRadius: '6px', borderLeft: '2px solid rgba(239,68,68,0.3)' }}>
                            <span style={{ color: 'var(--accent-red)', flexShrink: 0, marginTop: '1px', fontWeight: 700 }}>-</span>{pt}
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  )}
                  </div>
                  );
                })()}

                {/* TREND ALIGNMENT MATRIX */}
                {activeTab === 'techniczna' && <TrendMatrix matrix={data.chart_series?.trend_matrix} />}

                {activeTab === 'anomalie' && (<>
              <h3 ref={anomalyRef} className="section-title" style={{ scrollMarginTop: '80px' }}>
                <Calendar color="var(--accent-purple)" size={24} />
                Kalendarium Anomalii ({timeframe})
              </h3>

              <div className="anomalies-list" style={{ display: 'flex', justifyContent: 'center' }}>
                {!expandedDay ? (
                  <div style={{ width: '100%' }}>
                    {data.volatile_days?.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Top 5 dni o największej zmienności — kliknij wykres, by zobaczyć szczegóły dowolnego dnia:</div>
                        {data.volatile_days.slice(0, 5).map((v, i) => (
                          <div key={i} onClick={() => expandDay(v.date)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)', transition: 'border-color 0.2s' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{v.date}</span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: v.pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{v.pct >= 0 ? '+' : ''}{v.pct.toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                        <p>Kliknij na dany dzień na wykresie powyżej, aby wygenerować raport dla tamtego dnia.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  (() => {
                    const hIdx = data.history.findIndex(h => new Date(h.t).toISOString().split('T')[0] === expandedDay);
                    if (hIdx === -1) return null;
                    const anom = data.analysis?.anomalies?.find(a => a.date === expandedDay);
                    let pct = 0;
                    if (hIdx > 0) {
                      const prevC = data.history[hIdx - 1].c;
                      const currC = data.history[hIdx].c;
                      pct = ((currC - prevC) / prevC) * 100;
                    }
                    const isMinor = Math.abs(pct) < 1.0;
                    const defaultNote = isMinor
                      ? `Ruch w tym dniu był znikomy (${pct > 0 ? '+' : ''}${pct.toFixed(2)}%). Cena poruszała się w ramach standardowego giełdowego szumu rynkowego.`
                      : `Zanotowano zmianę ceny równą ${pct > 0 ? '+' : ''}${pct.toFixed(2)}%. AI uznało go za wtórny efekt techniczny lub echo sentymentu całego sektora.`;
                    return (
                      <GlassCard className="anomaly-card" style={{ width: '100%' }}>
                        <div className="anomaly-header" style={{ cursor: 'default' }}>
                          <div className="anomaly-info">
                            <div className="anomaly-date">Wybrano: {expandedDay}</div>
                            <span className="anomaly-desc">{anom ? anom.short_desc : (isMinor ? 'Naturalny szum giełdowy' : 'Korekta techniczna / Sektorowa')}</span>
                          </div>
                          <div className="anomaly-action" style={{ fontSize: '1.2rem', fontWeight: 'bold', color: pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                          </div>
                        </div>
                        <div className="anomaly-expanded">
                          <div className="ai-stream-row">
                            <Bot color="var(--accent-purple)" size={28} style={{ marginTop: '4px', flexShrink: 0 }} />
                            <div className="ai-stream-text">
                              <div style={{ marginBottom: '10px' }}>{anom ? anom.details : defaultNote}</div>
                              {anom?.url && (
                                <a href={anom.url} target="_blank" rel="noreferrer" className="source-link-btn">
                                  <ExternalLink size={14} /> Czytaj źródło
                                </a>
                              )}
                              {dayArticles && dayArticles.length > 0 && (
                                <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                                  <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '0.9rem', color: 'var(--accent-blue)' }}>Zebrane na celowniku ({dayArticles.length}):</h4>
                                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {dayArticles.map((art, i) => (
                                      <li key={i} style={{ fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                          <span style={{ color: '#94a3b8', marginTop: '2px' }}>•</span>
                                          <div>
                                            <span style={{ fontWeight: '600', color: '#e2e8f0' }}>{art.headline}</span>
                                            {art.url && <a href={art.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-purple)', marginLeft: '6px', textDecoration: 'none' }}><ExternalLink size={12} /></a>}
                                          </div>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {deepDiveDay !== expandedDay && (
                                <button onClick={() => generateDeepDive(expandedDay)} className="tf-btn" style={{ marginTop: '10px', width: '100%' }}>
                                  🤖 Głęboka Analiza Quantum (Gemma 4)
                                </button>
                              )}
                              {deepDiveDay === expandedDay && (
                                <div style={{ marginTop: '15px', padding: '15px', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '8px', borderLeft: '3px solid var(--accent-purple)' }}>
                                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--accent-purple)' }}>SZCZEGÓŁOWY RAPORT QUANTUM:</h4>
                                  {dayLoading && !dayStreamText && <span style={{ color: 'var(--text-muted)' }}>Inicjalizacja śledztwa AI...</span>}
                                  {dayStreamText}
                                  {dayLoading && dayStreamText && <span className="loading-pulse" />}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })()
                )}
              </div>
              </>)}

              </div></div>{/* koniec tab section */}

            </div>

          </div>
          </ErrorBoundary>
        )}
      </main>
      </div>
      <Footer />
    </>
  );
}
