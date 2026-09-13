import { useState } from "react";
import { getSafetyClass, getVerdictClass, getVerdictEmoji } from "./dividendUtils";

const METHODOLOGY_TOOLTIP = "Jak liczymy score?\n50% — Bezpieczeństwo dywidendy (payout, FCF, historia)\n30% — Wycena (P/E vs sektor, yield vs śr. 5-letnia)\n20% — Korekta ryzyka (beta, zadłużenie, trend zysków)";
const BELKA_TAX = 0.19;

const METRIC_TOOLTIPS = {
    payout: "Wskaźnik wypłaty — procent zysku przeznaczany na dywidendę.\nBezpieczny: <60% · Ostrzeżenie: 60-80% · Ryzyko cięcia: >80%",
    pe: "Cena/Zysk (P/E) — ile lat zysku płacisz za akcję.\nTania: <12 · Neutralna: 12-20 · Droga: >25",
    mcap: "Kapitalizacja rynkowa — łączna wartość wszystkich akcji spółki na giełdzie.",
    divPerShare: "Dywidenda na akcję — kwota w USD wypłacana rocznie na jedną posiadaną akcję."
};

/* Mini sparkline SVG — uses stock price data or simulates trend from beta */
function Sparkline({ stock }) {
    const [hover, setHover] = useState(null);
    const w = 60, h = 22, pts = 12;
    const seed = stock.ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const base = stock.price;
    const volatility = Math.min(stock.beta || 1, 2) * 0.02;
    const dataPoints = [];
    let val = base * (1 - volatility * pts / 2);
    for (let i = 0; i < pts; i++) {
        const rnd = Math.sin(seed * (i + 1) * 9301 + 49297) * 0.5 + 0.5;
        val += (rnd - 0.45) * base * volatility;
        dataPoints.push(val);
    }
    dataPoints.push(base);
    const min = Math.min(...dataPoints), max = Math.max(...dataPoints);
    const range = max - min || 1;
    const coords = dataPoints.map((v, i) => ({
        x: (i / (dataPoints.length - 1)) * w,
        y: h - ((v - min) / range) * (h - 4) - 2,
        price: v
    }));
    const points = coords.map(c => `${c.x},${c.y}`).join(" ");
    const up = base >= dataPoints[0];
    const color = up ? "#34d399" : "#f87171";

    const handleMouse = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const closest = coords.reduce((best, c) => Math.abs(c.x - mx) < Math.abs(best.x - mx) ? c : best);
        setHover(closest);
    };

    return (
        <div className="div-sparkline-wrap" onMouseMove={handleMouse} onMouseLeave={() => setHover(null)}>
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="div-sparkline-svg">
                <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" points={points} />
                {hover && <circle cx={hover.x} cy={hover.y} r="2" fill="#fff" />}
            </svg>
            {hover && (
                <div className="div-sparkline-tooltip" style={{ left: hover.x }}>
                    ${hover.price.toFixed(2)}
                </div>
            )}
        </div>
    );
}

export default function StockCard({ stock, onAnalyze, index, isWatchlisted, onToggleWatchlist }) {
    const [expanded, setExpanded] = useState(false);
    const [calcAmount, setCalcAmount] = useState("");

    const yieldClass =
        stock.dividendYield >= 5
            ? "div-yield-high"
            : stock.dividendYield >= 3
            ? "div-yield-mid"
            : "div-yield-low";

    const formatMCap = (v) => {
        if (!v) return "N/A";
        if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
        if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
        if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
        return `$${v}`;
    };

    const safetyClass = getSafetyClass(stock.safetyLabel);
    const verdictClass = getVerdictClass(stock.verdict);
    const verdictEmoji = getVerdictEmoji(stock.verdict);

    const handleCardClick = (e) => {
        if (e.target.closest("button")) return;
        setExpanded(!expanded);
    };

    const scoreBarColor =
        stock.verdict === "KUPUJ" ? "rgba(34,197,94,0.45)" :
        stock.verdict === "TRZYMAJ" ? "rgba(251,191,36,0.35)" :
        "rgba(248,113,113,0.35)";

    return (
        <div
            className={`div-stock-card div-card-animated ${expanded ? "div-card-expanded" : ""}`}
            style={{ animationDelay: `${(index || 0) * 60}ms` }}
            onClick={handleCardClick}
        >
            {/* ── LAYER 1: Badges (verdict left, watchlist + safety right) ── */}
            <div className="div-card-badges">
                <span className={`div-verdict-badge ${verdictClass}`}>
                    {verdictEmoji} {stock.verdict}
                </span>
                <div className="div-card-badges-right">
                    <button
                        className={`div-watchlist-btn ${isWatchlisted ? "div-watchlisted" : ""}`}
                        onClick={(e) => { e.stopPropagation(); onToggleWatchlist && onToggleWatchlist(); }}
                        title={isWatchlisted ? "Usuń z obserwowanych" : "Dodaj do obserwowanych"}
                    >
                        <i className={isWatchlisted ? "fa-solid fa-heart" : "fa-regular fa-heart"}></i>
                    </button>
                    <span className={`div-safety-badge ${safetyClass}`}>
                        {stock.safetyLabel}
                    </span>
                </div>
            </div>

            {/* ── LAYER 2: Ticker + Yield (focal point) ── */}
            <div className="div-card-hero">
                <div className="div-card-hero-left">
                    <div className="div-card-icon-sm">
                        <i className={stock.logo}></i>
                    </div>
                    <div>
                        <h3 className="div-card-ticker">{stock.ticker}</h3>
                        <div className="div-card-name-row">
                            <span className="div-card-name">{stock.name}</span>
                            <div className="div-card-price-spark">
                                <span className="div-card-price-mini">${stock.price.toFixed(2)}</span>
                                <Sparkline stock={stock} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className={`div-yield-big ${yieldClass}`}>
                    {stock.dividendYield.toFixed(2)}%
                    {stock.yieldContext && (
                        <span className="div-yield-context">{stock.yieldContext}</span>
                    )}
                </div>
            </div>

            {/* ── LAYER 3: 1-line reason (key insight) ── */}
            <div className="div-card-reason">
                {stock.reason}
            </div>

            {/* ── LAYER 4: Trends + sector (compact row) ── */}
            <div className="div-card-meta-row">
                <span className="div-sector-chip">
                    <i className="fa-solid fa-tag"></i> {stock.sectorPl}
                </span>
                <div className="div-card-trends">
                    <span className={`div-trend-item ${stock.trends.fcf === "↑" ? "div-trend-up" : stock.trends.fcf === "↓" ? "div-trend-down" : "div-trend-stable"}`}>
                        FCF {stock.trends.fcf}
                    </span>
                    <span className={`div-trend-item ${stock.trends.div === "↑" ? "div-trend-up" : stock.trends.div === "↓" ? "div-trend-down" : "div-trend-stable"}`}>
                        Div {stock.trends.div}
                    </span>
                </div>
            </div>

            {/* ── LAYER 5: Safety bar + score ── */}
            <div className="div-card-safety-row">
                <div className="div-safety-bar-wrap">
                    <span className="div-safety-bar-label">Bezpieczeństwo</span>
                    <div className="div-safety-bar-track">
                        <div
                            className="div-safety-bar-fill"
                            style={{
                                width: `${stock.divScore * 10}%`,
                                background: stock.divScore >= 8
                                    ? "rgba(34,197,94,0.7)"
                                    : stock.divScore >= 5
                                    ? "rgba(251,191,36,0.6)"
                                    : "rgba(248,113,113,0.7)"
                            }}
                        ></div>
                    </div>
                    <span className="div-safety-bar-val">{stock.divScore}/10</span>
                </div>
                <div
                    className="div-card-score-bar"
                    title={METHODOLOGY_TOOLTIP}
                    style={{ flex: "0 0 auto" }}
                >
                    <div className="div-score-fill" style={{ width: `${Math.min(stock.finalScore * 10, 100)}%`, background: scoreBarColor }}></div>
                    <span className="div-score-text">
                        ⭐ {stock.finalScore}/10
                        <i className="fa-solid fa-circle-info div-score-info-icon" title={METHODOLOGY_TOOLTIP}></i>
                    </span>
                </div>
            </div>

            {/* ── Risk transparency line (only for UNIKAJ) ── */}
            {stock.verdict === "UNIKAJ" && stock.riskReason && (
                <div className="div-risk-reason">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    {stock.riskReason}
                </div>
            )}

            {/* ── LAYER 6: Quick expand ── */}
            {expanded && (
                <div className="div-quick-expand">
                    {/* Score breakdown */}
                    <div className="div-expand-scores">
                        <div className="div-expand-score-row">
                            <span>Bezpieczeństwo dywidendy</span>
                            <div className="div-mini-bar">
                                <div className="div-mini-fill div-mini-green" style={{ width: `${stock.divScore * 10}%` }}></div>
                            </div>
                            <span className="div-expand-val">{stock.divScore}/10</span>
                        </div>
                        <div className="div-expand-score-row">
                            <span>Wycena vs sektor</span>
                            <div className="div-mini-bar">
                                <div className="div-mini-fill div-mini-yellow" style={{ width: `${stock.valScore * 10}%` }}></div>
                            </div>
                            <span className="div-expand-val">{stock.valScore}/10</span>
                        </div>
                        <div className="div-expand-score-row">
                            <span>Korekta ryzyka</span>
                            <div className="div-mini-bar">
                                <div className="div-mini-fill div-mini-red" style={{ width: `${Math.abs(stock.riskScore) * 20}%` }}></div>
                            </div>
                            <span className="div-expand-val">{stock.riskScore}</span>
                        </div>
                    </div>

                    {/* Key metrics with tooltips */}
                    <div className="div-expand-metrics">
                        <div className="div-expand-metric" title={METRIC_TOOLTIPS.payout}>
                            <span>Wskaźnik wypłaty <i className="fa-solid fa-circle-info div-tip-icon"></i></span>
                            <strong className={stock.payoutRatio > 80 ? 'div-metric-danger' : stock.payoutRatio > 60 ? 'div-metric-warn' : 'div-metric-ok'}>{stock.payoutRatio.toFixed(0)}%</strong>
                        </div>
                        <div className="div-expand-metric" title={METRIC_TOOLTIPS.pe}>
                            <span>Cena/Zysk (P/E) <i className="fa-solid fa-circle-info div-tip-icon"></i></span>
                            <strong>{stock.peRatio > 0 ? stock.peRatio.toFixed(1) : "N/A"}</strong>
                        </div>
                        <div className="div-expand-metric" title={METRIC_TOOLTIPS.mcap}>
                            <span>Kapitalizacja <i className="fa-solid fa-circle-info div-tip-icon"></i></span>
                            <strong>{formatMCap(stock.marketCap)}</strong>
                        </div>
                        <div className="div-expand-metric" title={METRIC_TOOLTIPS.divPerShare}>
                            <span>Dywidenda/akcję <i className="fa-solid fa-circle-info div-tip-icon"></i></span>
                            <strong>${stock.dividendPerShare.toFixed(2)}</strong>
                        </div>
                    </div>

                    {/* Dividend calculator + Belka tax */}
                    <div className="div-calc-section">
                        <div className="div-calc-label">
                            <i className="fa-solid fa-calculator"></i>
                            Kalkulator netto (z podatkiem Belki 19%)
                        </div>
                        <div className="div-calc-row">
                            <span className="div-calc-prefix">Inwestuję</span>
                            <input
                                className="div-calc-input"
                                type="number"
                                min="0"
                                placeholder="np. 10000"
                                value={calcAmount}
                                onChange={(e) => setCalcAmount(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <span className="div-calc-suffix">PLN</span>
                        </div>
                        {calcAmount > 0 && (() => {
                            const gross = calcAmount * stock.dividendYield / 100;
                            const tax = gross * BELKA_TAX;
                            const net = gross - tax;
                            return (
                                <div className="div-calc-result">
                                    <div className="div-calc-row-result">
                                        <span>Brutto:</span>
                                        <strong>{gross.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN/rok</strong>
                                    </div>
                                    <div className="div-calc-row-result div-calc-tax">
                                        <span>Podatek Belki (19%):</span>
                                        <strong>−{tax.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN</strong>
                                    </div>
                                    <div className="div-calc-row-result div-calc-net">
                                        <span>Na konto (netto):</span>
                                        <strong>{net.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN/rok</strong>
                                    </div>
                                    <span className="div-calc-monthly">
                                        ({(net / 12).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN/mies. netto)
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* ── FOOTER ── */}
            <div className="div-card-footer">
                <div className="div-exdiv">
                    <i className="fa-regular fa-calendar"></i>
                    <span>Ex-div: {stock.exDivDate}</span>
                </div>
                <button
                    className={`div-analyze-btn-primary ${
                        stock.verdict === "KUPUJ" ? "div-analyze-btn-buy"
                        : stock.verdict === "TRZYMAJ" ? "div-analyze-btn-hold"
                        : "div-analyze-btn-risk"
                    }`}
                    onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
                >
                    <i className="fa-solid fa-robot"></i>
                    Analizuj AI
                </button>
            </div>

            {/* ── DATA SOURCE STAMP ── */}
            <div className="div-card-source">
                Dane: FMP · Aktualizacja: {new Date().toLocaleDateString('pl-PL')}
            </div>
        </div>
    );
}
