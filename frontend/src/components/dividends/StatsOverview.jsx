import { useState } from "react";

export default function StatsOverview({ stocks }) {
    const [showSectors, setShowSectors] = useState(false);

    if (!stocks.length) return null;

    const avgYield = (stocks.reduce((s, st) => s + st.dividendYield, 0) / stocks.length).toFixed(2);
    const topYield = [...stocks].sort((a, b) => b.dividendYield - a.dividendYield)[0];
    const avgPayout = (stocks.reduce((s, st) => s + st.payoutRatio, 0) / stocks.length).toFixed(1);
    const avgPE = (stocks.filter(s => s.peRatio > 0).reduce((s, st) => s + st.peRatio, 0) / stocks.filter(s => s.peRatio > 0).length).toFixed(1);
    const totalStocks = stocks.length;
    const avgScore = (stocks.reduce((s, st) => s + (st.finalScore || 0), 0) / stocks.length).toFixed(0);

    // Sektory z liczbą spółek
    const sectorMap = {};
    stocks.forEach(s => {
        if (!sectorMap[s.sectorPl]) sectorMap[s.sectorPl] = [];
        sectorMap[s.sectorPl].push(s.ticker);
    });
    const sectorCount = Object.keys(sectorMap).length;

    return (
        <div className="div-stats-row">
            <div className="div-stat-card">
                <i className="fa-solid fa-percent"></i>
                <div>
                    <span className="div-stat-value">{avgYield}%</span>
                    <span className="div-stat-label">Śr. stopa dywidendy</span>
                </div>
            </div>

            <div className="div-stat-card">
                <i className="fa-solid fa-trophy"></i>
                <div>
                    <span className="div-stat-value">{topYield.ticker} ({topYield.dividendYield}%)</span>
                    <span className="div-stat-label">Najwyższa stopa</span>
                </div>
            </div>

            <div className="div-stat-card">
                <i className="fa-solid fa-scale-balanced"></i>
                <div>
                    <span className="div-stat-value">{avgPayout}%</span>
                    <span className="div-stat-label">Śr. wsk. wypłaty</span>
                </div>
            </div>

            <div className="div-stat-card">
                <i className="fa-solid fa-calculator"></i>
                <div>
                    <span className="div-stat-value">{avgPE}</span>
                    <span className="div-stat-label">Śr. P/E</span>
                </div>
            </div>

            <div className="div-stat-card">
                <i className="fa-solid fa-star"></i>
                <div>
                    <span className="div-stat-value">{avgScore}/100</span>
                    <span className="div-stat-label">Śr. ocena ({totalStocks} spółek)</span>
                </div>
            </div>

            <div
                className="div-stat-card div-stat-clickable"
                onClick={() => setShowSectors(!showSectors)}
                style={{ cursor: "pointer", position: "relative" }}
            >
                <i className="fa-solid fa-layer-group"></i>
                <div>
                    <span className="div-stat-value">{sectorCount}</span>
                    <span className="div-stat-label">Sektory ▾</span>
                </div>

                {showSectors && (
                    <div className="div-sector-dropdown" onClick={(e) => e.stopPropagation()}>
                        {Object.entries(sectorMap)
                            .sort((a, b) => b[1].length - a[1].length)
                            .map(([sector, tickers]) => (
                                <div key={sector} className="div-sector-row">
                                    <span className="div-sector-name">{sector}</span>
                                    <span className="div-sector-tickers">{tickers.join(", ")}</span>
                                    <span className="div-sector-count">{tickers.length}</span>
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}
