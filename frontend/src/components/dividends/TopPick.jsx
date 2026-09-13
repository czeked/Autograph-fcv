import { getVerdictEmoji } from "./dividendUtils";

function generateAiReason(stock) {
    const parts = [];
    if (stock.divScore >= 8) parts.push("wyj\u0105tkowo stabilny cash flow zabezpieczaj\u0105cy dywidend\u0119");
    else if (stock.divScore >= 6) parts.push("solidne pokrycie dywidendy z wolnych przep\u0142yw\u00f3w");
    else parts.push("ograniczone pokrycie dywidendy z FCF");

    if (stock.valScore >= 7) parts.push("przy historycznie niskiej wycenie P/E");
    else if (stock.valScore <= 4) parts.push("mimo podwy\u017cszonej wyceny wzgl\u0119dem historii");

    if (stock.payoutRatio < 50) parts.push("z konserwatywnym payout ratio " + stock.payoutRatio.toFixed(0) + "%");
    if (stock.earningsGrowth > 10) parts.push("i rosn\u0105cymi zyskami +" + stock.earningsGrowth.toFixed(0) + "% r/r");

    return stock.ticker + " wykazuje " + parts.slice(0, 2).join(" ") + ".";
}

export default function TopPick({ stocks, onAnalyze }) {
    if (!stocks || stocks.length === 0) return null;

    const top3 = [...stocks]
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 3);

    const best = top3[0];
    const aiReason = generateAiReason(best);

    return (
        <div className="div-top-pick">
            {/* Main pick */}
            <div className="div-top-pick-main" onClick={() => onAnalyze(best)}>
                <div className="div-top-pick-label">🏆 Rekomendacja dnia</div>
                <div className="div-top-pick-hero">
                    <div className="div-top-pick-ticker">
                        {best.ticker}
                        <span className="div-top-pick-verdict">{getVerdictEmoji(best.verdict)} {best.verdict}</span>
                    </div>
                    <div className="div-top-pick-yield">{best.dividendYield.toFixed(2)}%</div>
                </div>

                {/* AI-generated reason — key differentiator */}
                <div className="div-top-pick-ai-reason">
                    <i className="fa-solid fa-brain"></i>
                    <span>{aiReason}</span>
                </div>

                <div className="div-top-pick-stats">
                    <span title="Ocena og\u00f3lna (50% bezp. dywidendy + 30% wycena + 20% ryzyko)">
                        ⭐ {best.finalScore}/10 <i className="fa-solid fa-circle-info div-tp-info"></i>
                    </span>
                    <span>🛡 {best.safetyLabel}</span>
                    <span className="div-top-pick-safety-score" title="Dividend Safety Score — ocena ryzyka ci\u0119cia dywidendy">
                        Bezpiecze\u0144stwo: {best.divScore}/10
                    </span>
                    <span className="div-top-pick-cta">Analizuj AI →</span>
                </div>
            </div>

            {/* Runners-up */}
            <div className="div-top-pick-runners">
                <div className="div-runners-label">Kolejne rekomendacje</div>
                {top3.slice(1).map((s) => (
                    <div
                        key={s.ticker}
                        className="div-top-pick-runner"
                        onClick={() => onAnalyze(s)}
                    >
                        <span className="div-runner-emoji">{getVerdictEmoji(s.verdict)}</span>
                        <div className="div-runner-info">
                            <span className="div-runner-ticker">{s.ticker}</span>
                            <span className="div-runner-reason">{s.reason}</span>
                        </div>
                        <div className="div-runner-score">{s.finalScore}/10</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
