import { useState, useEffect, useMemo, useCallback } from "react";
import { useSettings } from "../../SettingsContext";
import StockCard from "./StockCard";
import FilterBar from "./FilterBar";
import StatsOverview from "./StatsOverview";
import StockModal from "./StockModal";
import TopPick from "./TopPick";
import { enrichStock } from "./dividendUtils";
import API_URL from '../../config';

const STRATEGY_TABS = [
    { key: "all",       label: "Wszystkie",      icon: "fa-solid fa-layer-group" },
    { key: "okazje",    label: "Okazje",         icon: "fa-solid fa-fire" },
    { key: "arystokraci", label: "Arystokraci",  icon: "fa-solid fa-crown" },
    { key: "wzrostowe", label: "Wzrostowe",      icon: "fa-solid fa-arrow-trend-up" },
    { key: "bezpieczne", label: "Najbezpieczniejsze", icon: "fa-solid fa-shield-halved" },
];
export default function DividendsPanel() {
    const { settings: appSettings } = useSettings();
    const [rawStocks, setRawStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [selectedSector, setSelectedSector] = useState("Wszystkie");
    const [sortBy, setSortBy] = useState(() => appSettings.dividends_defaultSort || "score");
    const [smartFilter, setSmartFilter] = useState("");
    const [selectedStock, setSelectedStock] = useState(null);
    const [aiAnalysis, setAiAnalysis] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [stockNews, setStockNews] = useState([]);
    const [marketNews, setMarketNews] = useState([]);
    const [lastRefresh, setLastRefresh] = useState("");
    const [activeTab, setActiveTab] = useState(() => appSettings.dividends_defaultTab || "all");
    const [watchlist, setWatchlist] = useState(() => {
        try { return JSON.parse(localStorage.getItem("div-watchlist") || "[]"); } catch { return []; }
    });

    const toggleWatchlist = useCallback((ticker) => {
        setWatchlist(prev => {
            const next = prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker];
            localStorage.setItem("div-watchlist", JSON.stringify(next));
            return next;
        });
    }, []);

    useEffect(() => {
        fetchDividends();
    }, []);

    // Sync with global settings
    useEffect(() => {
        if (appSettings.dividends_defaultTab) setActiveTab(appSettings.dividends_defaultTab);
        if (appSettings.dividends_defaultSort) setSortBy(appSettings.dividends_defaultSort);
        if (appSettings.dividends_buyOnly) setSmartFilter(appSettings.dividends_buyOnly ? "buy-only" : "");
    }, [appSettings]);

    /* ---- Enrich stocks with computed scores ---- */
    const stocks = useMemo(() => {
        try { return (rawStocks || []).map(enrichStock); }
        catch (e) { console.error('enrichStock error:', e); return []; }
    }, [rawStocks]);

    const fetchDividends = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API_URL}/api/dividends`);
            const data = await res.json();
            if (data.success && Array.isArray(data.stocks) && data.stocks.length > 0) {
                setRawStocks(data.stocks);
                if (data.lastRefresh) setLastRefresh(data.lastRefresh);

                // Dispatch notifications — SMART: ex-div date proximity + reports
                const notifItems = [];
                const enrichedStocks = data.stocks.map(enrichStock);

                // Load alert days from settings
                const exDivAlertDays = appSettings.dividends_exDivAlertDays || 7;

                // Ex-dividend date proximity alerts
                const now = new Date();
                const upcomingDiv = enrichedStocks
                    .filter(s => {
                        if (!s.exDivDate || s.exDivDate === "N/A" || s.exDivDate === "—") return false;
                        const exDate = new Date(s.exDivDate);
                        const daysUntil = Math.ceil((exDate - now) / (1000 * 60 * 60 * 24));
                        return daysUntil >= 0 && daysUntil <= exDivAlertDays;
                    })
                    .sort((a, b) => new Date(a.exDivDate) - new Date(b.exDivDate));

                if (upcomingDiv.length > 0) {
                    const next = upcomingDiv[0];
                    const daysUntil = Math.ceil((new Date(next.exDivDate) - now) / (1000 * 60 * 60 * 24));
                    const urgency = daysUntil <= 1 ? "🔴" : daysUntil <= 3 ? "🟡" : "📅";
                    const daysText = daysUntil === 0 ? "DZISIAJ" : daysUntil === 1 ? "JUTRO" : `za ${daysUntil} dni`;
                    notifItems.push({ type: "day", text: `${urgency} Dywidenda ${next.ticker}: ex-div ${daysText} (${next.exDivDate})`, ticker: next.ticker });

                    if (upcomingDiv.length > 1) {
                        notifItems.push({ type: "day", text: `📅 Jeszcze ${upcomingDiv.length - 1} spółek z ex-div w ciągu ${exDivAlertDays} dni`, ticker: "" });
                    }
                }

                // Reports: only strong BUY signals (not all)
                const buyStocks = enrichedStocks.filter(s => s.verdict === "KUPUJ");
                if (buyStocks.length > 0) {
                    const topBuy = buyStocks.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
                    notifItems.push({ type: "reports", text: `🏆 TOP Pick: ${topBuy.ticker} — ${topBuy.name} (Yield: ${topBuy.dividendYield?.toFixed(2)}%)`, ticker: topBuy.ticker });
                }

                // Earnings growth alerts
                const earningsAlerts = enrichedStocks.filter(s =>
                    s.earningsGrowth != null && Math.abs(s.earningsGrowth) > 20
                );
                earningsAlerts.slice(0, 2).forEach(s => {
                    const dir = s.earningsGrowth > 0 ? "wzrost" : "spadek";
                    notifItems.push({ type: "reports", text: `📊 ${s.ticker}: ${dir} zysków o ${Math.abs(s.earningsGrowth).toFixed(1)}%`, ticker: s.ticker });
                });

                if (notifItems.length > 0) {
                    window.dispatchEvent(new CustomEvent("autograph:notification", {
                        detail: { source: "dividends", items: notifItems }
                    }));
                }


                fetch(`${API_URL}/api/dividends/news`)
                    .then(r => r.json())
                    .then(nd => { if (nd.success) setMarketNews(nd.news); })
                    .catch(() => {});
            } else {
                setError(data.error || (data.stocks?.length === 0 ? "Serwer nie zwrócił danych — FMP API może być niedostępne. Spróbuj za kilka minut." : "Błąd pobierania danych"));
            }
        } catch (err) {
            setError("Nie można połączyć z serwerem: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    /* ---- AI Analiza fundamentalna ---- */
    const analyzeStock = async (stock) => {
        setSelectedStock(stock);
        setAiAnalysis("");
        setStockNews([]);
        setAiLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/dividends/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticker: stock.ticker }),
            });
            const data = await res.json();
            if (data.success) {
                setAiAnalysis(data.analysis);
                if (data.news) setStockNews(data.news);
            } else {
                setAiAnalysis("❌ " + (data.error || "Błąd analizy AI"));
            }
        } catch (err) {
            setAiAnalysis("❌ Nie można połączyć z AI: " + err.message);
        } finally {
            setAiLoading(false);
        }
    };

    const closeModal = () => {
        setSelectedStock(null);
        setAiAnalysis("");
        setStockNews([]);
    };

    /* ---- Sektory ---- */
    const allSectors = [...new Set(stocks.map((s) => s.sectorPl))];

    /* ---- Filtrowanie ---- */
    const filtered = stocks.filter((s) => {
        const matchSearch =
            s.ticker.toLowerCase().includes(search.toLowerCase()) ||
            s.name.toLowerCase().includes(search.toLowerCase());
        const matchSector =
            selectedSector === "Wszystkie" || s.sectorPl === selectedSector;

        // Smart filters
        let matchSmart = true;
        if (smartFilter === "very-safe") matchSmart = s.safetyLabel === "Bardzo bezpieczna";
        else if (smartFilter === "high-yield-safe") matchSmart = s.dividendYield >= 4 && s.safetyLabel !== "Ryzykowna";
        else if (smartFilter === "buy-only") matchSmart = s.verdict === "KUPUJ";
        else if (smartFilter === "risky") matchSmart = s.safetyLabel === "Ryzykowna";

        return matchSearch && matchSector && matchSmart;
    });

    /* ---- Sortowanie ---- */
    const sorted = [...filtered].sort((a, b) => {
        if (sortBy === "score") return (b.finalScore || 0) - (a.finalScore || 0);
        if (sortBy === "yield") return b.dividendYield - a.dividendYield;
        if (sortBy === "price") return b.price - a.price;
        if (sortBy === "payout") return a.payoutRatio - b.payoutRatio;
        if (sortBy === "pe") return a.peRatio - b.peRatio;
        return 0;
    });

    /* ---- Okazje count for tabs ---- */
    const okazje = sorted.filter(s => s.verdict === "KUPUJ");

    /* ---- Strategy tab filtering ---- */
    const tabStocks = useMemo(() => {
        if (activeTab === "okazje") return sorted.filter(s => s.verdict === "KUPUJ");
        if (activeTab === "arystokraci") return sorted.filter(s => s.divScore >= 8 && s.payoutRatio < 70);
        if (activeTab === "wzrostowe") return sorted.filter(s => s.earningsGrowth > 5 && s.dividendYield >= 2);
        if (activeTab === "bezpieczne") return [...sorted].sort((a, b) => b.divScore - a.divScore).slice(0, 8);
        return sorted;
    }, [sorted, activeTab]);

    /* ---- Top 3 newsy ---- */
    const topNews = marketNews.slice(0, 3);

    /* ---- Kalendarz dywidend (najbliższe ex-div daty) ---- */
    const calendarStocks = [...stocks]
        .filter(s => s.exDivDate && s.exDivDate !== "N/A" && s.exDivDate !== "—")
        .sort((a, b) => new Date(a.exDivDate) - new Date(b.exDivDate))
        .slice(0, 5);

    /* ---- Market sentiment ---- */
    const buyCount = stocks.filter(s => s.verdict === "KUPUJ").length;
    const sentimentLabel = buyCount >= stocks.length * 0.5 ? "POZYTYWNY" : buyCount >= stocks.length * 0.25 ? "NEUTRALNY" : "NEGATYWNY";
    const sentimentClass = sentimentLabel === "POZYTYWNY" ? "div-sentiment-pos" : sentimentLabel === "NEUTRALNY" ? "div-sentiment-neu" : "div-sentiment-neg";

    return (
        <div className="div-panel">
            {/* ===== NAGŁÓWEK SEKCJI ===== */}
            <div className="div-panel-header">
                <div className="div-panel-title">
                    <i className="fa-solid fa-chart-pie"></i>
                    <div>
                        <h1>Rynki Dywidendowe</h1>
                        <p className="div-panel-subtitle">
                            TOP {stocks.length} najbardziej opłacalnych spółek — AI scoring codzienny
                            {lastRefresh && ` | Aktualizacja: ${new Date(lastRefresh).toLocaleString('pl-PL')}`}
                        </p>
                    </div>
                </div>
                <div className="div-panel-badges">
                    <div className="div-panel-badge">
                        <i className="fa-solid fa-crown"></i>
                        <span>Maximum Plan</span>
                    </div>
                    <div className="div-panel-badge div-badge-live">
                        <i className="fa-solid fa-satellite-dish"></i>
                        <span>FMP API Live</span>
                    </div>
                </div>
            </div>

            {/* ===== LOADING / ERROR ===== */}
            {loading && (
                <div className="div-loading">
                    <div className="div-spinner"></div>
                    <p>Analizuję 30 spółek dywidendowych...</p>
                    <p className="div-loading-sub">Obliczam scoring opłacalności — TOP 15</p>
                </div>
            )}

            {error && (
                <div className="div-error">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <p>{error}</p>
                    <button onClick={fetchDividends}>Spróbuj ponownie</button>
                </div>
            )}

            {!loading && !error && stocks.length > 0 && (
                <>
                    {/* ===== TOP PICK BANNER ===== */}
                    <TopPick stocks={stocks} onAnalyze={analyzeStock} />

                    {/* ===== STATYSTYKI OGÓLNE ===== */}
                    <StatsOverview stocks={stocks} />

                    {/* ===== MARQUEE INDEX BAR ===== */}
                    <div className="div-index-bar">
                        <div className="div-index-card">
                            <span className="div-index-label">S&P 500</span>
                            <span className="div-index-val">5,525.21</span>
                            <span className="div-index-change div-change-up">+0.74%</span>
                        </div>
                        <div className="div-index-card">
                            <span className="div-index-label">NASDAQ</span>
                            <span className="div-index-val">17,382.94</span>
                            <span className="div-index-change div-change-up">+1.12%</span>
                        </div>
                        <div className="div-index-card">
                            <span className="div-index-label">WIG20</span>
                            <span className="div-index-val">2,512.30</span>
                            <span className="div-index-change div-change-down">-0.31%</span>
                        </div>
                        <div className="div-index-card">
                            <span className="div-index-label">Sentyment</span>
                            <span className={`div-index-val ${sentimentClass}`}>{sentimentLabel}</span>
                            <span className="div-index-detail">{buyCount}/{stocks.length} KUPUJ</span>
                        </div>
                        {topNews.length > 0 && (
                            <div className="div-index-news-marquee">
                                <div className="div-marquee-track">
                                    {[...topNews, ...topNews].map((n, i) => (
                                        <a key={i} className="div-marquee-item" href={n.url} target="_blank" rel="noopener noreferrer">
                                            <span className="div-marquee-ticker">{n.ticker}</span>
                                            <span className="div-marquee-text">{n.headline}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ===== KALENDARZ DYWIDEND ===== */}
                    {calendarStocks.length > 0 && (
                        <div className="div-calendar-widget">
                            <div className="div-calendar-header">
                                <i className="fa-regular fa-calendar-check"></i>
                                <span>Nadchodzące daty Ex-Dividend</span>
                                <span className="div-calendar-hint">Aby otrzymać dywidendę, kup przed tą datą</span>
                            </div>
                            <div className="div-calendar-list">
                                {calendarStocks.map((s) => (
                                    <div key={s.ticker} className="div-calendar-item">
                                        <span className={`div-cal-verdict div-verdict-badge ${s.verdict === "KUPUJ" ? "div-verdict-buy" : s.verdict === "TRZYMAJ" ? "div-verdict-hold" : "div-verdict-avoid"}`}>
                                            {s.verdict}
                                        </span>
                                        <span className="div-cal-ticker">{s.ticker}</span>
                                        <span className="div-cal-date">{s.exDivDate}</span>
                                        <span className="div-cal-yield">{s.dividendYield.toFixed(2)}%</span>
                                        <span className="div-cal-name">{s.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ===== FILTROWANIE I SORTOWANIE ===== */}
                    <FilterBar
                        search={search}
                        setSearch={setSearch}
                        sectors={allSectors}
                        selectedSector={selectedSector}
                        setSelectedSector={setSelectedSector}
                        sortBy={sortBy}
                        setSortBy={setSortBy}
                        smartFilter={smartFilter}
                        setSmartFilter={setSmartFilter}
                        resultCount={tabStocks.length}
                    />

                    {/* ===== STRATEGY TABS ===== */}
                    <div className="div-strategy-tabs">
                        {STRATEGY_TABS.map(tab => (
                            <button
                                key={tab.key}
                                className={`div-strategy-tab ${activeTab === tab.key ? "active" : ""}`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                <i className={tab.icon}></i>
                                {tab.label}
                                {tab.key !== "all" && (
                                    <span className="div-tab-count">
                                        {tab.key === "okazje" ? okazje.length
                                            : tab.key === "arystokraci" ? sorted.filter(s => s.divScore >= 8 && s.payoutRatio < 70).length
                                            : tab.key === "wzrostowe" ? sorted.filter(s => s.earningsGrowth > 5 && s.dividendYield >= 2).length
                                            : tab.key === "bezpieczne" ? Math.min(sorted.length, 8)
                                            : sorted.length
                                        }
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ===== STOCK GRID ===== */}
                    <div className="div-stocks-grid">
                        {tabStocks.length > 0 ? (
                            tabStocks.map((stock, i) => (
                                <StockCard
                                    key={stock.ticker}
                                    stock={stock}
                                    index={i}
                                    onAnalyze={() => analyzeStock(stock)}
                                    isWatchlisted={watchlist.includes(stock.ticker)}
                                    onToggleWatchlist={() => toggleWatchlist(stock.ticker)}
                                />
                            ))
                        ) : (
                            <div className="div-empty">
                                <i className="fa-solid fa-magnifying-glass"></i>
                                <p>Brak wyników dla podanych filtrów.</p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ===== PROFESSIONAL FOOTER ===== */}
            <footer className="div-footer">
                <div className="div-footer-top">
                    <div className="div-footer-col">
                        <h4>Dane</h4>
                        <span><i className="fa-solid fa-database"></i> Financial Modeling Prep (FMP)</span>
                        <span><i className="fa-solid fa-robot"></i> AI: Gemma 4 / Gemini</span>
                        <span><i className="fa-solid fa-chart-line"></i> NYSE, NASDAQ</span>
                    </div>
                    <div className="div-footer-col">
                        <h4>Informacje</h4>
                        <span>Polityka prywatności</span>
                        <span>Regulamin</span>
                        <span>Metodologia AI</span>
                    </div>
                    <div className="div-footer-col">
                        <h4>Kontakt</h4>
                        <span>kontakt@autograph.pl</span>
                    </div>
                </div>
                <div className="div-footer-disclaimer">
                    <i className="fa-solid fa-scale-balanced"></i>
                    <p>Informacje prezentowane na tej stronie mają wyłącznie charakter edukacyjny i informacyjny. <strong>Nie stanowią porady inwestycyjnej</strong> w rozumieniu przepisów prawa. Przed podjęciem decyzji inwestycyjnych skonsultuj się z licencjonowanym doradcą finansowym. Inwestowanie wiąże się z ryzykiem utraty kapitału.</p>
                </div>
            </footer>

            {/* ===== MODAL ANALIZY ===== */}
            {selectedStock && (
                <StockModal
                    stock={selectedStock}
                    analysis={aiAnalysis}
                    aiLoading={aiLoading}
                    news={stockNews}
                    onClose={closeModal}
                />
            )}
        </div>
    );
}
