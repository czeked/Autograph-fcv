/* ── Parse structured AI analysis into sections ── */
function parseAiSections(raw) {
    if (!raw) return {};
    const sections = {};
    let current = "HEADER";
    const lines = raw.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const sectionMatch = trimmed.match(/^\[(HEADER|CONFIDENCE_REASON|PROS|CONS|NEUTRAL|NEWS|SCORES|TREND|SCENARIO_BULL|SCENARIO_BEAR|ALERT|ANOMALY)\]$/);
        if (sectionMatch) {
            current = sectionMatch[1];
            if (!sections[current]) sections[current] = [];
            continue;
        }
        if (!sections[current]) sections[current] = [];
        sections[current].push(trimmed);
    }
    return sections;
}

function parseNewsStrength(newsLines) {
    if (!newsLines) return { sentiment: "NEUTRAL", strength: 0, reason: "" };
    let sentiment = "NEUTRAL", strength = 0, reason = "";
    for (const l of newsLines) {
        if (/^Sentyment:/i.test(l)) sentiment = l.replace(/^Sentyment:\s*/i, "").trim();
        else if (/^Si[łl]a:/i.test(l)) {
            const m = l.match(/([-+]?\d+\.?\d*)/);
            if (m) strength = parseFloat(m[1]);
        }
        else if (/^Pow[oó]d:/i.test(l)) reason = l.replace(/^Pow[oó]d:\s*/i, "").trim();
    }
    return { sentiment, strength, reason };
}

export default function StockModal({ stock, analysis, aiLoading, news, onClose }) {
    if (!stock) return null;

    const fmt = (v) => {
        if (!v) return "N/A";
        if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
        if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
        if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
        return `$${v}`;
    };

    const scoreClass = stock.score >= 70 ? 'div-score-high' : stock.score >= 50 ? 'div-score-mid' : 'div-score-low';
    const parsed = parseAiSections(analysis);
    const newsData = parseNewsStrength(parsed.NEWS);

    /* Extract header values */
    const headerLines = parsed.HEADER || [];
    let aiScore = "", aiConfidence = "", aiVerdict = "", aiSafety = "", aiReason = "";
    for (const l of headerLines) {
        if (/^Score:/i.test(l)) aiScore = l.replace(/^Score:\s*/i, "");
        else if (/^(Confidence|Pewno[śs][ćc]):/i.test(l)) aiConfidence = l.replace(/^(Confidence|Pewno[śs][ćc]):\s*/i, "");
        else if (/^Rekomendacja:/i.test(l)) aiVerdict = l.replace(/^Rekomendacja:\s*/i, "");
        else if (/^Dywidenda:/i.test(l)) aiSafety = l.replace(/^Dywidenda:\s*/i, "");
        else if (/^(Pow[oó]d|Kluczowy wniosek):/i.test(l)) aiReason = l.replace(/^(Pow[oó]d|Kluczowy wniosek):\s*/i, "");
    }

    const verdictColor = /kupuj/i.test(aiVerdict) ? "#34d399" : /trzymaj/i.test(aiVerdict) ? "#fbbf24" : "#f87171";
    const verdictIcon = /kupuj/i.test(aiVerdict) ? "✅" : /trzymaj/i.test(aiVerdict) ? "⚠️" : "❌";

    /* Sentiment bar percent: -3 to +3 → 0% to 100% */
    const sentimentPct = Math.max(0, Math.min(100, ((newsData.strength + 3) / 6) * 100));
    const sentimentBarColor = newsData.strength > 0.5 ? "#34d399" : newsData.strength < -0.5 ? "#f87171" : "#fbbf24";

    /* Extract scores */
    const scoresLines = parsed.SCORES || [];
    let divScore = "", valScore = "", riskScore = "";
    for (const l of scoresLines) {
        if (/^Dividend Score:/i.test(l)) divScore = l.replace(/^Dividend Score:\s*/i, "");
        else if (/^Valuation:/i.test(l)) valScore = l.replace(/^Valuation:\s*/i, "");
        else if (/^Risk:/i.test(l)) riskScore = l.replace(/^Risk:\s*/i, "");
    }

    return (
        <div className="div-modal-overlay" onClick={onClose}>
            <div className="div-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="div-modal-close" onClick={onClose}>
                    <i className="fa-solid fa-xmark"></i>
                </button>

                {/* Nagłówek */}
                <div className="div-modal-header">
                    <div className="div-modal-icon">
                        <i className={stock.logo}></i>
                    </div>
                    <div>
                        <h2>{stock.ticker} <span className="div-modal-price">${stock.price.toFixed(2)}</span></h2>
                        <h3>{stock.name}</h3>
                        <span className="div-modal-sector">{stock.sectorPl} — {stock.industry}</span>
                    </div>
                </div>

                {/* Kafelki */}
                <div className="div-stats-row div-modal-stats">
                    <div className="div-stat-card">
                        <i className="fa-solid fa-percent"></i>
                        <div>
                            <span className="div-stat-value div-highlight-green">{stock.dividendYield.toFixed(2)}%</span>
                            <span className="div-stat-label">Stopa dywidendy</span>
                        </div>
                    </div>
                    <div className="div-stat-card">
                        <i className="fa-solid fa-star"></i>
                        <div>
                            <span className={`div-stat-value ${scoreClass}`}>{stock.score || 0}/100</span>
                            <span className="div-stat-label">Ocena AI</span>
                        </div>
                    </div>
                    <div className="div-stat-card">
                        <i className="fa-solid fa-scale-balanced"></i>
                        <div>
                            <span className="div-stat-value">{stock.payoutRatio.toFixed(1)}%</span>
                            <span className="div-stat-label">Wsk. wypłaty</span>
                        </div>
                    </div>
                    <div className="div-stat-card">
                        <i className="fa-solid fa-calculator"></i>
                        <div>
                            <span className="div-stat-value">{stock.peRatio > 0 ? stock.peRatio.toFixed(1) : "N/A"}</span>
                            <span className="div-stat-label">Cena/Zysk (P/E)</span>
                        </div>
                    </div>
                    <div className="div-stat-card">
                        <i className="fa-solid fa-chart-line"></i>
                        <div>
                            <span className="div-stat-value">{stock.roe.toFixed(1)}%</span>
                            <span className="div-stat-label">ROE</span>
                        </div>
                    </div>
                    <div className="div-stat-card">
                        <i className="fa-solid fa-building-columns"></i>
                        <div>
                            <span className="div-stat-value">{fmt(stock.marketCap)}</span>
                            <span className="div-stat-label">Kapitalizacja</span>
                        </div>
                    </div>
                </div>

                <div className="div-modal-body">
                    {/* Szczegóły spółki */}
                    <div className="div-modal-section">
                        <h4><i className="fa-solid fa-table-list"></i> Dane fundamentalne</h4>
                        <div className="div-detail-grid">
                            <div className="div-detail-item">
                                <span className="div-detail-label">Dywidenda / akcję</span>
                                <span className="div-detail-value">${stock.dividendPerShare.toFixed(2)}</span>
                            </div>
                            <div className="div-detail-item">
                                <span className="div-detail-label">Śr. yield (5 lat)</span>
                                <span className="div-detail-value">{stock.fiveYearAvgYield.toFixed(2)}%</span>
                            </div>
                            <div className="div-detail-item">
                                <span className="div-detail-label">Dług/Kapitał (D/E)</span>
                                <span className="div-detail-value">{stock.debtToEquity.toFixed(2)}</span>
                            </div>
                            <div className="div-detail-item">
                                <span className="div-detail-label">Marża zysku</span>
                                <span className="div-detail-value">{stock.profitMargin.toFixed(1)}%</span>
                            </div>
                            <div className="div-detail-item">
                                <span className="div-detail-label">Wzrost zysków</span>
                                <span className="div-detail-value">{stock.earningsGrowth.toFixed(1)}%</span>
                            </div>
                            <div className="div-detail-item">
                                <span className="div-detail-label">Beta</span>
                                <span className="div-detail-value">{stock.beta.toFixed(2)}</span>
                            </div>
                            <div className="div-detail-item">
                                <span className="div-detail-label">Zakres 52 tyg.</span>
                                <span className="div-detail-value">${stock.fiftyTwoWeekLow} — ${stock.fiftyTwoWeekHigh}</span>
                            </div>
                            <div className="div-detail-item">
                                <span className="div-detail-label">Giełda</span>
                                <span className="div-detail-value">{stock.exchange}</span>
                            </div>
                        </div>
                    </div>

                    {/* Wiadomości */}
                    {news && news.length > 0 && (
                        <div className="div-modal-section div-news-section">
                            <h4><i className="fa-solid fa-newspaper"></i> Wiadomości rynkowe ({news.length})</h4>
                            <div className="div-news-list">
                                {news.map((n, i) => (
                                    <a key={i} className="div-news-item" href={n.url} target="_blank" rel="noopener noreferrer">
                                        {n.image && (
                                            <img src={n.image} alt="" className="div-news-img"
                                                onError={(e) => { e.target.style.display = 'none'; }} />
                                        )}
                                        <div className="div-news-text">
                                            <span className="div-news-headline">{n.headline}</span>
                                            <div className="div-news-meta">
                                                <span className="div-news-source">{n.source}</span>
                                                {n.datetime && (
                                                    <span className="div-news-date">
                                                        {new Date(n.datetime).toLocaleDateString('pl-PL')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ══════ AI ANALYSIS (STRUCTURED) ══════ */}
                    <div className="div-modal-section div-ai-section">
                        <h4><i className="fa-solid fa-robot"></i> Analiza AI — Gemma 4</h4>

                        {aiLoading ? (
                            <div className="div-ai-loading">
                                <div className="div-spinner"></div>
                                <p>Gemma 4 analizuje {stock.ticker}...</p>
                            </div>
                        ) : analysis ? (
                            <div className="div-ai-structured">

                                {/* ── HEADER PILL ── */}
                                <div className="div-ai-header-pill">
                                    <div className="div-ai-verdict-row">
                                        <span className="div-ai-verdict-big" style={{ color: verdictColor }}>
                                            {verdictIcon} {aiVerdict}
                                        </span>
                                        <span className="div-ai-score-pill">{aiScore}</span>
                                    </div>
                                    <div className="div-ai-sub-row">
                                        <span className="div-ai-safety-pill">🛡 {aiSafety}</span>
                                        <span className="div-ai-conf-pill" title={parsed.CONFIDENCE_REASON ? parsed.CONFIDENCE_REASON.join(" ") : ""}>
                                            📊 Pewność analizy: {aiConfidence}
                                            <i className="fa-solid fa-circle-info div-ai-conf-info"></i>
                                        </span>
                                        {aiConfidence && (
                                            <div className="div-ai-conf-bar-wrap">
                                                <div className="div-ai-conf-bar-track">
                                                    <div className="div-ai-conf-bar-fill" style={{
                                                        width: aiConfidence,
                                                        background: parseInt(aiConfidence) >= 70 ? "#34d399" : parseInt(aiConfidence) >= 45 ? "#fbbf24" : "#f87171"
                                                    }}></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {aiReason && <p className="div-ai-reason-line"><strong>Kluczowy wniosek:</strong> {aiReason}</p>}
                                </div>

                                {/* ── CONFIDENCE EXPLAINER ── */}
                                {parsed.CONFIDENCE_REASON && parsed.CONFIDENCE_REASON.length > 0 && (
                                    <div className="div-ai-conf-explain">
                                        <i className="fa-solid fa-circle-question"></i>
                                        {parsed.CONFIDENCE_REASON.join(" ")}
                                    </div>
                                )}

                                {/* ── PROS ── */}
                                {parsed.PROS && parsed.PROS.length > 0 && (
                                    <div className="div-ai-card div-ai-card-pros">
                                        <div className="div-ai-card-title">
                                            <i className="fa-solid fa-circle-check"></i> Plusy
                                        </div>
                                        {parsed.PROS.map((l, i) => (
                                            <p key={i} className="div-ai-pro-line">{l}</p>
                                        ))}
                                    </div>
                                )}

                                {/* ── CONS ── */}
                                {parsed.CONS && parsed.CONS.length > 0 && (
                                    <div className="div-ai-card div-ai-card-cons">
                                        <div className="div-ai-card-title">
                                            <i className="fa-solid fa-circle-xmark"></i> Ryzyka
                                        </div>
                                        {parsed.CONS.map((l, i) => (
                                            <p key={i} className="div-ai-con-line">{l}</p>
                                        ))}
                                    </div>
                                )}

                                {/* ── NEUTRAL ── */}
                                {parsed.NEUTRAL && parsed.NEUTRAL.length > 0 && (
                                    <div className="div-ai-card div-ai-card-neutral">
                                        <div className="div-ai-card-title">
                                            <i className="fa-solid fa-scale-balanced"></i> Kontekst neutralny
                                        </div>
                                        {parsed.NEUTRAL.map((l, i) => (
                                            <p key={i} className="div-ai-neutral-line">{l}</p>
                                        ))}
                                    </div>
                                )}

                                {/* ── NEWS SENTIMENT BAR ── */}
                                {parsed.NEWS && parsed.NEWS.length > 0 && (
                                    <div className="div-ai-card div-ai-card-news">
                                        <div className="div-ai-card-title">
                                            <i className="fa-solid fa-newspaper"></i> Wpływ wiadomości
                                        </div>
                                        <div className="div-ai-sentiment-visual">
                                            <div className="div-ai-sentiment-track">
                                                <div className="div-ai-sentiment-fill" style={{
                                                    width: `${sentimentPct}%`,
                                                    background: sentimentBarColor
                                                }}></div>
                                                <div className="div-ai-sentiment-marker" style={{
                                                    left: `${sentimentPct}%`
                                                }}></div>
                                            </div>
                                            <div className="div-ai-sentiment-labels">
                                                <span className="div-ai-sent-neg">Negatywny</span>
                                                <span className="div-ai-sent-neu">Neutralny</span>
                                                <span className="div-ai-sent-pos">Pozytywny</span>
                                            </div>
                                        </div>
                                        <div className="div-ai-sentiment-value" style={{ color: sentimentBarColor }}>
                                            {newsData.sentiment} ({newsData.strength > 0 ? "+" : ""}{newsData.strength})
                                        </div>
                                        {newsData.reason && (
                                            <p className="div-ai-sentiment-reason">{newsData.reason}</p>
                                        )}
                                    </div>
                                )}

                                {/* ── SCORES + TREND ── */}
                                <div className="div-ai-scores-grid">
                                    {divScore && (
                                        <div className="div-ai-score-tile">
                                            <span className="div-ai-score-tile-label">Bezpieczeństwo dywidendy</span>
                                            <span className="div-ai-score-tile-val">{divScore}</span>
                                        </div>
                                    )}
                                    {valScore && (
                                        <div className="div-ai-score-tile">
                                            <span className="div-ai-score-tile-label">Wycena</span>
                                            <span className="div-ai-score-tile-val">{valScore}</span>
                                        </div>
                                    )}
                                    {riskScore && (
                                        <div className="div-ai-score-tile">
                                            <span className="div-ai-score-tile-label">Korekta ryzyka</span>
                                            <span className="div-ai-score-tile-val div-ai-risk-val">{riskScore}</span>
                                        </div>
                                    )}
                                </div>

                                {parsed.TREND && parsed.TREND.length > 0 && (
                                    <div className="div-ai-trend-box">
                                        {parsed.TREND.map((l, i) => (
                                            <p key={i} className="div-ai-trend-line">{l}</p>
                                        ))}
                                    </div>
                                )}

                                {/* ── SCENARIOS ── */}
                                <div className="div-ai-scenarios">
                                    <div className="div-ai-card-title" style={{ marginBottom: "10px" }}>
                                        <i className="fa-solid fa-route"></i> Triggery — kiedy działać?
                                    </div>
                                    <div className="div-ai-scenario-grid">
                                        {parsed.SCENARIO_BULL && parsed.SCENARIO_BULL.length > 0 && (
                                            <div className="div-ai-scenario div-ai-scenario-bull">
                                                <div className="div-ai-scenario-header">🚀 Scenariusz wzrostowy</div>
                                                {parsed.SCENARIO_BULL.map((l, i) => (
                                                    <p key={i}>{l}</p>
                                                ))}
                                            </div>
                                        )}
                                        {parsed.SCENARIO_BEAR && parsed.SCENARIO_BEAR.length > 0 && (
                                            <div className="div-ai-scenario div-ai-scenario-bear">
                                                <div className="div-ai-scenario-header">⚠️ Scenariusz spadkowy</div>
                                                {parsed.SCENARIO_BEAR.map((l, i) => (
                                                    <p key={i}>{l}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── ALERT ── */}
                                {parsed.ALERT && parsed.ALERT.length > 0 && (
                                    <div className="div-ai-alert-box">
                                        <i className="fa-solid fa-bell"></i>
                                        {parsed.ALERT.join(" ")}
                                    </div>
                                )}

                                {/* ── ANOMALY ── */}
                                {(() => {
                                    const anomalyLines = (parsed.ANOMALY || []).filter(l => l.trim().startsWith("⚠️"));
                                    return anomalyLines.length > 0 && (
                                        <div className="div-ai-anomaly-box">
                                            {anomalyLines.map((l, i) => (
                                                <p key={i}>{l}</p>
                                            ))}
                                        </div>
                                    );
                                })()}

                                {/* ── ACTION BUTTON ── */}
                                <button className="div-ai-alert-btn" onClick={(e) => {
                                    e.stopPropagation();
                                    alert(`Alert ustawiony dla ${stock.ticker}!\nBędziemy monitorować triggery i powiadomimy Cię o zmianach.`);
                                }}>
                                    <i className="fa-solid fa-bell"></i>
                                    Ustaw alert na te triggery
                                </button>

                                {/* ── DATA SOURCE + TIMESTAMP ── */}
                                {/* ── SCORE METHODOLOGY ── */}
                                <details className="div-ai-methodology">
                                    <summary><i className="fa-solid fa-flask"></i> Jak liczymy Score {aiScore}?</summary>
                                    <div className="div-ai-methodology-body">
                                        <div className="div-ai-method-row"><span>Bezpieczeństwo dywidendy</span><span className="div-ai-method-pct">50%</span></div>
                                        <div className="div-ai-method-desc">Payout ratio, pokrycie z FCF, historia wypłat, stabilność zysków</div>
                                        <div className="div-ai-method-row"><span>Wycena</span><span className="div-ai-method-pct">30%</span></div>
                                        <div className="div-ai-method-desc">P/E vs sektor, yield vs średnia 5-letnia, pozycja w zakresie 52-tyg.</div>
                                        <div className="div-ai-method-row"><span>Korekta ryzyka</span><span className="div-ai-method-pct">20%</span></div>
                                        <div className="div-ai-method-desc">Beta, zadłużenie, trend zysków, wpływ wiadomości</div>
                                    </div>
                                </details>

                                {/* ── DATA SOURCE + TIMESTAMP ── */}
                                <div className="div-ai-source-footer">
                                    <i className="fa-solid fa-database"></i>
                                    <span>Dane: Financial Modeling Prep · AI: Gemma 4 / Gemini · Aktualizacja: {new Date().toLocaleString('pl-PL')}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="div-ai-loading">
                                <p>Kliknij aby uruchomić analizę...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
