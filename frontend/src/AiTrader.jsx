import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from './SettingsContext';
import './AiTrader.css';
import API_URL from './config';

function AiTrader() {
  const navigate = useNavigate();
  const { settings: appSettings } = useSettings();
  const [searchTicker, setSearchTicker] = useState(() => localStorage.getItem('aitrader_search_ticker') || appSettings.trader_defaultTicker || 'BTC');
  const [currency, setCurrency] = useState(() => localStorage.getItem('aitrader_currency') || appSettings.defaultCurrency || 'USD');
  const [prompt, setPrompt] = useState('');
  const [analysis, setAnalysis] = useState(() => localStorage.getItem('aitrader_last_analysis') || '');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [marketData, setMarketData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aitrader_last_market_data')) || null; } catch { return null; }
  });
  const [ticker, setTicker] = useState(() => localStorage.getItem('aitrader_last_ticker') || '');
  const [chartData, setChartData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aitrader_last_chart_data')) || []; } catch { return []; }
  });
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [livePrice, setLivePrice] = useState(null);
  const [priceFlash, setPriceFlash] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [chartType, setChartType] = useState(appSettings.trader_chartType || 'candlestick');
  const [activeOverlays, setActiveOverlays] = useState(new Set(appSettings.trader_overlays || ['fibonacci']));
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('favorites')) || []; } catch { return []; }
  });
  const isMaximum = localStorage.getItem('autograph_plan') === 'maximum';
  const [theme, setTheme] = useState(() => appSettings.theme || localStorage.getItem('ai_trader_theme') || 'dark');
  const [focusMode, setFocusMode] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [riskCapital, setRiskCapital] = useState('');
  const [orderBook, setOrderBook] = useState(null);
  const [whaleData, setWhaleData] = useState(null);
  const wsRef = useRef(null);
  const prevPriceRef = useRef(null);
  // Pivot breakout tracking
  const prevPivotSideRef = useRef(null); // 'above' | 'below' | null
  const prevMacdSignalRef = useRef(null);
  const prevSarSignalRef = useRef(null);

  // Sync with global settings when they change
  useEffect(() => {
    if (appSettings.theme) setTheme(appSettings.theme);
    if (appSettings.trader_chartType) setChartType(appSettings.trader_chartType);
    if (appSettings.trader_overlays) setActiveOverlays(new Set(appSettings.trader_overlays));
    if (appSettings.defaultCurrency) setCurrency(appSettings.defaultCurrency);
  }, [appSettings]);

  // Persist session data
  useEffect(() => {
    if (analysis) localStorage.setItem('aitrader_last_analysis', analysis);
    if (marketData) localStorage.setItem('aitrader_last_market_data', JSON.stringify(marketData));
    if (ticker) localStorage.setItem('aitrader_last_ticker', ticker);
    if (chartData && chartData.length > 0) localStorage.setItem('aitrader_last_chart_data', JSON.stringify(chartData));
    localStorage.setItem('aitrader_currency', currency);
    localStorage.setItem('aitrader_search_ticker', searchTicker);
  }, [analysis, marketData, ticker, chartData, currency, searchTicker]);

  const toggleFavorite = (crypto) => {
    setFavorites(prev => {
      const next = prev.includes(crypto) ? prev.filter(f => f !== crypto) : [...prev, crypto];
      localStorage.setItem('favorites', JSON.stringify(next));
      return next;
    });
  };

  const toggleOverlay = (name) => {
    setActiveOverlays(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Binance WebSocket for live price + PIVOT BREAKOUT DETECTION
  useEffect(() => {
    if (!ticker) return;
    if (wsRef.current) wsRef.current.close();

    const symbol = ticker.toLowerCase() + 'usdt';
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@trade`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const trade = JSON.parse(event.data);
      const price = parseFloat(trade.p);
      setLivePrice(price);

      if (prevPriceRef.current !== null) {
        if (price > prevPriceRef.current) setPriceFlash('up');
        else if (price < prevPriceRef.current) setPriceFlash('down');
      }
      prevPriceRef.current = price;
      setTimeout(() => setPriceFlash(null), 800);

      // ── PIVOT BREAKOUT DETECTION ──
      if (marketData?.pivotPoint) {
        const pivot = marketData.pivotPoint;
        const r1 = marketData.resistance1;
        const s1 = marketData.support1;
        const currentSide = price > pivot ? 'above' : 'below';
        const prevSide = prevPivotSideRef.current;

        if (prevSide && currentSide !== prevSide) {
          const notifItems = [];
          if (currentSide === 'above') {
            notifItems.push({ type: 'price', text: `🔺 ${ticker}: Cena przebiła Pivot Point w górę (${price.toFixed(2)} > ${pivot.toFixed(2)})`, ticker });
          } else {
            notifItems.push({ type: 'price', text: `🔻 ${ticker}: Cena przebiła Pivot Point w dół (${price.toFixed(2)} < ${pivot.toFixed(2)})`, ticker });
          }
          window.dispatchEvent(new CustomEvent('autograph:notification', {
            detail: { source: 'crypto', items: notifItems }
          }));
        }

        // Resistance/Support breakout
        if (r1 && prevPriceRef.current && prevPriceRef.current < r1 && price >= r1) {
          window.dispatchEvent(new CustomEvent('autograph:notification', {
            detail: { source: 'crypto', items: [{ type: 'price', text: `🚀 ${ticker}: Przebicie oporu R1 (${r1.toFixed(2)})! Potencjalny uptrend.`, ticker }] }
          }));
        }
        if (s1 && prevPriceRef.current && prevPriceRef.current > s1 && price <= s1) {
          window.dispatchEvent(new CustomEvent('autograph:notification', {
            detail: { source: 'crypto', items: [{ type: 'price', text: `⚠️ ${ticker}: Przebicie wsparcia S1 (${s1.toFixed(2)})! Potencjalny downtrend.`, ticker }] }
          }));
        }

        prevPivotSideRef.current = currentSide;
      }
    };

    ws.onerror = () => console.log('WebSocket: Binance niedostępny');

    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [ticker, marketData]);

  // Alerts system + TREND CHANGE DETECTION
  useEffect(() => {
    if (!marketData) return;
    const rsiLow = appSettings.trader_rsiOversold || 30;
    const rsiHigh = appSettings.trader_rsiOverbought || 70;
    const newAlerts = [];
    if (marketData.rsi < rsiLow) {
      newAlerts.push({ type: 'oversold', text: `⚠️ RSI ${marketData.rsi.toFixed(1)} — Wyprzedanie! Szansa na odbicie.`, color: '#3fb950' });
    }
    if (marketData.rsi > rsiHigh) {
      newAlerts.push({ type: 'overbought', text: `⚠️ RSI ${marketData.rsi.toFixed(1)} — Wykupienie! Ryzyko korekty.`, color: '#f85149' });
    }
    if (marketData.importantNews && marketData.importantNews.length > 0) {
      newAlerts.push({ type: 'news', text: `📰 ${marketData.importantNews.length} ważna wiadomość!`, color: '#58a6ff' });
    }
    if (marketData.macd?.signal === 'NIEDŹWIEDZI' && marketData.sar?.signal === 'NIEDŹWIEDZI') {
      newAlerts.push({ type: 'bearish', text: '🔴 MACD + SAR = podwójny sygnał niedźwiedzi', color: '#f85149' });
    }
    if (marketData.macd?.signal === 'BYCZY' && marketData.sar?.signal === 'BYCZY') {
      newAlerts.push({ type: 'bullish', text: '🟢 MACD + SAR = podwójny sygnał byczy', color: '#3fb950' });
    }
    setAlerts(newAlerts);

    // ── TREND CHANGE DETECTION (MACD/SAR flip) ──
    const currentMacd = marketData.macd?.signal;
    const currentSar = marketData.sar?.signal;
    const trendNotifs = [];

    if (prevMacdSignalRef.current && currentMacd && currentMacd !== prevMacdSignalRef.current) {
      const direction = currentMacd === 'BYCZY' ? 'UPTREND' : 'DOWNTREND';
      const emoji = currentMacd === 'BYCZY' ? '📈' : '📉';
      trendNotifs.push({ type: 'price', text: `${emoji} ${ticker}: MACD zmienił sygnał na ${currentMacd} — ${direction}`, ticker });
    }
    if (prevSarSignalRef.current && currentSar && currentSar !== prevSarSignalRef.current) {
      const direction = currentSar === 'BYCZY' ? 'UPTREND' : 'DOWNTREND';
      const emoji = currentSar === 'BYCZY' ? '🟢' : '🔴';
      trendNotifs.push({ type: 'price', text: `${emoji} ${ticker}: SAR zmienił trend na ${currentSar} — ${direction}`, ticker });
    }

    prevMacdSignalRef.current = currentMacd;
    prevSarSignalRef.current = currentSar;

    if (trendNotifs.length > 0) {
      window.dispatchEvent(new CustomEvent('autograph:notification', {
        detail: { source: 'crypto', items: trendNotifs }
      }));
    }
  }, [marketData, ticker, appSettings]);

  const cryptoList = [
    'BTC', 'ETH', 'ADA', 'DOGE', 'SOL', 'XRP', 'BNB', 'LTC', 
    'BCH', 'LINK', 'AVAX', 'MATIC', 'UNI', 'SHIB', 'ATOM', 'NEAR',
    'POLKA', 'DOT', 'ICP', 'ARB', 'OP', 'PEPE', 'FLOKI', 'MEME',
    'WIF', 'BONK', 'JUP', 'SAGA', 'GMX', 'BLUR'
  ];

  const currencyList = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

  // Auto-refresh driven by settings
  useEffect(() => {
    if (!appSettings.trader_autoRefresh) return;
    if (marketData && ticker) {
      const intervalMs = (appSettings.trader_refreshInterval || 5) * 60 * 1000;
      const interval = setInterval(() => {
        console.log('🔄 Auto-odświeżanie...');
        handleSearch(ticker);
      }, intervalMs);

      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketData, ticker, appSettings.trader_autoRefresh, appSettings.trader_refreshInterval]);

  useEffect(() => {
    if (!ticker) return;
    const fetchOrderBook = async () => {
      try {
        const res = await fetch(`${API_URL}/api/orderbook?ticker=${ticker}`);
        if (res.ok) setOrderBook(await res.json());
      } catch { /* silent */ }
    };
    const fetchWhales = async () => {
      try {
        const res = await fetch(`${API_URL}/api/whales?ticker=${ticker}`);
        if (res.ok) setWhaleData(await res.json());
      } catch { /* silent */ }
    };
    fetchOrderBook();
    fetchWhales();
    const obInterval = setInterval(fetchOrderBook, 60000);
    const whaleInterval = setInterval(fetchWhales, 10000);
    return () => { clearInterval(obInterval); clearInterval(whaleInterval); };
  }, [ticker]);

  const handleSearchChange = (value) => {
    const upperValue = value.toUpperCase();
    setSearchTicker(upperValue);
    
    if (upperValue.length > 0) {
      const filtered = cryptoList.filter(crypto => 
        crypto.startsWith(upperValue)
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectCrypto = (crypto) => {
    setSearchTicker(crypto);
    setSuggestions([]);
    setShowSuggestions(false);
    handleSearch(crypto);
  };

  const handleSearch = async (searchValue) => {
    const value = searchValue || searchTicker;
    
    if (value.length === 0) return;
    
    setLoading(true);
    setLoadingStep('Łączenie z serwerem...');
    setError('');

    // Animowane kroki ładowania
    const steps = [
      { delay: 2000, text: 'Pobieranie danych rynkowych z CoinGecko...' },
      { delay: 5000, text: 'Obliczanie wskaźników technicznych (RSI, MACD, BB...)' },
      { delay: 9000, text: 'Analiza scenariuszy i zarządzanie ryzykiem...' },
      { delay: 14000, text: 'Generowanie analizy AI (Gemma 4)... to może potrwać do 30s' },
      { delay: 25000, text: 'Prawie gotowe — finalizowanie analizy...' },
    ];
    const stepTimers = steps.map(s => setTimeout(() => setLoadingStep(s.text), s.delay));

    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ticker: value.toUpperCase(), 
          currency: currency,
          prompt: prompt || `Analiza ${value.toUpperCase()}/${currency} na dzień ${new Date().toLocaleDateString('pl-PL')}`
        }),
      });
      stepTimers.forEach(t => clearTimeout(t));

      if (res.status === 429) {
        setError('⏳ Za dużo zapytań — API wymaga przerwy. Spróbuj ponownie za 1-2 minuty.');
        return;
      }

      const data = await res.json();

      if (res.ok && data.success) {
        const mappedMarketData = { ...data.marketData };
        if (mappedMarketData.news && Array.isArray(mappedMarketData.news)) {
          const newsByDayObj = {};
          mappedMarketData.news.forEach(n => {
             const parts = n.published.split(/[, ]+/);
             const dateStr = parts[0]; 
             const timeStr = parts.slice(1).join(' ') || n.published;

             if (!newsByDayObj[dateStr]) {
                 newsByDayObj[dateStr] = { articles: [], lastUpdated: n.published };
             }
             newsByDayObj[dateStr].articles.push({
                 id: n.url || Math.random().toString(),
                 importance: n.importance,
                 isNew: false,
                 importanceLevel: n.importanceLevel,
                 sentiment: n.sentiment,
                 source: n.source,
                 title: n.title,
                 image: null,
                 body: n.body,
                 publishedString: timeStr,
                 url: n.url,
                 isImportant: n.isImportant,
                 impact: n.impact,
                 direction: n.direction,
                 directionConfidence: n.directionConfidence,
                 shortSummary: n.shortSummary
             });
          });
          
          mappedMarketData.newsData = {
             newsByDay: newsByDayObj,
             lastRefresh: new Date().toLocaleTimeString(),
             newArticlesCount: 0
          };
        }

        setAnalysis(data.analysis);
        setMarketData(mappedMarketData);
        setTicker(data.ticker);
        setChartData(data.chartData || []);

        // Dispatch notifications — SMART: use settings thresholds, dedup handled by NotificationContext
        const notifItems = [];
        const t = data.ticker;
        const rsiLow = appSettings.trader_rsiOversold || 30;
        const rsiHigh = appSettings.trader_rsiOverbought || 70;
        const pctThreshold = appSettings.trader_percentThreshold || 3;

        if (mappedMarketData.rsi < rsiLow) {
          notifItems.push({ type: "price", text: `⚠️ ${t}: RSI ${mappedMarketData.rsi.toFixed(1)} — Wyprzedanie (próg: ${rsiLow})! Możliwe odbicie.`, ticker: t });
        }
        if (mappedMarketData.rsi > rsiHigh) {
          notifItems.push({ type: "price", text: `⚠️ ${t}: RSI ${mappedMarketData.rsi.toFixed(1)} — Wykupienie (próg: ${rsiHigh})! Ryzyko korekty.`, ticker: t });
        }
        if (mappedMarketData.changePercent && Math.abs(mappedMarketData.changePercent) > pctThreshold) {
          const dir = mappedMarketData.changePercent > 0 ? "wzrósł" : "spadł";
          const severity = Math.abs(mappedMarketData.changePercent) > pctThreshold * 2 ? "🔥" : "📊";
          notifItems.push({ type: "percent", text: `${severity} ${t} ${dir} o ${Math.abs(mappedMarketData.changePercent).toFixed(2)}% w ciągu 24h`, ticker: t });
        }
        // Only notify composite on strong signals (not TRZYMAJ)
        if (mappedMarketData.composite?.decision && mappedMarketData.composite.decision !== 'TRZYMAJ') {
          const dec = mappedMarketData.composite.decision;
          notifItems.push({ type: "price", text: `🤖 ${t}: Sygnał Composite — ${dec} (Score: ${mappedMarketData.composite.score})`, ticker: t });
        }
        // Breaking news: only truly important ones
        if (mappedMarketData.news && mappedMarketData.news.length > 0) {
          const breakingNews = mappedMarketData.news.filter(n => n.isImportant && (n.importanceLevel >= 3 || n.importance === 'HIGH'));
          const regularImportant = mappedMarketData.news.filter(n => n.isImportant && !breakingNews.includes(n));
          if (breakingNews.length > 0) {
            notifItems.push({ type: "news", text: `🚨 ${t}: BREAKING — ${breakingNews[0].title || breakingNews.length + ' pilna wiadomość'}`, ticker: t });
          } else if (regularImportant.length > 0) {
            notifItems.push({ type: "news", text: `📰 ${t}: ${regularImportant.length} ważna wiadomość rynkowa`, ticker: t });
          }
          // Regulatory/ESPI-like news detection
          const regulatoryNews = mappedMarketData.news.filter(n => 
            n.title && /SEC|regulat|compliance|enforcement|ruling|ban|legal/i.test(n.title)
          );
          if (regulatoryNews.length > 0) {
            notifItems.push({ type: "espi", text: `📋 ${t}: ${regulatoryNews.length} komunikat regulacyjny — ${regulatoryNews[0].title}`, ticker: t });
          }
        }
        if (notifItems.length > 0) {
          window.dispatchEvent(new CustomEvent("autograph:notification", {
            detail: { source: "crypto", items: notifItems }
          }));
        }
      } else {
        const errMsg = data.error || 'Nieznany błąd serwera';
        if (res.status === 500) {
          setError(`❌ Błąd serwera: ${errMsg}. Backend mógł przekroczyć limit API lub AI nie odpowiada.`);
        } else {
          setError(`❌ ${errMsg}`);
        }
      }
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError('❌ Brak połączenia z backendem. Sprawdź czy serwer działa na localhost:3000');
      } else {
        setError(`❌ ${err.message}`);
      }
    } finally {
      stepTimers.forEach(t => clearTimeout(t));
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false);
      handleSearch(searchTicker);
    }
  };

  const handleCurrencyChange = (newCurrency) => {
    setCurrency(newCurrency);
    if (marketData && ticker) {
      setTimeout(() => handleSearch(ticker), 100);
    }
  };

  const formatMarketCap = (cap) => {
    if (!cap) return 'N/A';
    if (cap > 1000000000) return `$${(cap / 1000000000).toFixed(2)}B`;
    if (cap > 1000000) return `$${(cap / 1000000).toFixed(2)}M`;
    return `$${cap.toFixed(2)}`;
  };

  const formatPrice = (price) => {
    if (!price) return '0.00';
    if (price > 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price > 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  return (
    <div className={`analyzer-container theme-${theme} ${focusMode ? 'focus-mode' : ''}`}>
      {/* Navigation Header */}
      <div className="header">
        <div className="icons">
          <i className="fa-regular fa-user" title="Użytkownik" onClick={() => navigate('/user')}></i>
          <i className="fa-solid fa-chart-column" title="Rynek tradycyjny" onClick={() => navigate('/autograph')}></i>
          <i className="fa-brands fa-bitcoin header-active" title="Kryptowaluty" onClick={() => navigate('/aitrader')}></i>
          {isMaximum && (
            <i className="fa-solid fa-chart-pie" title="Dywidendy" onClick={() => navigate('/aidividends')}></i>
          )}
        </div>
        <h1 onClick={() => navigate('/')}>Autograph</h1>
      </div>

      {/* Toolbar: Theme Switcher + Focus Mode */}
      <div className="trader-toolbar">
        <div className="toolbar-left">
          <button className={`toolbar-btn ${focusMode ? 'active' : ''}`} onClick={() => setFocusMode(!focusMode)} title="Tryb Focus — pokaż tylko wykres i decyzję">
            {focusMode ? '🔍 Tryb Focus WŁ' : '👁️ Tryb Focus'}
          </button>
        </div>
        <div className="toolbar-right">
          <div className="theme-switcher">
            {[{key: 'dark', icon: '🌙', label: 'Ciemny'}, {key: 'oled', icon: '⬛', label: 'OLED'}].map(t => (
              <button key={t.key} className={`theme-btn ${theme === t.key ? 'active' : ''}`} onClick={() => setTheme(t.key)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Favorites Bar */}
      {favorites.length > 0 && (
        <div className="favorites-bar">
          <span className="fav-label">⭐ Ulubione</span>
          <div className="fav-list">
            {favorites.map(fav => (
              <button key={fav} className={`fav-chip ${ticker === fav ? 'fav-active' : ''}`} onClick={() => { setSearchTicker(fav); handleSearch(fav); }}>
                {fav}
                <span className="fav-remove" onClick={(e) => { e.stopPropagation(); toggleFavorite(fav); }}>×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Section */}
      <div className="search-section">
        <div className="search-card">
          <div className="search-card-bg"></div>
          <div className="search-card-content">
            <div className="search-hero-text">
              <h2 className="search-title">Analizuj kryptowaluty w czasie rzeczywistym</h2>
              <p className="search-subtitle">AI &bull; Wskaźniki techniczne &bull; Wiadomości &bull; Dane rynkowe</p>
            </div>

            <div className="search-main-row">
              <div className="search-input-group">
                <div className="search-wrapper">
                  <span className="search-icon-label">&#128270;</span>
                  <input
                    type="text"
                    value={searchTicker}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyPress={handleKeyPress}
                    onFocus={() => searchTicker.length > 0 && setShowSuggestions(true)}
                    placeholder="Wpisz symbol — BTC, ETH, SOL..."
                    className="search-input"
                  />
                  <button
                    onClick={() => {
                      setShowSuggestions(false);
                      handleSearch(searchTicker);
                    }}
                    disabled={loading || searchTicker.length === 0}
                    className={`search-button ${loading ? 'loading' : ''}`}
                  >
                    {loading ? '⏳ Analizuję...' : '🚀 Analizuj'}
                  </button>

                  {showSuggestions && suggestions.length > 0 && (
                    <div className="suggestions-dropdown">
                      {suggestions.map(crypto => (
                        <div
                          key={crypto}
                          className="suggestion-item"
                          onClick={() => selectCrypto(crypto)}
                        >
                          {crypto}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="search-options-row">
              <div className="currency-field">
                <span className="options-label">Waluta:</span>
                <div className="currency-buttons">
                  {currencyList.map(curr => (
                    <button
                      key={curr}
                      onClick={() => handleCurrencyChange(curr)}
                      className={`currency-btn ${currency === curr ? 'active' : ''}`}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>
              <div className="prompt-field">
                <span className="options-label">Notatka:</span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Opcjonalnie: dodatkowe pytanie do AI..."
                  rows={2}
                  className="prompt-input"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-overlay-content">
            <div className="loading-spinner-large"></div>
            <h3 className="loading-overlay-title">Analizuję {searchTicker.toUpperCase()}...</h3>
            <p className="loading-overlay-step">{loadingStep || 'Łączenie z serwerem...'}</p>
            <p className="loading-overlay-sub">Pełna analiza zajmuje 15-40 sekund</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="skeleton-dashboard">
          <div className="skeleton-header">
            <div className="skeleton-pulse skeleton-title"></div>
            <div className="skeleton-pulse skeleton-subtitle"></div>
          </div>
          <div className="skeleton-price-row">
            {[1,2,3,4].map(i => <div key={i} className="skeleton-pulse skeleton-price-card"></div>)}
          </div>
          <div className="skeleton-main-grid">
            <div className="skeleton-pulse skeleton-chart"></div>
            <div className="skeleton-side">
              <div className="skeleton-pulse skeleton-score-card"></div>
              <div className="skeleton-pulse skeleton-mini-card"></div>
              <div className="skeleton-pulse skeleton-mini-card"></div>
            </div>
          </div>
          <div className="skeleton-analysis-grid">
            {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton-pulse skeleton-analysis-card"></div>)}
          </div>
          <div className="skeleton-loading-text">
            <div className="loading-spinner"></div>
            <p>{loadingStep || 'Przygotowywanie analizy...'}</p>
            <p className="loading-sub">Prosimy o cierpliwość — pełna analiza zajmuje 15-40 sekund</p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="alerts-bar">
          {alerts.map((a, i) => (
            <div key={i} className="alert-item" style={{ borderLeftColor: a.color }}>
              {a.text}
            </div>
          ))}
        </div>
      )}

      {/* Market Data Dashboard */}
      {marketData && (
        <div className="dashboard">
          <div className="dashboard-header">
            <h2>
              <span className="ticker-label">{ticker}</span>
              <span className="pair-separator">/</span>
              <span className="currency-label">{currency}</span>
              <span className="live-dot"></span>
              <span className="live-text">NA ŻYWO</span>
              <button className={`fav-star-btn ${favorites.includes(ticker) ? 'fav-starred' : ''}`} onClick={() => toggleFavorite(ticker)} title={favorites.includes(ticker) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}>
                {favorites.includes(ticker) ? '★' : '☆'}
              </button>
            </h2>
            <div className="header-right">
              {livePrice && (
                <span className={`live-price ${priceFlash === 'up' ? 'flash-green' : priceFlash === 'down' ? 'flash-red' : ''}`}>
                  Binance: {formatPrice(livePrice)} USDT
                </span>
              )}
              <span className="last-update">Aktualizacja: {marketData.lastUpdate ? new Date(marketData.lastUpdate).toLocaleString('pl-PL') : '-'}</span>
            </div>
          </div>

          {/* Price Cards */}
          <div className="price-cards">
            <div className="price-card main-price">
              <span className="card-label">Cena</span>
              <span className="card-value">{formatPrice(marketData.price)} {currency}</span>
              <span className={`card-change ${marketData.changePercent > 0 ? 'positive' : 'negative'}`}>
                {marketData.changePercent > 0 ? '▲' : '▼'} {marketData.changePercent?.toFixed(2)}%
              </span>
            </div>
            <div className="price-card">
              <span className="card-label">Kapitalizacja</span>
              <span className="card-value">{formatMarketCap(marketData.marketCap)}</span>
            </div>
            <div className="price-card">
              <span className="card-label">Wolumen 24h</span>
              <span className="card-value">${(marketData.volume / 1000000).toFixed(1)}M</span>
            </div>
            <div className="price-card">
              <span className="card-label">Śr. Wolumen</span>
              <span className="card-value">${(marketData.avgVolume / 1000000).toFixed(1)}M</span>
            </div>
          </div>

          {/* Pivot Points */}
          <div className="sr-row">
            <div className="sr-card resistance">
              <span className="sr-icon">🔴</span>
              <span className="sr-label">Opór R1</span>
              <span className="sr-value">{formatPrice(marketData.resistance1)} {currency}</span>
            </div>
            <div className="sr-card pivot">
              <span className="sr-icon">⚪</span>
              <span className="sr-label">Pivot Point</span>
              <span className="sr-value">{formatPrice(marketData.pivotPoint)} {currency}</span>
            </div>
            <div className="sr-card support">
              <span className="sr-icon">🟢</span>
              <span className="sr-label">Wsparcie S1</span>
              <span className="sr-value">{formatPrice(marketData.support1)} {currency}</span>
            </div>
          </div>

          {/* Technical Indicators */}
          <div className="indicators-row">
            <div className={`indicator ${marketData.rsi > 70 ? 'overbought' : marketData.rsi < 30 ? 'oversold' : 'neutral-ind'} ${activeOverlays.has('rsi') ? 'overlay-active' : ''}`} onClick={() => toggleOverlay('rsi')}>
              <span className="ind-name">RSI (14)</span>
              <span className="ind-value">{marketData.rsi?.toFixed(1)}</span>
              <span className="ind-signal">{marketData.rsi > 70 ? 'Wykupiony' : marketData.rsi < 30 ? 'Wyprzedany' : 'Neutralny'}</span>
              <span className={`ind-chart-toggle ${activeOverlays.has('rsi') ? 'active' : ''}`}>📊 {activeOverlays.has('rsi') ? 'Na wykresie' : 'Pokaż'}</span>
            </div>
            <div className={`indicator ${marketData.macd?.signal === 'BYCZY' ? 'bullish' : 'bearish'}`}>
              <span className="ind-name">MACD</span>
              <span className="ind-value">{marketData.macd?.signal}</span>
              <span className="ind-signal">Histogram: {marketData.macd?.histogram}</span>
            </div>
            <div className={`indicator ${marketData.sar?.signal === 'BYCZY' ? 'bullish' : 'bearish'}`}>
              <span className="ind-name">Parabolic SAR</span>
              <span className="ind-value">{marketData.sar?.trend}</span>
              <span className="ind-signal">{formatPrice(parseFloat(marketData.sar?.sar))}</span>
            </div>
            <div className={`indicator neutral-ind ${activeOverlays.has('ema') ? 'overlay-active' : ''}`} onClick={() => toggleOverlay('ema')}>
              <span className="ind-name">EMA 12 / 26</span>
              <span className="ind-value">{formatPrice(marketData.ema12)}</span>
              <span className="ind-signal">{formatPrice(marketData.ema26)}</span>
              <span className={`ind-chart-toggle ${activeOverlays.has('ema') ? 'active' : ''}`}>📊 {activeOverlays.has('ema') ? 'Na wykresie' : 'Pokaż'}</span>
            </div>
            <div className={`indicator neutral-ind ${activeOverlays.has('sma') ? 'overlay-active' : ''}`} onClick={() => toggleOverlay('sma')}>
              <span className="ind-name">SMA 20 / 50</span>
              <span className="ind-value">{formatPrice(marketData.sma20)}</span>
              <span className="ind-signal">{formatPrice(marketData.sma50)}</span>
              <span className={`ind-chart-toggle ${activeOverlays.has('sma') ? 'active' : ''}`}>📊 {activeOverlays.has('sma') ? 'Na wykresie' : 'Pokaż'}</span>
            </div>
          </div>

          {/* Bollinger + ATR + ADX row */}
          <div className="indicators-row secondary-indicators">
            <div className={`indicator ${marketData.price > marketData.bb?.upper ? 'overbought' : marketData.price < marketData.bb?.lower ? 'oversold' : 'neutral-ind'} ${activeOverlays.has('bb') ? 'overlay-active' : ''}`} onClick={() => toggleOverlay('bb')}>
              <span className="ind-name">Bollinger Bands</span>
              <span className="ind-value">{formatPrice(marketData.bb?.middle)}</span>
              <span className="ind-signal">
                {formatPrice(marketData.bb?.lower)} — {formatPrice(marketData.bb?.upper)}
              </span>
              <span className={`ind-chart-toggle ${activeOverlays.has('bb') ? 'active' : ''}`}>📊 {activeOverlays.has('bb') ? 'Na wykresie' : 'Pokaż'}</span>
            </div>
            <div className={`indicator ${marketData.adx?.adx > 25 ? (marketData.adx?.plusDI > marketData.adx?.minusDI ? 'bullish' : 'bearish') : 'neutral-ind'}`}>
              <span className="ind-name">ADX (Siła trendu)</span>
              <span className="ind-value">{marketData.adx?.adx}</span>
              <span className="ind-signal">{marketData.adx?.trend}</span>
            </div>
            <div className={`indicator ${marketData.stochRsi?.signal === 'WYPRZEDANY' ? 'oversold' : marketData.stochRsi?.signal === 'WYKUPIONY' ? 'overbought' : marketData.stochRsi?.signal === 'BYCZY' ? 'bullish' : marketData.stochRsi?.signal === 'NIEDŹWIEDZI' ? 'bearish' : 'neutral-ind'}`}>
              <span className="ind-name">Stochastic RSI</span>
              <span className="ind-value">K: {marketData.stochRsi?.k} / D: {marketData.stochRsi?.d}</span>
              <span className="ind-signal">{marketData.stochRsi?.signal}</span>
            </div>
          </div>

          {/* OBV + Divergence + Fear&Greed row */}
          <div className="indicators-row secondary-indicators">
            <div className={`indicator ${marketData.obv?.divergence ? (marketData.obv?.divergenceType === 'BYCZA' ? 'bullish' : 'bearish') : 'neutral-ind'}`}>
              <span className="ind-name">OBV (Volume)</span>
              <span className="ind-value">{marketData.obv?.trend}</span>
              <span className="ind-signal">Dywergencja: {marketData.obv?.divergenceType || 'BRAK'}</span>
            </div>
            <div className={`indicator ${marketData.rsiDivergence?.detected ? (marketData.rsiDivergence?.type?.includes('BYCZA') ? 'bullish' : 'bearish') : 'neutral-ind'}`}>
              <span className="ind-name">RSI Divergence</span>
              <span className="ind-value">{marketData.rsiDivergence?.detected ? '⚠️ WYKRYTA' : '✅ Brak'}</span>
              <span className="ind-signal">{marketData.rsiDivergence?.detected ? marketData.rsiDivergence?.type : 'Brak rozbieżności'}</span>
            </div>
            <div className={`indicator ${marketData.fearGreed?.value < 25 ? 'oversold' : marketData.fearGreed?.value > 75 ? 'overbought' : 'neutral-ind'}`}>
              <span className="ind-name">Fear & Greed</span>
              <span className="ind-value">{marketData.fearGreed?.value}/100</span>
              <span className="ind-signal">{marketData.fearGreed?.classification}</span>
            </div>
          </div>

          {/* Sentiment Thermometer */}
          {marketData.fearGreed && (
            <div className="sentiment-thermo-section">
              <div className="thermo-header">
                <span className="thermo-title">🌡️ Termometr Emocji Rynku</span>
                <span className={`thermo-value-badge ${marketData.fearGreed.value < 35 ? 'thermo-fear' : marketData.fearGreed.value > 65 ? 'thermo-greed' : 'thermo-neutral'}`}>
                  {marketData.fearGreed.value}
                </span>
              </div>
              <div className="thermo-bar-wrapper">
                <div className="thermo-marker" style={{ left: `${Math.min(Math.max(marketData.fearGreed.value, 2), 98)}%` }}></div>
              </div>
              <div className="thermo-labels">
                <span className="thermo-label-fear">😱 Ekstremalny Strach</span>
                <span className="thermo-label-neutral">😐 Neutralny</span>
                <span className="thermo-label-greed">🤑 Ekstremalny Chciwość</span>
              </div>
              <div className="thermo-classification">{marketData.fearGreed.classification}</div>
            </div>
          )}

          {/* Top Dashboard Grid (Decision & Backtest) */}
          <div className="top-dashboard-grid">
            {/* Composite Score Card — EXPANDED */}
            {marketData.composite && (
              <div className={`composite-score-card ${marketData.composite.score > 10 ? 'score-bullish' : marketData.composite.score < -10 ? 'score-bearish' : 'score-neutral'}`}>
                <div className="composite-header">
                  <div className="composite-header-left">
                    <span className="composite-label">🤖 COMPOSITE SCORE</span>
                    {marketData.adx && (
                      <span className={`regime-badge ${marketData.adx.adx > 25 ? 'badge-trending' : 'badge-ranging'}`}>
                        REGIME: {marketData.composite.regime} (ADX {Math.round(marketData.adx.adx)})
                      </span>
                    )}
                  </div>
                  <span className={`composite-decision ${marketData.composite.decision.includes('KUPUJ') ? 'decision-buy' : marketData.composite.decision.includes('SPRZEDAJ') ? 'decision-sell' : marketData.composite.decision === 'OBSERWUJ' ? 'decision-observe' : 'decision-hold'}`}>
                    {marketData.composite.decision === 'OBSERWUJ' ? '👁️ OBSERWUJ' : marketData.composite.decision}
                  </span>
                </div>
                <div className="composite-body">
                  <div className="score-meter-explicit">
                    <div className="score-main-values">
                      <span className="explicit-score-label">Score:</span>
                      <span className={`explicit-score-value ${marketData.composite.score > 0 ? 'pos' : marketData.composite.score < 0 ? 'neg' : ''}`}>
                        {marketData.composite.score > 0 ? '+' : ''}{marketData.composite.score}
                      </span>
                    </div>
                    {/* Confidence Gauge */}
                    {(() => {
                      const conf = marketData.composite.confidence || 0;
                      const gaugeColor = conf >= 71 ? '#3fb950' : conf >= 41 ? '#d29922' : '#f85149';
                      const gaugeLabel = conf >= 71 ? 'Silny sygnał' : conf >= 41 ? 'Średni' : 'Słaby sygnał';
                      const angle = (conf / 100) * 180;
                      const rad = (a) => (a - 180) * Math.PI / 180;
                      const r = 40;
                      const cx = 50, cy = 48;
                      const x1 = cx + r * Math.cos(rad(0));
                      const y1 = cy + r * Math.sin(rad(0));
                      const x2 = cx + r * Math.cos(rad(angle));
                      const y2 = cy + r * Math.sin(rad(angle));
                      const largeArc = angle > 180 ? 1 : 0;
                      const needleRad = rad(angle);
                      const nx = cx + (r - 8) * Math.cos(needleRad);
                      const ny = cy + (r - 8) * Math.sin(needleRad);
                      // Find main driver
                      let mainDriver = '';
                      if (marketData.composite.breakdown) {
                        const entries = Object.entries(marketData.composite.breakdown)
                          .filter(([, v]) => v && v.contribution !== undefined)
                          .sort(([, a], [, b]) => Math.abs(b.contribution) - Math.abs(a.contribution));
                        if (entries.length > 0) mainDriver = entries[0][0];
                      }
                      return (
                        <div className="confidence-gauge-wrap">
                          <svg viewBox="0 0 100 58" className="confidence-gauge-svg">
                            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                              fill="none" stroke="#21262d" strokeWidth="8" strokeLinecap="round" />
                            <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                              fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round" />
                            <line x1={cx} y1={cy} x2={nx} y2={ny}
                              stroke={gaugeColor} strokeWidth="2" strokeLinecap="round" />
                            <circle cx={cx} cy={cy} r="3" fill={gaugeColor} />
                            <text x={cx} y={cy + 14} textAnchor="middle" fill={gaugeColor} fontSize="11" fontWeight="800" fontFamily="monospace">{conf}%</text>
                          </svg>
                          <div className="gauge-meta">
                            <span className="gauge-label" style={{ color: gaugeColor }}>{gaugeLabel}</span>
                            {mainDriver && <span className="gauge-driver">Driver: <strong>{mainDriver}</strong></span>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* MATHEMATICAL BREAKDOWN PER CATEGORY */}
                  {marketData.composite.breakdown && (
                    <div className="math-breakdown-section">
                      <div className="math-breakdown-list">
                        {[
                          { key: 'trend', label: 'Trend' },
                          { key: 'momentum', label: 'Momentum' },
                          { key: 'volume', label: 'Volume' },
                          { key: 'sentiment', label: 'Sentiment' }
                        ].map(cat => {
                          const b = marketData.composite.breakdown[cat.key];
                          if (!b) return null;
                          return (
                            <div key={cat.key} className="math-breakdown-row">
                              <span className="math-lbl">{cat.label}:</span>
                              <span className="math-calc">
                                {(b.raw / 100).toFixed(2)} × {(b.weight / 100).toFixed(2)} = 
                              </span>
                              <span className={`math-result ${b.contribution > 0 ? 'pos' : b.contribution < 0 ? 'neg' : ''}`}>
                                {b.contribution > 0 ? '+' : ''}{b.contribution}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="math-breakdown-final">
                        <span className="math-final-lbl">Final:</span>
                        <span className={`math-final-val ${marketData.composite.score > 0 ? 'pos' : marketData.composite.score < 0 ? 'neg' : ''}`}>
                          {marketData.composite.score > 0 ? '+' : ''}{marketData.composite.score}
                        </span>
                      </div>
                    </div>
                  )}

                  {marketData.composite.details?.length > 0 && (
                    <div className="composite-details">
                      {marketData.composite.details.map((d, i) => (
                        <span key={i} className="detail-tag">{d}</span>
                      ))}
                    </div>
                  )}
                  {marketData.composite.decision === 'TRZYMAJ' && (
                    <div className="trzymaj-info" style={{ marginTop: '12px' }}>
                      <span className="trzymaj-icon">ℹ️</span>
                      <span><strong>TRZYMAJ</strong> oznacza utrzymanie obecnej pozycji. Sygnały rynkowe są mieszane — nie ma wyraźnej przewagi kupujących ani sprzedających. Nie otwieraj nowych pozycji. Czekaj na silniejszy sygnał kierunkowy przed podjęciem decyzji.</span>
                    </div>
                  )}

                  {/* Explainable AI — "Dlaczego?" */}
                  {marketData.composite.breakdown && (
                    <div className="why-section">
                      <button className="why-btn" onClick={() => setShowWhy(!showWhy)}>
                        {showWhy ? '🔽 Ukryj argumenty' : '🧠 Dlaczego? — Mapa dowodowa'}
                      </button>
                      {showWhy && (
                        <div className="why-content">
                          <div className="why-header">Argumenty za decyzją „{marketData.composite.decision}":</div>
                          {Object.entries(marketData.composite.breakdown)
                            .filter(([, cat]) => cat && cat.signals && cat.signals.length > 0)
                            .sort(([, a], [, b]) => Math.abs(b.contribution) - Math.abs(a.contribution))
                            .map(([key, cat], i) => {
                              const catLabels = { trend: '📈 Trend', momentum: '⚡ Momentum', volume: '📊 Wolumen', sentiment: '😱 Sentyment' };
                              return (
                                <div key={key} className={`why-item ${cat.contribution > 0 ? 'why-bullish' : cat.contribution < 0 ? 'why-bearish' : 'why-neutral'}`}>
                                  <span className="why-num">{i + 1}</span>
                                  <div className="why-detail">
                                    <div className="why-title-row">
                                      <span className="why-title">{catLabels[key] || key}</span>
                                      <span className={`why-impact ${cat.contribution > 0 ? 'positive' : 'negative'}`}>
                                        {cat.contribution > 0 ? '+' : ''}{cat.contribution} pkt
                                      </span>
                                    </div>
                                    <div className="why-signals">
                                      {cat.signals.map((sig, si) => (
                                        <span key={si} className="why-signal-tag">{sig}</span>
                                      ))}
                                    </div>
                                    <div className="why-bar-container">
                                      <div className={`why-bar ${cat.contribution > 0 ? 'bar-green' : 'bar-red'}`} style={{ width: `${Math.min(Math.abs(cat.contribution) * 2, 100)}%` }}></div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          <div className="why-formula">
                            <span className="why-formula-label">Formuła:</span>
                            <span className="why-formula-text">{marketData.composite.formula}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Backtest Card (Moved next to Decision) */}
            {marketData.backtest && marketData.backtest.totalTrades > 0 && (
              <div className="backtest-card">
                <h3>📈 Skuteczność (30D)</h3>
                <div className="backtest-body">
                  <div className="backtest-stats-list">
                    <div className="backtest-stat-row">
                      <span className="bt-check">✔</span>
                      <span className="bt-lbl">Accuracy:</span>
                      <span className="bt-val">{marketData.backtest.accuracy}%</span>
                    </div>
                    <div className="backtest-stat-row">
                      <span className="bt-check">✔</span>
                      <span className="bt-lbl">Avg return:</span>
                      <span className={`bt-val ${marketData.backtest.avgReturnPerSignal > 0 ? 'pos' : 'neg'}`}>
                        {marketData.backtest.avgReturnPerSignal > 0 ? '+' : ''}{marketData.backtest.avgReturnPerSignal}%
                      </span>
                    </div>
                    {marketData.backtest.maxDrawdown !== undefined && (
                      <div className="backtest-stat-row">
                        <span className="bt-check">✔</span>
                        <span className="bt-lbl">Max DD:</span>
                        <span className="bt-val neg">{marketData.backtest.maxDrawdown}%</span>
                      </div>
                    )}
                  </div>
                  {/* Mini equity curve */}
                  {marketData.backtest.equityCurve && marketData.backtest.equityCurve.length > 2 && (
                    <div className="equity-sparkline">
                      <svg viewBox={`0 0 ${marketData.backtest.equityCurve.length * 10} 40`} className="sparkline-svg" preserveAspectRatio="none">
                        {(() => {
                          const pts = marketData.backtest.equityCurve;
                          const min = Math.min(...pts);
                          const max = Math.max(...pts);
                          const range = max - min || 1;
                          const w = pts.length * 10;
                          const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * 10} ${38 - ((v - min) / range) * 36}`).join(' ');
                          const areaPath = path + ` L ${(pts.length - 1) * 10} 40 L 0 40 Z`;
                          const lastVal = pts[pts.length - 1];
                          const color = lastVal >= 100 ? '#3fb950' : '#f85149';
                          return (
                            <>
                              <defs>
                                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2={`${w}`} gradientUnits="userSpaceOnUse">
                                  <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                                  <stop offset="100%" stopColor={color} stopOpacity="0.03" />
                                </linearGradient>
                              </defs>
                              <path d={areaPath} fill="url(#eqGrad)" />
                              <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Signal Conflict Warning */}
          {(() => {
            if (!marketData.composite || !analysis) return null;
            const compositeDir = marketData.composite.score > 10 ? 'buy' : marketData.composite.score < -10 ? 'sell' : 'hold';
            const aiSignal = /KUPUJ|BUY|LONG/i.test(analysis) ? 'buy' : /SPRZEDAJ|SELL|SHORT/i.test(analysis) ? 'sell' : 'hold';
            const conflict = (compositeDir === 'buy' && aiSignal === 'sell') || (compositeDir === 'sell' && aiSignal === 'buy');
            const partial = (compositeDir === 'hold' && aiSignal !== 'hold') || (aiSignal === 'hold' && compositeDir !== 'hold');
            if (!conflict && !partial) return null;
            return (
              <div className={`signal-conflict-banner ${conflict ? 'conflict-high' : 'conflict-partial'}`}>
                <div className="conflict-icon">{conflict ? '⚠️' : 'ℹ️'}</div>
                <div className="conflict-body">
                  <div className="conflict-title">{conflict ? 'Konflikt sygnałów: Wysokie ryzyko' : 'Rozbieżność sygnałów'}</div>
                  <div className="conflict-desc">
                    <span className="conflict-tag">Composite: <strong>{marketData.composite.decision}</strong> (Score {marketData.composite.score > 0 ? '+' : ''}{marketData.composite.score})</span>
                    <span className="conflict-vs">vs</span>
                    <span className="conflict-tag">Gemma AI: <strong>{aiSignal === 'buy' ? 'KUPUJ' : aiSignal === 'sell' ? 'SPRZEDAJ' : 'TRZYMAJ'}</strong></span>
                  </div>
                  <div className="conflict-advice">
                    {conflict
                      ? 'Wskaźniki techniczne i AI dają przeciwne sygnały. Zachowaj szczególną ostrożność — nie otwieraj pozycji bez dodatkowego potwierdzenia.'
                      : 'Jeden z systemów sugeruje neutralność, drugi widzi kierunek. Zmniejsz wielkość pozycji lub czekaj na zbieżność sygnałów.'}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Micro/Macro Trend Recommendations */}
          {(marketData.microTrend || marketData.macroTrend) && (
            <div className="trend-analysis-section">
              <h3>🔬 Analiza Trendów</h3>
              <div className="trend-cards">
                {marketData.microTrend && (
                  <div className={`trend-card micro ${marketData.microTrend.recommendation?.includes('KUPUJ') ? 'trend-buy' : marketData.microTrend.recommendation?.includes('SPRZEDAJ') ? 'trend-sell' : 'trend-hold'}`}>
                    <div className="trend-card-header">
                      <span className="trend-icon">⚡</span>
                      <span className="trend-title">MIKRO TREND</span>
                      <span className="trend-timeframe">{marketData.microTrend.timeframe}</span>
                    </div>
                    <div className="trend-recommendation">
                      <span className={`trend-rec ${marketData.microTrend.recommendation?.includes('KUPUJ') ? 'rec-buy' : marketData.microTrend.recommendation?.includes('SPRZEDAJ') ? 'rec-sell' : 'rec-hold'}`}>
                        {marketData.microTrend.recommendation}
                      </span>
                      <span className="trend-score">Score: {marketData.microTrend.score > 0 ? '+' : ''}{marketData.microTrend.score}</span>
                    </div>
                    <div className="trend-details">
                      {marketData.microTrend.details?.map((d, i) => (
                        <span key={i} className="trend-detail-tag">{d}</span>
                      ))}
                    </div>
                    {marketData.microTrend.recommendation === 'TRZYMAJ' && (
                      <div className="trzymaj-info">
                        <span className="trzymaj-icon">ℹ️</span>
                        <span>TRZYMAJ = utrzymuj obecną pozycję. Sygnały są mieszane — nie kupuj więcej ani nie sprzedawaj. Czekaj na wyraźniejszy kierunek rynku.</span>
                      </div>
                    )}
                  </div>
                )}
                {marketData.macroTrend && (
                  <div className={`trend-card macro ${marketData.macroTrend.recommendation?.includes('KUPUJ') ? 'trend-buy' : marketData.macroTrend.recommendation?.includes('SPRZEDAJ') ? 'trend-sell' : 'trend-hold'}`}>
                    <div className="trend-card-header">
                      <span className="trend-icon">🌍</span>
                      <span className="trend-title">MAKRO TREND</span>
                      <span className="trend-timeframe">{marketData.macroTrend.timeframe}</span>
                    </div>
                    <div className="trend-recommendation">
                      <span className={`trend-rec ${marketData.macroTrend.recommendation?.includes('KUPUJ') ? 'rec-buy' : marketData.macroTrend.recommendation?.includes('SPRZEDAJ') ? 'rec-sell' : 'rec-hold'}`}>
                        {marketData.macroTrend.recommendation}
                      </span>
                      <span className="trend-score">Score: {marketData.macroTrend.score > 0 ? '+' : ''}{marketData.macroTrend.score}</span>
                    </div>
                    <div className="trend-details">
                      {marketData.macroTrend.details?.map((d, i) => (
                        <span key={i} className="trend-detail-tag">{d}</span>
                      ))}
                    </div>
                    {marketData.macroTrend.recommendation === 'TRZYMAJ' && (
                      <div className="trzymaj-info">
                        <span className="trzymaj-icon">ℹ️</span>
                        <span>TRZYMAJ = utrzymuj obecną pozycję. Brak wyraźnego trendu długoterminowego. Rynek w fazie konsolidacji — poczekaj na przełamanie.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Candle Patterns */}
          {marketData.patterns && marketData.patterns.length > 0 && (
            <div className="patterns-section">
              <h3>🕯️ Formacje świecowe</h3>
              <div className="patterns-list">
                {marketData.patterns.map((pattern, idx) => (
                  <span key={idx} className="pattern-tag">{pattern}</span>
                ))}
              </div>
            </div>
          )}

          {/* Fibonacci Levels */}
          {marketData.fibonacci && marketData.fibonacci.length > 0 && (
            <div className="fibonacci-section">
              <h3>📐 Fibonacci Retracement (30D)</h3>
              <div className="fibonacci-levels">
                {marketData.fibonacci.map((fib, i) => (
                  <div key={i} className={`fib-level ${fib.level === 0.5 ? 'fib-key' : ''} ${fib.level === 0.618 ? 'fib-key' : ''}`}>
                    <span className="fib-label">{fib.label}</span>
                    <span className="fib-bar"><span className="fib-fill" style={{ width: `${fib.level * 100}%` }}></span></span>
                    <span className="fib-price">{formatPrice(fib.price)} {currency}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Macro Context */}
          {marketData.macroContext && (
            <div className="macro-section">
              <h3>🌍 Kontekst Makro</h3>
              <div className="macro-cards">
                {marketData.macroContext.btcDominance && (
                  <div className="macro-card">
                    <span className="macro-card-label">BTC Dominance</span>
                    <span className="macro-card-value">{marketData.macroContext.btcDominance}%</span>
                    <div className="macro-bar">
                      <div className="macro-bar-fill" style={{ width: `${marketData.macroContext.btcDominance}%`, background: '#f7931a' }}></div>
                    </div>
                  </div>
                )}
                {marketData.macroContext.totalMarketCap && (
                  <div className="macro-card">
                    <span className="macro-card-label">Total Market Cap</span>
                    <span className="macro-card-value">${(marketData.macroContext.totalMarketCap / 1e12).toFixed(2)}T</span>
                    {marketData.macroContext.marketCapChange24h !== null && (
                      <span className={`macro-change ${marketData.macroContext.marketCapChange24h > 0 ? 'positive' : 'negative'}`}>
                        {marketData.macroContext.marketCapChange24h > 0 ? '▲' : '▼'} {Math.abs(marketData.macroContext.marketCapChange24h)}% (24h)
                      </span>
                    )}
                  </div>
                )}
                {marketData.macroContext.ethDominance && (
                  <div className="macro-card">
                    <span className="macro-card-label">ETH Dominance</span>
                    <span className="macro-card-value">{marketData.macroContext.ethDominance}%</span>
                    <div className="macro-bar">
                      <div className="macro-bar-fill" style={{ width: `${marketData.macroContext.ethDominance * 2}%`, background: '#627eea' }}></div>
                    </div>
                  </div>
                )}
                <div className="macro-card">
                  <span className="macro-card-label">FED Rate</span>
                  <span className="macro-card-value">{marketData.macroContext.fedRate}</span>
                  <span className="macro-card-note">Akt. {marketData.macroContext.fedRateUpdated}</span>
                </div>
              </div>
              <div className="macro-disclaimer">{marketData.macroContext.disclaimer}</div>
            </div>
          )}

          {/* Trading Scenarios */}
          {marketData.scenarios && (
            <div className="scenarios-section">
              <h3>🎯 Scenariusze tradingowe</h3>
              <div className="scenario-cards">
                {[marketData.scenarios.base, marketData.scenarios.alternative, marketData.scenarios.extreme].filter(Boolean).map((sc, i) => (
                  <div key={i} className={`scenario-card scenario-${sc.direction}`}>
                    <div className="scenario-card-header">
                      <span className="scenario-label">{sc.label}</span>
                      <span className={`scenario-dir-badge ${sc.direction}`}>
                        {sc.direction === 'bullish' ? '🟢 Wzrostowy' : '🔴 Spadkowy'}
                      </span>
                    </div>
                    <div className="scenario-prob-row">
                      <div className="scenario-prob-bar">
                        <div className="scenario-prob-fill" style={{
                          width: `${sc.probability}%`,
                          background: sc.direction === 'bullish' ? '#3fb950' : '#f85149'
                        }}></div>
                      </div>
                      <span className="scenario-prob-value">{sc.probability}%</span>
                    </div>
                    <div className="scenario-details">
                      <div className="scenario-detail">
                        <span className="sd-label">Target:</span>
                        <span className="sd-value">{formatPrice(sc.target)} {currency}</span>
                      </div>
                      <div className="scenario-detail">
                        <span className="sd-label">Warunek:</span>
                        <span className="sd-value">{sc.condition}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {marketData.scenarios.methodology && (
                <div className="scenario-methodology">📐 {marketData.scenarios.methodology}</div>
              )}
            </div>
          )}

          {/* Risk Management */}
          {marketData.riskManagement && (() => {
            const rm = marketData.riskManagement;
            const isLong = rm.direction === 'bullish';
            const decision = marketData.composite?.decision;
            const isObserve = decision === 'OBSERWUJ';
            const isHold = decision === 'TRZYMAJ';
            const noSetup = isObserve || !rm.tradeReady;
            const entry = rm.entry;
            const sl = rm.stopLoss;
            const tp1 = rm.takeProfit1;
            const tp2 = rm.takeProfit2;
            const rr = parseFloat(rm.riskRewardRatio1) || 0;
            const rrColor = rr >= 2 ? '#3fb950' : rr >= 1.5 ? '#58a6ff' : rr >= 1 ? '#d29922' : '#f85149';
            const rrIcon = rr >= 2 ? '🟢' : rr >= 1.5 ? '🔵' : rr >= 1 ? '🟡' : '🔴';
            const priceTime = marketData.priceTimestamp ? new Date(marketData.priceTimestamp).toLocaleTimeString('pl-PL') : null;
            return (
            <div className="risk-section">
              <h3>🛡️ Risk Management</h3>
              <div className="risk-body">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ background: isLong ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)', color: isLong ? '#3fb950' : '#f85149', border: `1px solid ${isLong ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`, borderRadius: 8, padding: '6px 16px', fontWeight: 700, fontSize: '0.85rem' }}>
                    {isLong ? '📈 LONG' : '📉 SHORT'}
                  </div>
                  {priceTime && <span style={{ fontSize: '0.7rem', color: '#484f58' }}>Cena z: {priceTime}</span>}
                </div>

                {noSetup && (
                  <div style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: '0.85rem', color: '#f85149' }}>
                    ⛔ {isObserve
                      ? `Pewność algorytmu: ${marketData.composite?.confidence}% (< 60%) — sygnał zbyt słaby. OBSERWUJ rynek, nie otwieraj pozycji.`
                      : rm.tradeReason || 'Brak optymalnych warunków do wejścia (słaby R/R).'}
                  </div>
                )}

                {isHold && !noSetup && (
                  <div style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem', color: '#d29922' }}>
                    ⚠️ TRZYMAJ — wartości poniżej to scenariusz bazowy, nie aktywna rekomendacja.
                  </div>
                )}

                <div className="risk-badges-row" style={noSetup ? { opacity: 0.45, pointerEvents: 'none' } : {}}>
                  <div className="risk-badge badge-entry">
                    <span className="rb-lbl">Entry</span>
                    <span className="rb-val">{formatPrice(entry)}</span>
                  </div>
                  <div className="risk-badge badge-sl">
                    <span className="rb-lbl">Stop Loss</span>
                    <span className="rb-val">{formatPrice(sl)}</span>
                    <span style={{ fontSize: '0.65rem', color: '#8b949e' }}>{isLong ? '(poniżej entry)' : '(powyżej entry)'}</span>
                  </div>
                  <div className="risk-badge badge-tp">
                    <span className="rb-lbl">Take Profit (TP1)</span>
                    <span className="rb-val">{formatPrice(tp1)}</span>
                    <span style={{ fontSize: '0.65rem', color: '#8b949e' }}>{isLong ? '(powyżej entry)' : '(poniżej entry)'}</span>
                  </div>
                  <div className="risk-badge badge-tp">
                    <span className="rb-lbl">Take Profit (TP2)</span>
                    <span className="rb-val">{formatPrice(tp2)}</span>
                  </div>
                </div>

                <div className="rr-bar-section" style={noSetup ? { opacity: 0.45 } : {}}>
                  <div className="rr-header-row">
                    <span className="rr-formula">R/R = |TP − Entry| / |Entry − SL|</span>
                    <span className="rr-ratio-badge" style={{ background: rrColor + '20', color: rrColor, borderColor: rrColor + '40' }}>
                      {rrIcon} R/R {rr.toFixed(2)}
                    </span>
                  </div>
                  <div className="rr-labels">
                    <span className="rr-risk-lbl">Ryzyko (1)</span>
                    <span className="rr-reward-lbl">Zysk ({rr.toFixed(2)})</span>
                  </div>
                  <div className="rr-visual-bar">
                    <div className="rr-risk-fill" style={{ flex: 1 }}></div>
                    <div className="rr-reward-fill" style={{ flex: rr, background: rrColor }}></div>
                  </div>
                  {rr >= 2 && <div className="rr-good-note">✅ Doskonały R/R ≥ 2.0</div>}
                  {rr >= 1.5 && rr < 2 && <div style={{ color: '#58a6ff', fontSize: '0.78rem', marginTop: 4 }}>🔵 Dobry R/R ≥ 1.5 — setup akceptowalny</div>}
                  {rr >= 1 && rr < 1.5 && <div style={{ color: '#d29922', fontSize: '0.78rem', marginTop: 4 }}>🟡 R/R poniżej progu 1.5 — nie rekomendujemy wejścia</div>}
                  {rr < 1 && <div className="rr-bad-note">⚠️ Niski R/R — nie otwieraj pozycji</div>}
                </div>

                <div className="risk-stats">
                  <div className="risk-stat">
                    <span className="rs-label">Max Loss</span>
                    <span className="rs-value negative">-{rm.maxLossPercent}%</span>
                  </div>
                  <div className="risk-stat">
                    <span className="rs-label">Pozycja</span>
                    <span className="rs-value">{rm.positionSize}</span>
                  </div>
                </div>
                <div className="risk-methodology">📐 {rm.methodology}</div>
              </div>
            </div>
            );
          })()}

          {/* Risk Calculator */}
          {marketData.riskManagement && (
            <div className="risk-calc-section">
              <h3>💰 Kalkulator Pozycji</h3>
              <div className="risk-calc-body">
                <div className="risk-calc-input-row">
                  <label>Twój kapitał ({currency}):</label>
                  <input
                    type="number"
                    value={riskCapital}
                    onChange={(e) => setRiskCapital(e.target.value)}
                    placeholder="np. 10000"
                    min="0"
                  />
                </div>
                {riskCapital > 0 && (() => {
                  const capital = parseFloat(riskCapital);
                  const stopDist = Math.abs(marketData.price - marketData.riskManagement.stopLoss);
                  const riskAmount = capital * 0.015;
                  const positionUnits = stopDist > 0 ? riskAmount / stopDist : 0;
                  const positionValue = positionUnits * marketData.price;
                  return (
                    <div className="risk-calc-results">
                      <div className="calc-result-card">
                        <span className="calc-result-label">Maks. Ryzyko (1.5%)</span>
                        <span className="calc-result-value highlight-red">{riskAmount.toFixed(2)} {currency}</span>
                      </div>
                      <div className="calc-result-card">
                        <span className="calc-result-label">Wielkość Pozycji</span>
                        <span className="calc-result-value highlight-blue">{positionUnits.toFixed(6)} {ticker}</span>
                      </div>
                      <div className="calc-result-card">
                        <span className="calc-result-label">Wartość Pozycji</span>
                        <span className="calc-result-value highlight-green">{positionValue.toFixed(2)} {currency}</span>
                      </div>
                    </div>
                  );
                })()}
                <span className="calc-result-note">Obliczenia oparte o SL: {formatPrice(marketData.riskManagement.stopLoss)} {currency} | Ryzyko na trade: 1.5% kapitału</span>
              </div>
            </div>
          )}

          {/* ATR-based Stop Loss Calculator */}
          {marketData.atr && marketData.price && (
            <div className="risk-calc-section atr-sl-section">
              <h3>📏 ATR Stop Loss Calculator</h3>
              <div className="atr-sl-body">
                {(() => {
                  const atr = marketData.atr;
                  const price = marketData.price;
                  const atrPercent = ((atr / price) * 100).toFixed(2);
                  const sl1x = price - atr;
                  const sl1_5x = price - atr * 1.5;
                  const sl2x = price - atr * 2;
                  const sl3x = price - atr * 3;
                  const levels = [
                    { mult: '1.0×', sl: sl1x, risk: ((atr / price) * 100).toFixed(2), style: 'aggressive', label: 'Agresywny' },
                    { mult: '1.5×', sl: sl1_5x, risk: ((atr * 1.5 / price) * 100).toFixed(2), style: 'standard', label: 'Standardowy' },
                    { mult: '2.0×', sl: sl2x, risk: ((atr * 2 / price) * 100).toFixed(2), style: 'conservative', label: 'Konserwatywny' },
                    { mult: '3.0×', sl: sl3x, risk: ((atr * 3 / price) * 100).toFixed(2), style: 'safe', label: 'Bezpieczny' },
                  ];
                  return (
                    <>
                      <div className="atr-info-row">
                        <div className="atr-stat"><span className="atr-stat-label">ATR (14)</span><span className="atr-stat-value">{formatPrice(atr)} {currency}</span></div>
                        <div className="atr-stat"><span className="atr-stat-label">ATR %</span><span className="atr-stat-value">{atrPercent}%</span></div>
                        <div className="atr-stat"><span className="atr-stat-label">Cena</span><span className="atr-stat-value">{formatPrice(price)} {currency}</span></div>
                        <div className="atr-stat"><span className="atr-stat-label">Zmienność</span><span className={`atr-stat-value ${parseFloat(atrPercent) > 5 ? 'highlight-red' : parseFloat(atrPercent) > 2 ? 'highlight-blue' : 'highlight-green'}`}>{parseFloat(atrPercent) > 5 ? 'Wysoka' : parseFloat(atrPercent) > 2 ? 'Średnia' : 'Niska'}</span></div>
                      </div>
                      <div className="atr-formula-row">
                        <span className="atr-formula">Stop Loss = Cena − (ATR × Mnożnik)</span>
                      </div>
                      <div className="atr-levels-grid">
                        {levels.map((lv, i) => (
                          <div key={i} className={`atr-level-card atr-${lv.style}`}>
                            <div className="atr-level-header">
                              <span className="atr-mult">{lv.mult} ATR</span>
                              <span className="atr-style-badge">{lv.label}</span>
                            </div>
                            <div className="atr-level-sl">{formatPrice(lv.sl)} {currency}</div>
                            <div className="atr-level-risk">Ryzyko: -{lv.risk}%</div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Chart with type switcher */}
          {chartData.length > 0 && (
            <div className="chart-section">
              <div className="chart-title-row">
                <h3>📊 Wykres — ostatnie {chartData.length} dni</h3>
                <div className="chart-controls">
                  <div className="chart-type-switcher">
                    {[
                      { type: 'candlestick', label: '🕯️ Świecowy' },
                      { type: 'line', label: '📈 Liniowy' },
                      { type: 'bar', label: '📊 Słupkowy' }
                    ].map(ct => (
                      <button
                        key={ct.type}
                        className={`chart-type-btn ${chartType === ct.type ? 'active' : ''}`}
                        onClick={() => setChartType(ct.type)}
                      >
                        {ct.label}
                      </button>
                    ))}
                  </div>
                  <div className="overlay-toggles">
                    <button className={`overlay-btn ${activeOverlays.has('fibonacci') ? 'active' : ''}`} onClick={() => toggleOverlay('fibonacci')}>Fib</button>
                    <button className={`overlay-btn ${activeOverlays.has('rsi') ? 'active' : ''}`} onClick={() => toggleOverlay('rsi')}>RSI</button>
                    <button className={`overlay-btn ${activeOverlays.has('ema') ? 'active' : ''}`} onClick={() => toggleOverlay('ema')}>EMA</button>
                    <button className={`overlay-btn ${activeOverlays.has('sma') ? 'active' : ''}`} onClick={() => toggleOverlay('sma')}>SMA</button>
                    <button className={`overlay-btn ${activeOverlays.has('bb') ? 'active' : ''}`} onClick={() => toggleOverlay('bb')}>BB</button>
                    <button className={`overlay-btn sentiment-btn ${activeOverlays.has('sentiment') ? 'active' : ''}`} onClick={() => toggleOverlay('sentiment')}>Sentiment</button>
                  </div>
                  <div className="chart-legend">
                    <span className="legend-item green">▮ Wzrost</span>
                    <span className="legend-item red">▮ Spadek</span>
                  </div>
                </div>
              </div>
              <ChartComponent data={chartData} chartType={chartType} overlays={marketData?.overlays} fibonacci={marketData?.fibonacci} activeOverlays={activeOverlays} focusMode={focusMode} scenarios={marketData?.scenarios} riskManagement={marketData?.riskManagement} aiLevels={{ support1: marketData?.support1, support2: marketData?.support2, resistance1: marketData?.resistance1, resistance2: marketData?.resistance2, entry: marketData?.riskManagement?.entry, stopLoss: marketData?.riskManagement?.stopLoss, takeProfit1: marketData?.riskManagement?.takeProfit1, takeProfit2: marketData?.riskManagement?.takeProfit2 }} />
            </div>
          )}
        </div>
      )}

      {/* News Section */}
      {marketData && marketData.newsData && (
        <NewsSlider newsData={marketData.newsData} ticker={ticker} newsAggregation={marketData.newsAggregation} />
      )}

      {/* AI Analysis */}
      {analysis && <AnalysisDisplay analysis={analysis} ticker={ticker} currency={currency} />}

      {/* Order Book Heatmap */}
      {orderBook && (
        <div className="orderbook-section">
          <h3>📊 Order Book Heatmap — {orderBook.symbol}</h3>
          <div className="ob-summary">
            <div className="ob-stat">
              <span className="ob-stat-label">Mid Price</span>
              <span className="ob-stat-value">${orderBook.midPrice?.toLocaleString()}</span>
            </div>
            <div className="ob-stat">
              <span className="ob-stat-label">Spread</span>
              <span className="ob-stat-value">${orderBook.spread}</span>
            </div>
            <div className={`ob-stat ob-imbalance ${orderBook.imbalance > 55 ? 'bullish' : orderBook.imbalance < 45 ? 'bearish' : 'neutral'}`}>
              <span className="ob-stat-label">Imbalance</span>
              <span className="ob-stat-value">{orderBook.imbalance}% Bid</span>
              <span className="ob-stat-tag">{orderBook.imbalanceLabel}</span>
            </div>
          </div>
          <div className="ob-imbalance-bar">
            <div className="ob-bid-fill" style={{ width: `${orderBook.imbalance}%` }}></div>
            <div className="ob-ask-fill" style={{ width: `${100 - orderBook.imbalance}%` }}></div>
            <span className="ob-bar-label ob-bar-bid">Bids {orderBook.imbalance}%</span>
            <span className="ob-bar-label ob-bar-ask">Asks {(100 - orderBook.imbalance).toFixed(1)}%</span>
          </div>
          <div className="ob-depth-grid">
            <div className="ob-side ob-bids">
              <h4>Bids (Kupno)</h4>
              {orderBook.bids?.slice(0, 15).map((b, i) => {
                const maxCum = orderBook.bids[orderBook.bids.length - 1]?.cumulative || 1;
                const pct = (b.cumulative / maxCum) * 100;
                const isWall = orderBook.bidWalls?.some(w => w.price === b.price);
                return (
                  <div key={`bid-${i}`} className={`ob-row ${isWall ? 'ob-wall' : ''}`}>
                    <div className="ob-row-bg ob-bid-bg" style={{ width: `${pct}%` }}></div>
                    <span className="ob-price">${b.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="ob-qty">{b.quantity.toFixed(4)}</span>
                    <span className="ob-total">${(b.total / 1000).toFixed(1)}K</span>
                    {isWall && <span className="ob-wall-tag">WALL</span>}
                  </div>
                );
              })}
            </div>
            <div className="ob-side ob-asks">
              <h4>Asks (Sprzedaz)</h4>
              {orderBook.asks?.slice(0, 15).map((a, i) => {
                const maxCum = orderBook.asks[orderBook.asks.length - 1]?.cumulative || 1;
                const pct = (a.cumulative / maxCum) * 100;
                const isWall = orderBook.askWalls?.some(w => w.price === a.price);
                return (
                  <div key={`ask-${i}`} className={`ob-row ${isWall ? 'ob-wall' : ''}`}>
                    <div className="ob-row-bg ob-ask-bg" style={{ width: `${pct}%` }}></div>
                    <span className="ob-price">${a.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="ob-qty">{a.quantity.toFixed(4)}</span>
                    <span className="ob-total">${(a.total / 1000).toFixed(1)}K</span>
                    {isWall && <span className="ob-wall-tag">WALL</span>}
                  </div>
                );
              })}
            </div>
          </div>
          {(orderBook.bidWalls?.length > 0 || orderBook.askWalls?.length > 0) && (
            <div className="ob-walls-summary">
              <h4>Order Walls</h4>
              <div className="ob-walls-grid">
                {orderBook.bidWalls?.map((w, i) => (
                  <div key={`bw-${i}`} className="ob-wall-card ob-wall-bid">
                    <span className="wall-side">BID</span>
                    <span className="wall-price">${w.price.toLocaleString()}</span>
                    <span className="wall-size">{w.quantity.toFixed(4)} ({(w.total / 1000).toFixed(0)}K)</span>
                  </div>
                ))}
                {orderBook.askWalls?.map((w, i) => (
                  <div key={`aw-${i}`} className="ob-wall-card ob-wall-ask">
                    <span className="wall-side">ASK</span>
                    <span className="wall-price">${w.price.toLocaleString()}</span>
                    <span className="wall-size">{w.quantity.toFixed(4)} ({(w.total / 1000).toFixed(0)}K)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="ob-refresh-note">Auto-refresh co 60s</div>
        </div>
      )}

      {/* Whale Watch */}
      {whaleData && (
        <div className="whale-section">
          <h3>🐋 Whale Watch — {whaleData.symbol}
            {whaleData.streamActive && <span style={{ fontSize: '0.6em', color: '#3fb950', marginLeft: 10, verticalAlign: 'middle' }}>● LIVE</span>}
            {!whaleData.streamActive && <span style={{ fontSize: '0.6em', color: '#d29922', marginLeft: 10, verticalAlign: 'middle' }}>⏳ Łączenie...</span>}
          </h3>
          <div className="whale-summary">
            <div className="whale-summary-text">{whaleData.summary}</div>
            <div className="whale-stats">
              <div className={`whale-pressure-card ${whaleData.pressureLabel === 'BYCZA' ? 'bullish' : whaleData.pressureLabel === 'NIEDŹWIEDZIA' ? 'bearish' : 'neutral'}`}>
                <span className="wp-label">Whale Pressure</span>
                <span className="wp-value">{whaleData.whalePressure}%</span>
                <span className="wp-tag">{whaleData.pressureLabel}</span>
              </div>
              <div className="whale-stat">
                <span className="ws-val whale-buy">{whaleData.buyCount}</span>
                <span className="ws-lbl">Kupno</span>
                <span className="ws-vol">${whaleData.buyVolume >= 1000000 ? (whaleData.buyVolume / 1000000).toFixed(1) + 'M' : (whaleData.buyVolume / 1000).toFixed(0) + 'K'}</span>
              </div>
              <div className="whale-stat">
                <span className="ws-val whale-sell">{whaleData.sellCount}</span>
                <span className="ws-lbl">Sprzedaż</span>
                <span className="ws-vol">${whaleData.sellVolume >= 1000000 ? (whaleData.sellVolume / 1000000).toFixed(1) + 'M' : (whaleData.sellVolume / 1000).toFixed(0) + 'K'}</span>
              </div>
              <div className="whale-stat">
                <span className="ws-val">{whaleData.totalTradesAnalyzed?.toLocaleString()}</span>
                <span className="ws-lbl">Przeskanowano</span>
                <span className="ws-vol">Próg: ${(whaleData.whaleThreshold / 1000).toFixed(0)}K</span>
              </div>
            </div>
          </div>
          {whaleData.whaleTrades?.length > 0 && (
            <div className="whale-trades">
              <h4>Ostatnie transakcje wielorybów ({whaleData.whaleCount}) — okno {whaleData.windowMinutes || 30} min</h4>
              <div className="whale-trades-list">
                {whaleData.whaleTrades.slice(0, 10).map((t, i) => (
                  <div key={`wt-${i}`} className={`whale-trade-row whale-${t.side.toLowerCase()}`}>
                    <span className="wt-side">{t.side === 'BUY' ? '🟢' : '🔴'} {t.sideLabel}</span>
                    <span className="wt-amount">{t.totalFormatted}</span>
                    <span className="wt-price">${t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="wt-qty">{t.quantity.toFixed(4)}</span>
                    <span className="wt-time">{t.timeStr}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="whale-refresh-note">
            {whaleData.streamActive ? '🔴 Binance aggTrade WebSocket (real-time)' : '⏳ Uruchamianie strumienia...'} | Odświeżanie co 10s | Okno: {whaleData.windowMinutes || 30} min | Próg: ${(whaleData.whaleThreshold / 1000).toFixed(0)}K
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-brand">Autograph</div>
        <p>CoinGecko API • Technical Analysis • Gemma 4 AI • Finnhub News</p>
        <p className="footer-date">{new Date().toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </footer>
    </div>
  );
}

/* ======================== ANALYSIS DISPLAY ======================== */

function AnalysisDisplay({ analysis, ticker, currency }) {
  const clean = (t) => t
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();

  const isJunk = (t) => /^(\*?\s*)?(-?:?\s*)?(use emoji|keep it|self-correct|i will|i'll|okay|sure|got it|understood|alright|polish only|no markdown|ensure|let me|let's go|wait,|double check|final check|final polish|language:|formatting:|style:|structure:|input data:|drafting|construction|no bolding|no italics|no headers|only polish|emojis used|no thoughts|all 10 sections|checked\.|self-correction|bez markdown|nie pisz|check:?\s|against rules|polish\?\s*yes|emojis?\?\s*yes|no thoughts\?\s*yes|only final analysis|no markdown\?\s*yes|i'll avoid)/i.test(t);
  const isHeader = (t) => /[1-9]️⃣|🔟|^\*\*\s*\d+[.)]|^#{1,3}\s+\d|^\d+[.)]\s+[A-ZĄĆĘŁŃÓŚŹŻ]{2,}/i.test(t);
  const getSignal = (t) => {
    if (/KUPUJ|BUY|LONG/i.test(t)) return 'buy';
    if (/SPRZEDAJ|SELL|SHORT/i.test(t)) return 'sell';
    if (/OBSERWUJ|WAIT|WATCH/i.test(t)) return 'observe';
    if (/TRZYMAJ|HOLD|NEUTRAL/i.test(t)) return 'hold';
    return null;
  };

  // Section icon mapping based on number
  const sectionIcons = {
    '1': '📊', '2': '📈', '3': '🎯', '4': '📉', '5': '⚠️',
    '6': '😱', '7': '📰', '8': '🔮', '9': '💰', '10': '🏆'
  };
  const sectionColors = {
    '1': '#58a6ff', '2': '#3fb950', '3': '#f0883e', '4': '#a371f7', '5': '#f85149',
    '6': '#d29922', '7': '#79c0ff', '8': '#bc8cff', '9': '#3fb950', '10': '#f0883e'
  };

  const parseTitle = (title) => {
    const numMatch = title.match(/^([1-9]️⃣|🔟)\s*(.*)/);
    if (numMatch) {
      const num = numMatch[1] === '🔟' ? '10' : numMatch[1].replace('️⃣', '');
      const rest = numMatch[2].replace(/^[—–-]\s*/, '');
      return { num, text: rest, icon: sectionIcons[num] || '📌', color: sectionColors[num] || '#58a6ff' };
    }
    return { num: null, text: title, icon: '📌', color: '#58a6ff' };
  };

  // Detect AI fallback / rate limit message
  const isAiFallback = /AI tymczasowo niedostępne|rate limit|AI niedostępne/i.test(analysis);

  if (isAiFallback) {
    const lines = analysis.split('\n').map(l => l.trim()).filter(l => l);
    return (
      <div className="analysis-section">
        <div className="analysis-hero">
          <div className="analysis-hero-bg"></div>
          <div className="analysis-hero-content">
            <div className="analysis-title-row">
              <h2>🤖 Analiza Gemma 4 AI</h2>
              <div className="analysis-badges">
                <span className="model-badge" style={{ background: 'rgba(210,153,34,0.15)', color: '#d29922' }}>⏳ Rate Limit</span>
                {ticker && <span className="ticker-badge">{ticker}/{currency}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="analysis-body">
          <div className="analysis-grid">
            <div className="analysis-card intro-card card-hold">
              <div className="card-header" style={{ borderColor: 'rgba(210,153,34,0.3)' }}>
                <div className="card-num" style={{ background: 'rgba(210,153,34,0.15)', color: '#d29922' }}>⚠️</div>
                <span className="card-title">AI tymczasowo niedostępne</span>
              </div>
              <div className="card-content">
                {lines.map((line, i) => {
                  if (/^⚠️/.test(line)) return <p key={i} className="a-line" style={{ color: '#d29922', fontWeight: 600 }}>{line}</p>;
                  if (/^📊/.test(line)) return <p key={i} className="a-line" style={{ fontWeight: 700, marginTop: 8 }}>{line}</p>;
                  if (/^-/.test(line)) {
                    const parts = line.substring(1).trim();
                    const kvMatch = parts.match(/^(.+?):\s*(.+)$/);
                    if (kvMatch) {
                      const sig = getSignal(kvMatch[2]);
                      if (sig) return <div key={i} className={`sig-line sig-${sig}`}><span className="sig-icon">{sig === 'buy' ? '🟢' : sig === 'sell' ? '🔴' : '🟡'}</span><span>{parts}</span></div>;
                      return <div key={i} className="kv-line"><span className="kv-key">{kvMatch[1]}</span><span className="kv-val">{kvMatch[2]}</span></div>;
                    }
                    return <p key={i} className="a-bullet">{parts}</p>;
                  }
                  if (/Spróbuj/i.test(line)) return <p key={i} className="a-line" style={{ color: '#8b949e', fontStyle: 'italic', marginTop: 8 }}>💡 {line}</p>;
                  return <p key={i} className="a-line">{line}</p>;
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sections = [];
  let cur = null;

  // Pre-expand: AI sometimes joins sections on one line with *: prefix
  const expandedLines = [];
  for (const raw of analysis.split('\n')) {
    const t = raw.trim();
    if (!t || /^[═─-]{4,}$/.test(t)) continue;
    const parts = t.split(/\*:\s*(?=[1-9]️⃣|🔟)/);
    for (const p of parts) {
      const trimmed = p.replace(/^\*:\s*/, '').trim();
      if (trimmed) expandedLines.push(trimmed);
    }
  }

  for (const t of expandedLines) {
    const c = clean(t);
    if (!c || isJunk(c)) continue;

    if (isHeader(t) || isHeader(c)) {
      if (cur) sections.push(cur);
      cur = { title: c, lines: [], signal: null };
    } else if (cur) {
      cur.lines.push(c);
      if (getSignal(c)) cur.signal = getSignal(c);
    } else {
      if (sections.length && sections[sections.length - 1].type === 'intro') {
        sections[sections.length - 1].lines.push(c);
      } else {
        sections.push({ title: null, lines: [c], signal: getSignal(c), type: 'intro' });
      }
    }
  }
  if (cur) sections.push(cur);

  const overallSignal = getSignal(analysis);

  // Parse trading decision metrics from text
  const trendMatch = analysis.match(/[Ss]i[łl]a\s*trendu[:\s]*(\d+)\s*\/\s*10/i);
  const confMatch = analysis.match(/[Pp]ewno[śs][ćc][:\s]*(\d+)\s*%/i);
  const riskMatch = analysis.match(/[Rr]yzyko[:\s]*(niskie|średnie|wysokie|low|medium|high)/i);
  const trendScore = trendMatch ? parseInt(trendMatch[1]) : null;
  const confidence = confMatch ? parseInt(confMatch[1]) : null;
  const riskRaw = riskMatch ? riskMatch[1].toLowerCase() : null;
  const risk = riskRaw === 'niskie' || riskRaw === 'low' ? 'niskie' :
               riskRaw === 'wysokie' || riskRaw === 'high' ? 'wysokie' : 'średnie';

  // Split key: value pairs for better rendering
  const renderLine = (line, li) => {
    const sig = getSignal(line);

    // Detect key-value patterns like "Sygnał: KUPUJ" or "Siła trendu: 4/10"
    const kvMatch = line.match(/^(.+?)[:\s]+(.+)$/);
    const isKV = kvMatch && kvMatch[1].length < 30 && !sig && !/^\*$|^\(Self-Correction\)/.test(kvMatch[1].trim());

    if (sig) {
      return (
        <div key={li} className={`sig-line sig-${sig}`}>
          <span className="sig-icon">{sig === 'buy' ? '🟢' : sig === 'sell' ? '🔴' : '🟡'}</span>
          <span>{line}</span>
        </div>
      );
    }

    if (isKV) {
      return (
        <div key={li} className="kv-line">
          <span className="kv-key">{kvMatch[1]}:</span>
          <span className="kv-val">{kvMatch[2]}</span>
        </div>
      );
    }

    return (
      <p key={li} className={/^[-•●▸▹]/.test(line) ? 'a-bullet' : 'a-line'}>{line}</p>
    );
  };

  // Traffic light per section: analyze content for bullish/bearish/neutral signals
  const getTrafficLight = (section) => {
    const text = [section.title || '', ...section.lines].join(' ').toLowerCase();
    const bullish = /byczy|wzrost|kupuj|buy|long|silny|potwierdza|rosnący|pozytywn|bycz|rośnie|powyżej|utrzymuje/i.test(text);
    const bearish = /niedźwiedzi|spadek|sprzedaj|sell|short|słaby|malejący|negatywn|niedzwiedz|spada|poniżej|traci/i.test(text);
    const divergence = /dywergencj|divergen|rozbieżn/i.test(text);
    if (divergence) return { icon: '🟡', color: '#d29922', label: 'Uwaga' };
    if (bullish && bearish) return { icon: '🟡', color: '#d29922', label: 'Mieszany' };
    if (bullish) return { icon: '🟢', color: '#3fb950', label: 'Byczy' };
    if (bearish) return { icon: '🔴', color: '#f85149', label: 'Niedźwiedzi' };
    return { icon: '⚪', color: '#8b949e', label: 'Neutralny' };
  };

  // Identify decision section (last / 🔟)
  const isDecisionSection = (section) => {
    return section.title && (/^🔟/.test(section.title) || /DECYZJA/i.test(section.title));
  };

  return (
    <div className="analysis-section">
      <div className="analysis-hero">
        <div className="analysis-hero-bg"></div>
        <div className="analysis-hero-content">
          <div className="analysis-title-row">
            <h2>🤖 Analiza Gemma 4 AI</h2>
            <div className="analysis-badges">
              <span className="model-badge">Gemma 4</span>
              <span className="data-badge">📊 CoinGecko</span>
              {ticker && <span className="ticker-badge">{ticker}/{currency}</span>}
            </div>
          </div>

          {/* Trading Decision Card */}
          {overallSignal && (
            <div className={`trading-decision decision-${overallSignal}`}>
              <div className="decision-signal">
                <span className="decision-icon">
                  {overallSignal === 'buy' ? '🟢' : overallSignal === 'sell' ? '🔴' : overallSignal === 'observe' ? '👁️' : '🟡'}
                </span>
                <span className="decision-label">
                  {overallSignal === 'buy' ? 'KUPUJ' :
                   overallSignal === 'sell' ? 'SPRZEDAJ' :
                   overallSignal === 'observe' ? 'OBSERWUJ' : 'TRZYMAJ'}
                </span>
              </div>
              <div className="decision-metrics">
                {trendScore !== null && (
                  <div className="metric">
                    <span className="metric-label">Siła trendu</span>
                    <div className="metric-bar">
                      <div className="metric-fill" style={{ width: `${trendScore * 10}%`, background: trendScore >= 7 ? '#3fb950' : trendScore >= 4 ? '#d29922' : '#f85149' }}></div>
                    </div>
                    <span className="metric-value">{trendScore}/10</span>
                  </div>
                )}
                {confidence !== null && (
                  <div className="metric">
                    <span className="metric-label">Pewność</span>
                    <div className="metric-bar">
                      <div className="metric-fill" style={{ width: `${confidence}%`, background: confidence >= 70 ? '#3fb950' : confidence >= 40 ? '#d29922' : '#f85149' }}></div>
                    </div>
                    <span className="metric-value">{confidence}%</span>
                  </div>
                )}
                {riskRaw && (
                  <div className="metric">
                    <span className="metric-label">Ryzyko</span>
                    <span className={`risk-badge risk-${risk}`}>
                      {risk === 'niskie' ? '🟢 Niskie' : risk === 'wysokie' ? '🔴 Wysokie' : '🟡 Średnie'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="analysis-body">
        <div className="analysis-grid">
          {sections.filter(s => !isDecisionSection(s)).map((section, idx) => {
            const parsed = section.title ? parseTitle(section.title) : null;
            const tl = section.title ? getTrafficLight(section) : null;
            return (
              <div key={idx} className={`analysis-card ${section.type === 'intro' ? 'intro-card' : ''} ${section.signal ? `card-${section.signal}` : ''}`}>
                {parsed && (
                  <div className="card-header" style={{ borderColor: parsed.color + '40' }}>
                    <div className="card-num" style={{ background: parsed.color + '20', color: parsed.color }}>
                      {parsed.num || '#'}
                    </div>
                    <span className="card-title">{parsed.text}</span>
                    {tl && <span className="traffic-light" style={{ color: tl.color }} title={tl.label}>{tl.icon} {tl.label}</span>}
                  </div>
                )}
                <div className="card-content">
                  {section.lines.length > 0
                    ? section.lines.map((l, li) => renderLine(l, li))
                    : <p className="a-line empty-section-note">Brak istotnych sygnałów w tej kategorii.</p>
                  }
                </div>
              </div>
            );
          })}
        </div>

        {/* Decision Section - Special */}
        {sections.filter(s => isDecisionSection(s)).map((section, idx) => {
          const parsed = parseTitle(section.title);
          return (
            <div key={`dec-${idx}`} className={`analysis-decision-card ${overallSignal ? `decision-card-${overallSignal}` : ''}`}>
              <div className="decision-card-header">
                <span className="decision-card-icon">🏆</span>
                <span className="decision-card-title">{parsed.text}</span>
              </div>
              <div className="decision-card-body">
                {section.lines.map((l, li) => renderLine(l, li))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="analysis-footer-info">
        <span>📊 CoinGecko (Binance, Coinbase, Kraken...)</span>
        <span>📰 Finnhub</span>
        <span>🕐 {new Date().toLocaleTimeString('pl-PL')}</span>
      </div>
    </div>
  );
}

/* ======================== CANDLESTICK CHART ======================== */

function ChartComponent({ data, chartType = 'candlestick', overlays, fibonacci, activeOverlays, focusMode, scenarios, aiLevels }) {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [crosshair, setCrosshair] = useState(null);
  const [containerWidth, setContainerWidth] = useState(900);

  useEffect(() => {
    const observe = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    observe();
    window.addEventListener('resize', observe);
    return () => window.removeEventListener('resize', observe);
  }, []);

  if (!data || data.length === 0) return null;

  // Show all candles from the month
  const totalCandles = data.length;
  const visibleCount = totalCandles;
  const startIdx = 0;
  const visibleData = data;

  const showRsi = activeOverlays && activeOverlays.has('rsi');
  const showFib = activeOverlays && activeOverlays.has('fibonacci');
  const showEma = activeOverlays && activeOverlays.has('ema');
  const showSma = activeOverlays && activeOverlays.has('sma');
  const showBb = activeOverlays && activeOverlays.has('bb');
  const showSentiment = activeOverlays && activeOverlays.has('sentiment');

  const n = visibleData.length;
  const paddingLeft = 80;
  const paddingRight = (showRsi || showSentiment) ? 80 : 60;
  const paddingTop = 30;
  const paddingBottom = 55;
  const priceAreaH = 500;
  const volumeAreaH = 100;
  const totalH = priceAreaH + volumeAreaH + paddingTop + paddingBottom + 20;

  const minCandleW = 10;
  const minSpacing = minCandleW / 0.6;
  const neededW = paddingLeft + paddingRight + n * minSpacing;
  const chartW = Math.max(containerWidth, neededW);

  const usableW = chartW - paddingLeft - paddingRight;
  const candleSpacing = usableW / n;
  const candleW = Math.max(Math.min(candleSpacing * 0.6, 20), 6);

  const prices = visibleData.flatMap(d => [d.high, d.low]);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const pricePad = (maxPrice - minPrice) * 0.08 || 1;
  const pMax = maxPrice + pricePad;
  const pMin = minPrice - pricePad;
  const pRange = pMax - pMin;

  const volumes = visibleData.map(d => d.volume || 0);
  const maxVol = Math.max(...volumes) || 1;

  const getX = (i) => paddingLeft + i * candleSpacing + candleSpacing / 2;
  const getY = (price) => paddingTop + (1 - (price - pMin) / pRange) * priceAreaH;
  const volBase = paddingTop + priceAreaH + 20 + volumeAreaH;

  // RSI overlay helpers (scaled to price area)
  const getRsiY = (val) => paddingTop + (1 - val / 100) * priceAreaH;

  // Price grid
  const gridLines = [];
  for (let i = 0; i <= 6; i++) {
    const price = pMin + (pRange * i) / 6;
    gridLines.push({ y: getY(price), price });
  }

  // SMA20 (built-in, only when SMA overlay active)
  const smaPoints = [];
  if (showSma) {
    for (let i = 0; i < n; i++) {
      if (i >= 19) {
        const slice = data.slice(i - 19, i + 1);
        const avg = slice.reduce((s, d) => s + d.close, 0) / 20;
        smaPoints.push({ x: getX(i), y: getY(avg) });
      }
    }
  }
  const smaPath = smaPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Smart date label stepping
  const labelMinPx = 70;
  const labelStep = Math.max(1, Math.ceil(labelMinPx / candleSpacing));

  // Slice overlay series to match visible window
  const sliceOverlay = (series) => series ? series.slice(startIdx, startIdx + visibleCount) : null;

  // Overlay line builder
  const buildLinePath = (series) => {
    const sliced = sliceOverlay(series);
    if (!sliced) return '';
    const pts = [];
    for (let i = 0; i < Math.min(sliced.length, n); i++) {
      if (sliced[i] !== null && sliced[i] !== undefined) {
        pts.push({ x: getX(i), y: getY(sliced[i]) });
      }
    }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  // RSI overlay line path (on price area)
  const buildRsiPath = () => {
    const sliced = sliceOverlay(overlays?.rsiSeries);
    if (!sliced) return '';
    const pts = [];
    for (let i = 0; i < Math.min(sliced.length, n); i++) {
      if (sliced[i] !== null) {
        pts.push({ x: getX(i), y: getRsiY(sliced[i]) });
      }
    }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  // BB fill path
  const buildBbFill = () => {
    const sliced = sliceOverlay(overlays?.bbSeries);
    if (!sliced) return '';
    const upper = [], lower = [];
    for (let i = 0; i < Math.min(sliced.length, n); i++) {
      const b = sliced[i];
      if (b && b.upper !== null) {
        upper.push({ x: getX(i), y: getY(b.upper) });
        lower.push({ x: getX(i), y: getY(b.lower) });
      }
    }
    if (upper.length < 2) return '';
    const fwd = upper.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const bwd = lower.reverse().map((p) => `L ${p.x} ${p.y}`).join(' ');
    return fwd + ' ' + bwd + ' Z';
  };

  const handleMouseMove = (e, candle, i) => {
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const mx = e.clientX - rect.left + scrollLeft;
    const my = e.clientY - rect.top;
    setTooltip({ x: mx, y: my, candle, i });
    setCrosshair({ x: getX(i), y: my });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    setCrosshair(null);
  };

  const fibColors = ['#8b949e', '#58a6ff', '#d29922', '#bc8cff', '#d29922', '#58a6ff', '#8b949e'];

  const formatP = (p) => {
    if (p > 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p > 1) return p.toFixed(2);
    return p.toFixed(6);
  };


  return (
    <div className="chart-wrapper" ref={containerRef}>
      <svg
        width={chartW}
        height={totalH}
        className="chart-svg"
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'crosshair' }}
      >
        <rect width={chartW} height={totalH} fill="#0d1117" rx="12" />

        {/* Grid */}
        {gridLines.map((gl, i) => (
          <g key={`gl-${i}`}>
            <line x1={paddingLeft} y1={gl.y} x2={chartW - paddingRight} y2={gl.y}
              stroke="#161b22" strokeWidth="1" />
            <text x={paddingLeft - 8} y={gl.y + 4} fill="#8b949e" fontSize="11"
              textAnchor="end" fontFamily="monospace">
              {formatP(gl.price)}
            </text>
          </g>
        ))}

        {/* Volume separator line */}
        <line x1={paddingLeft} y1={paddingTop + priceAreaH + 10}
          x2={chartW - paddingRight} y2={paddingTop + priceAreaH + 10}
          stroke="#21262d" strokeWidth="1" strokeDasharray="4,4" />

        {/* Volume bars */}
        {visibleData.map((candle, i) => {
          const x = getX(i);
          const isGreen = candle.close >= candle.open;
          const vol = candle.volume || 0;
          const barH = (vol / maxVol) * volumeAreaH;
          return (
            <rect key={`vol-${i}`} x={x - candleW / 2} y={volBase - barH}
              width={candleW} height={Math.max(barH, 1)}
              fill={isGreen ? 'rgba(35, 134, 54, 0.5)' : 'rgba(218, 54, 51, 0.5)'}
              rx="1" />
          );
        })}

        {/* SMA20 */}
        {smaPoints.length > 1 && (
          <path d={smaPath} fill="none" stroke="#f0883e" strokeWidth="1.5" opacity="0.7" />
        )}

        {/* Fibonacci Levels */}
        {showFib && fibonacci && fibonacci.map((fib, fi) => {
          const y = getY(fib.price);
          if (y < paddingTop || y > paddingTop + priceAreaH) return null;
          return (
            <g key={`fib-${fi}`}>
              <line x1={paddingLeft} y1={y} x2={chartW - paddingRight} y2={y}
                stroke={fibColors[fi] || '#58a6ff'} strokeWidth="1" strokeDasharray="6,4" opacity="0.6" />
              <rect x={chartW - paddingRight + 4} y={y - 10} width={56} height={18} rx="4" fill="#161b22" stroke={fibColors[fi] || '#58a6ff'} strokeWidth="0.5" opacity="0.9" />
              <text x={chartW - paddingRight + 8} y={y + 1} fill={fibColors[fi] || '#58a6ff'} fontSize="9" fontFamily="monospace" fontWeight="600">
                {fib.label} {formatP(fib.price)}
              </text>
            </g>
          );
        })}

        {/* Bollinger Bands */}
        {showBb && overlays?.bbSeries && (
          <g>
            <path d={buildBbFill()} fill="rgba(88,166,255,0.06)" />
            <path d={buildLinePath(overlays.bbSeries.map(b => b?.upper))} fill="none" stroke="#58a6ff" strokeWidth="1" opacity="0.5" strokeDasharray="4,3" />
            <path d={buildLinePath(overlays.bbSeries.map(b => b?.middle))} fill="none" stroke="#58a6ff" strokeWidth="1" opacity="0.35" />
            <path d={buildLinePath(overlays.bbSeries.map(b => b?.lower))} fill="none" stroke="#58a6ff" strokeWidth="1" opacity="0.5" strokeDasharray="4,3" />
          </g>
        )}

        {/* EMA Overlay */}
        {showEma && overlays && (
          <g>
            <path d={buildLinePath(overlays.ema12Series)} fill="none" stroke="#3fb950" strokeWidth="1.5" opacity="0.7" />
            <path d={buildLinePath(overlays.ema26Series)} fill="none" stroke="#a371f7" strokeWidth="1.5" opacity="0.7" />
          </g>
        )}

        {/* SMA Overlay */}
        {showSma && overlays && (
          <g>
            <path d={buildLinePath(overlays.sma20Series)} fill="none" stroke="#f0883e" strokeWidth="1.5" opacity="0.7" />
            <path d={buildLinePath(overlays.sma50Series)} fill="none" stroke="#d29922" strokeWidth="1.5" opacity="0.7" strokeDasharray="6,3" />
          </g>
        )}

        {/* === CANDLESTICK === */}
        {chartType === 'candlestick' && visibleData.map((candle, i) => {
          const x = getX(i);
          const yOpen = getY(candle.open);
          const yClose = getY(candle.close);
          const yHigh = getY(candle.high);
          const yLow = getY(candle.low);
          const isGreen = candle.close >= candle.open;
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(Math.abs(yOpen - yClose), 1.5);

          return (
            <g key={`c-${i}`} className="candle-group">
              <line x1={x} y1={yHigh} x2={x} y2={yLow}
                stroke={isGreen ? '#238636' : '#da3633'}
                strokeWidth={Math.max(candleW * 0.12, 1)} />
              <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                fill={isGreen ? '#238636' : '#da3633'}
                stroke={isGreen ? '#2ea043' : '#f85149'}
                strokeWidth="0.5" rx="1" />
              <rect x={x - candleSpacing / 2} y={paddingTop}
                width={candleSpacing} height={priceAreaH + volumeAreaH + 20}
                fill="transparent"
                onMouseMove={(e) => handleMouseMove(e, candle, i)}
                onMouseLeave={handleMouseLeave} />
            </g>
          );
        })}

        {/* === LINE CHART === */}
        {chartType === 'line' && (() => {
          const linePath = visibleData.map((candle, i) => {
            const x = getX(i);
            const y = getY(candle.close);
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
          }).join(' ');
          const areaPath = linePath + ` L ${getX(n - 1)} ${paddingTop + priceAreaH} L ${getX(0)} ${paddingTop + priceAreaH} Z`;
          return (
            <g>
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#58a6ff" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#58a6ff" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#lineGrad)" />
              <path d={linePath} fill="none" stroke="#58a6ff" strokeWidth="2.5" strokeLinejoin="round" />
              {visibleData.map((candle, i) => (
                <g key={`lp-${i}`}>
                  <circle cx={getX(i)} cy={getY(candle.close)} r="3.5"
                    fill="#0d1117" stroke="#58a6ff" strokeWidth="1.5" />
                  <rect x={getX(i) - candleSpacing / 2} y={paddingTop}
                    width={candleSpacing} height={priceAreaH + volumeAreaH + 20}
                    fill="transparent"
                    onMouseMove={(e) => handleMouseMove(e, candle, i)}
                    onMouseLeave={handleMouseLeave} />
                </g>
              ))}
            </g>
          );
        })()}

        {/* === BAR (OHLC) CHART === */}
        {chartType === 'bar' && visibleData.map((candle, i) => {
          const x = getX(i);
          const yOpen = getY(candle.open);
          const yClose = getY(candle.close);
          const yHigh = getY(candle.high);
          const yLow = getY(candle.low);
          const isGreen = candle.close >= candle.open;
          const color = isGreen ? '#238636' : '#da3633';
          const tickW = Math.max(candleW * 0.5, 4);

          return (
            <g key={`bar-${i}`}>
              <line x1={x} y1={yHigh} x2={x} y2={yLow}
                stroke={color} strokeWidth={Math.max(candleW * 0.15, 1.5)} />
              <line x1={x - tickW} y1={yOpen} x2={x} y2={yOpen}
                stroke={color} strokeWidth="2" />
              <line x1={x} y1={yClose} x2={x + tickW} y2={yClose}
                stroke={color} strokeWidth="2" />
              <rect x={x - candleSpacing / 2} y={paddingTop}
                width={candleSpacing} height={priceAreaH + volumeAreaH + 20}
                fill="transparent"
                onMouseMove={(e) => handleMouseMove(e, candle, i)}
                onMouseLeave={handleMouseLeave} />
            </g>
          );
        })}

        {/* RSI Overlay on price area */}
        {showRsi && overlays?.rsiSeries && (
          <g>
            {/* RSI 70/30 zone background */}
            <rect x={paddingLeft} y={getRsiY(70)} width={chartW - paddingLeft - paddingRight} height={getRsiY(30) - getRsiY(70)}
              fill="rgba(188,140,255,0.04)" />
            {/* RSI horizontal guide lines */}
            <line x1={paddingLeft} y1={getRsiY(70)} x2={chartW - paddingRight} y2={getRsiY(70)}
              stroke="#f85149" strokeWidth="0.7" strokeDasharray="4,4" opacity="0.35" />
            <line x1={paddingLeft} y1={getRsiY(50)} x2={chartW - paddingRight} y2={getRsiY(50)}
              stroke="#484f58" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.3" />
            <line x1={paddingLeft} y1={getRsiY(30)} x2={chartW - paddingRight} y2={getRsiY(30)}
              stroke="#3fb950" strokeWidth="0.7" strokeDasharray="4,4" opacity="0.35" />
            {/* RSI line */}
            <path d={buildRsiPath()} fill="none" stroke="#bc8cff" strokeWidth="2" strokeLinejoin="round" opacity="0.85" />
            {/* RSI right-side axis labels */}
            <text x={chartW - paddingRight + 6} y={getRsiY(70) + 4} fill="#f85149" fontSize="9" textAnchor="start" opacity="0.7">70</text>
            <text x={chartW - paddingRight + 6} y={getRsiY(50) + 4} fill="#bc8cff" fontSize="9" textAnchor="start" opacity="0.7">50</text>
            <text x={chartW - paddingRight + 6} y={getRsiY(30) + 4} fill="#3fb950" fontSize="9" textAnchor="start" opacity="0.7">30</text>
            <text x={chartW - paddingRight + 6} y={getRsiY(0) + 4} fill="#8b949e" fontSize="8" textAnchor="start" opacity="0.5">RSI</text>
          </g>
        )}

        {/* Sentiment Overlay (0-100 scale, same Y as RSI) */}
        {showSentiment && overlays?.sentimentSeries && (() => {
          const sliced = sliceOverlay(overlays.sentimentSeries);
          if (!sliced || sliced.length === 0) return null;
          const getSentY = (val) => paddingTop + (1 - val / 100) * priceAreaH;
          const pts = sliced.map((v, i) => ({ x: getX(i), y: getSentY(v), val: v })).filter(p => p.val !== null && p.val !== undefined);
          if (pts.length < 2) return null;
          const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          const areaPath = linePath + ` L ${pts[pts.length - 1].x} ${paddingTop + priceAreaH} L ${pts[0].x} ${paddingTop + priceAreaH} Z`;
          return (
            <g>
              <defs>
                <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3fb950" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="#d29922" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#f85149" stopOpacity="0.2" />
                </linearGradient>
              </defs>
              <rect x={paddingLeft} y={getSentY(75)} width={chartW - paddingLeft - paddingRight} height={getSentY(25) - getSentY(75)}
                fill="rgba(210,153,34,0.03)" />
              <line x1={paddingLeft} y1={getSentY(75)} x2={chartW - paddingRight} y2={getSentY(75)}
                stroke="#3fb950" strokeWidth="0.5" strokeDasharray="3,6" opacity="0.3" />
              <line x1={paddingLeft} y1={getSentY(50)} x2={chartW - paddingRight} y2={getSentY(50)}
                stroke="#d29922" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.2" />
              <line x1={paddingLeft} y1={getSentY(25)} x2={chartW - paddingRight} y2={getSentY(25)}
                stroke="#f85149" strokeWidth="0.5" strokeDasharray="3,6" opacity="0.3" />
              <path d={areaPath} fill="url(#sentGrad)" />
              <path d={linePath} fill="none" stroke="#d29922" strokeWidth="2.5" strokeLinejoin="round" opacity="0.9" />
              {pts.map((p, i) => (
                <circle key={`sp-${i}`} cx={p.x} cy={p.y} r="2.5"
                  fill={p.val >= 60 ? '#3fb950' : p.val <= 40 ? '#f85149' : '#d29922'}
                  opacity="0.7" />
              ))}
              <text x={chartW - paddingRight + 6} y={getSentY(75) + 4} fill="#3fb950" fontSize="8" textAnchor="start" opacity="0.7">Greed</text>
              <text x={chartW - paddingRight + 6} y={getSentY(50) + 4} fill="#d29922" fontSize="8" textAnchor="start" opacity="0.7">50</text>
              <text x={chartW - paddingRight + 6} y={getSentY(25) + 4} fill="#f85149" fontSize="8" textAnchor="start" opacity="0.7">Fear</text>
              <text x={chartW - paddingRight + 6} y={getSentY(5) + 4} fill="#d29922" fontSize="7" textAnchor="start" opacity="0.5">SENT</text>
            </g>
          );
        })()}

        {/* === FOCUS MODE: AI Levels on Chart === */}
        {focusMode && aiLevels && (() => {
          const levels = [
            { price: aiLevels.stopLoss, label: 'SL', color: '#f85149', dash: '6,3' },
            { price: aiLevels.entry, label: 'Entry', color: '#58a6ff', dash: '6,3' },
            { price: aiLevels.takeProfit1, label: 'TP1', color: '#3fb950', dash: '6,3' },
            { price: aiLevels.takeProfit2, label: 'TP2', color: '#3fb950', dash: '3,3' },
            { price: aiLevels.support1, label: 'S1', color: '#d29922', dash: '4,4' },
            { price: aiLevels.resistance1, label: 'R1', color: '#a371f7', dash: '4,4' },
          ].filter(l => l.price && l.price > pMin && l.price < pMax);
          return levels.map((lvl, i) => {
            const y = getY(lvl.price);
            return (
              <g key={`ai-lvl-${i}`}>
                <line x1={paddingLeft} y1={y} x2={chartW - paddingRight} y2={y}
                  stroke={lvl.color} strokeWidth="1" strokeDasharray={lvl.dash} opacity="0.6" />
                <rect x={paddingLeft - 2} y={y - 9} width={54} height={18} rx="4"
                  fill="#0d1117" stroke={lvl.color} strokeWidth="0.7" opacity="0.9" />
                <text x={paddingLeft + 3} y={y + 3} fill={lvl.color} fontSize="8" fontWeight="700" fontFamily="monospace">
                  🤖 {lvl.label}
                </text>
                <text x={chartW - paddingRight + 4} y={y + 3} fill={lvl.color} fontSize="8" fontFamily="monospace" fontWeight="600" opacity="0.8">
                  {formatP(lvl.price)}
                </text>
              </g>
            );
          });
        })()}

        {/* === FOCUS MODE: Scenario Channels (bullish green / bearish red clouds) === */}
        {focusMode && scenarios && (() => {
          const lastPrice = visibleData[n - 1]?.close;
          if (!lastPrice) return null;
          const baseTarget = scenarios.base?.target;
          const altTarget = scenarios.alternative?.target;
          if (!baseTarget || !altTarget) return null;
          const bullTarget = scenarios.base?.direction === 'bullish' ? baseTarget : altTarget;
          const bearTarget = scenarios.base?.direction === 'bearish' ? baseTarget : altTarget;
          const midX = getX(Math.floor(n * 0.6));
          const endX = getX(n - 1);
          const priceX = getX(Math.floor(n * 0.4));
          const yPrice = getY(lastPrice);
          const yBull = getY(Math.min(bullTarget, pMax));
          const yBear = getY(Math.max(bearTarget, pMin));
          return (
            <g opacity="0.25">
              <path d={`M ${priceX} ${yPrice} Q ${midX} ${yBull} ${endX} ${yBull} L ${endX} ${yPrice} Z`}
                fill="#3fb950" />
              <path d={`M ${priceX} ${yPrice} Q ${midX} ${yBear} ${endX} ${yBear} L ${endX} ${yPrice} Z`}
                fill="#f85149" />
            </g>
          );
        })()}

        {/* Crosshair */}
        {crosshair && (
          <g>
            <line x1={crosshair.x} y1={paddingTop} x2={crosshair.x} y2={paddingTop + priceAreaH}
              stroke="#58a6ff" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.6" />
            <line x1={paddingLeft} y1={crosshair.y} x2={chartW - paddingRight} y2={crosshair.y}
              stroke="#58a6ff" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.6" />
          </g>
        )}

        {/* Date labels */}
        {visibleData.map((candle, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null;
          return (
            <text key={`dt-${i}`} x={getX(i)} y={totalH - 10}
              fill="#8b949e" fontSize="10" textAnchor="middle" fontFamily="monospace">
              {candle.date}
            </text>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${paddingLeft + 10}, ${paddingTop - 15})`}>
          <rect width="8" height="8" fill="#238636" rx="1" />
          <text x="12" y="8" fill="#8b949e" fontSize="10">Wzrost</text>
          <rect x="60" width="8" height="8" fill="#da3633" rx="1" />
          <text x="72" y="8" fill="#8b949e" fontSize="10">Spadek</text>
          {smaPoints.length > 1 && (
            <>
              <line x1="120" y1="4" x2="140" y2="4" stroke="#f0883e" strokeWidth="1.5" />
              <text x="144" y="8" fill="#8b949e" fontSize="10">SMA20</text>
            </>
          )}
          <text x="200" y="8" fill="#484f58" fontSize="10">Vol ▼</text>
          {showEma && <>
            <line x1="250" y1="4" x2="270" y2="4" stroke="#3fb950" strokeWidth="1.5" />
            <text x="274" y="8" fill="#8b949e" fontSize="10">EMA12</text>
            <line x1="318" y1="4" x2="338" y2="4" stroke="#a371f7" strokeWidth="1.5" />
            <text x="342" y="8" fill="#8b949e" fontSize="10">EMA26</text>
          </>}
          {showBb && <>
            <line x1="390" y1="4" x2="410" y2="4" stroke="#58a6ff" strokeWidth="1" strokeDasharray="4,3" />
            <text x="414" y="8" fill="#8b949e" fontSize="10">BB</text>
          </>}
          {showFib && <text x="450" y="8" fill="#d29922" fontSize="10">Fib</text>}
          {showRsi && <text x="480" y="8" fill="#bc8cff" fontSize="10">RSI</text>}
          {showSentiment && <text x="510" y="8" fill="#d29922" fontSize="10">Sentiment</text>}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="chart-tooltip" style={{
          left: Math.min(tooltip.x + 16, containerWidth - 200),
          top: Math.max(tooltip.y - 10, 10)
        }}>
          <div className="tt-date">{tooltip.candle.date} ({tooltip.candle.dayOfWeek})</div>
          <div className="tt-row"><span>Otwarcie:</span> <span>{formatP(tooltip.candle.open)}</span></div>
          <div className="tt-row"><span>Najwyższe:</span> <span className="tt-high">{formatP(tooltip.candle.high)}</span></div>
          <div className="tt-row"><span>Najniższe:</span> <span className="tt-low">{formatP(tooltip.candle.low)}</span></div>
          <div className="tt-row"><span>Zamknięcie:</span> <span>{formatP(tooltip.candle.close)}</span></div>
          {tooltip.candle.volume > 0 && (
            <div className="tt-row"><span>Wolumen:</span> <span>{(tooltip.candle.volume / 1e9).toFixed(2)}B</span></div>
          )}
          <div className={`tt-change ${tooltip.candle.changePercent >= 0 ? 'positive' : 'negative'}`}>
            {tooltip.candle.changePercent >= 0 ? '▲' : '▼'} {tooltip.candle.changePercent?.toFixed(2)}%
          </div>
        </div>
      )}

    </div>
  );
}

/* ======================== NEWS SLIDER ======================== */

function NewsSlider({ newsData, ticker, newsAggregation }) {
  const [selectedDay, setActiveDay] = useState(null);
  const [expandedNews, setExpandedNews] = useState(null);
  const [filterImportance, setFilterImportance] = useState('all');

  if (!newsData || !newsData.newsByDay || Object.keys(newsData.newsByDay).length === 0) {
    return (
      <div className="news-section">
        <div className="news-header">
          <h3>📰 Wiadomości {ticker}</h3>
          <span className="refresh-info">🔄 Auto-odświeżanie co 5 min</span>
        </div>
        <div className="news-empty">
          <p>📰 Brak wiadomości dla {ticker} — spróbuj później</p>
        </div>
      </div>
    );
  }

  const days = Object.keys(newsData.newsByDay);
  const activeDay = selectedDay && days.includes(selectedDay) ? selectedDay : days[0];

  const filterArticles = (articles) => {
    if (filterImportance === 'all') return articles;
    if (filterImportance === 'high') return articles.filter(a => a.importance >= 6);
    if (filterImportance === 'important') return articles.filter(a => a.isImportant);
    return articles;
  };

  const activeDayData = activeDay ? newsData.newsByDay[activeDay] : null;
  const filteredArticles = activeDayData ? filterArticles(activeDayData.articles) : [];

  return (
    <div className="news-section">
      <div className="news-header">
        <div>
          <h3>📰 Wiadomości — {ticker}</h3>
          <small>🔄 Aktualizacja: {newsData.lastRefresh} • Źródło: Finnhub</small>
        </div>
        {newsData.newArticlesCount > 0 && (
          <div className="new-articles-badge">✨ {newsData.newArticlesCount} nowych</div>
        )}
      </div>

      {newsAggregation && (
        <div className="news-aggregation-card">
          <div className="nag-header">
            <span className="nag-title">🤖 AI Sentiment Aggregation</span>
            <span className={`nag-badge nag-${newsAggregation.direction}`}>{newsAggregation.label}</span>
          </div>
          <div className="nag-body">
            <div className="nag-score-container">
              <span className={`nag-score score-${newsAggregation.direction}`}>{newsAggregation.score > 0 ? '+' : ''}{newsAggregation.score}</span>
              <span className="nag-score-label">Global Score</span>
            </div>
            <div className="nag-stats">
              <div className="nag-stat">
                <span className="nag-stat-val" style={{color: '#3fb950'}}>{newsAggregation.bullishCount} 🟢</span>
                <span className="nag-stat-lbl">Pozytywne</span>
              </div>
              <div className="nag-stat">
                <span className="nag-stat-val" style={{color: '#f85149'}}>{newsAggregation.bearishCount} 🔴</span>
                <span className="nag-stat-lbl">Negatywne</span>
              </div>
              <div className="nag-stat">
                <span className="nag-stat-val">{newsAggregation.neutralCount} ⚪</span>
                <span className="nag-stat-lbl">Neutralne</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="news-filters">
        {[
          { key: 'all', label: 'Wszystkie' },
          { key: 'high', label: '🔴 Krytyczne' },
          { key: 'important', label: '⭐ Ważne' }
        ].map(f => (
          <button
            key={f.key}
            className={`filter-btn ${filterImportance === f.key ? 'active' : ''}`}
            onClick={() => setFilterImportance(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="days-slider">
        {days.map((day) => {
          const dayData = newsData.newsByDay[day];
          return (
            <button
              key={day}
              onClick={() => { setActiveDay(day); setExpandedNews(null); }}
              className={`day-btn ${activeDay === day ? 'active' : ''}`}
            >
              <span className="day-name">{day}</span>
              <span className="article-count">{dayData.articles.length}</span>
            </button>
          );
        })}
      </div>

      {activeDay && activeDayData && (
        <div className="news-list">
          <div className="day-info-bar">
            <span>{filteredArticles.length} artykułów</span>
          </div>
          
          {filteredArticles.length > 0 ? (
            <div className="news-articles">
              {filteredArticles.map((article) => (
                <div 
                  key={article.id} 
                  className={`news-article ${article.importance >= 6 ? 'high-imp' : ''}`}
                >
                  <div className="article-badges">
                    <span className={`badge importance ${getImportanceClass(article.importance)}`}>
                      {article.importanceLevel}
                    </span>
                    <span className={`badge sentiment ${article.sentiment.includes('POZYTYWNA') ? 'pos' : article.sentiment.includes('NEGATYWNA') ? 'neg' : 'neu'}`}>
                      {article.sentiment}
                    </span>
                    {article.impact && (
                      <span className={`badge impact-badge impact-${article.impact.toLowerCase()}`}>
                        {article.impact}
                      </span>
                    )}
                    {article.direction && article.direction !== 'neutral' && (
                      <span className={`badge direction-badge dir-${article.direction}`}>
                        {article.direction === 'bullish' ? '🟢 Wzrostowy' : '🔴 Spadkowy'} ({article.directionConfidence}%)
                      </span>
                    )}
                    <span className="badge source">{article.source}</span>
                  </div>

                  <h4>{article.title}</h4>
                  {article.shortSummary && (
                    <div className="news-summary-line">{article.shortSummary}</div>
                  )}

                  <p className={`article-body ${expandedNews === article.id ? 'expanded' : ''}`}>
                    {article.body}
                  </p>

                  <div className="article-footer">
                    <span className="article-time">🕐 {article.publishedString}</span>
                    <div className="article-actions">
                      {article.body.length > 100 && (
                        <button 
                          className="btn-small"
                          onClick={() => setExpandedNews(expandedNews === article.id ? null : article.id)}
                        >
                          {expandedNews === article.id ? '⬆ Zwiń' : '⬇ Więcej'}
                        </button>
                      )}
                      <a href={article.url} target="_blank" rel="noopener noreferrer" className="btn-small btn-link">
                        🔗 Źródło
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="news-empty">
              <p>Brak artykułów spełniających filtr</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getImportanceClass(importance) {
  if (importance >= 9) return 'critical';
  if (importance >= 6) return 'high';
  if (importance >= 3) return 'medium';
  return 'low';
}

export default AiTrader;