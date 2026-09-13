/**
 * Dividend analysis utilities — computes safety, verdict, and reason from stock data.
 * Uses the same scoring model as the AI backend.
 */

export function getDividendSafety(stock) {
    let safety = 10;

    // Payout ratio — wyższe = bardziej ryzykowne
    if (stock.payoutRatio > 90) safety -= 4;
    else if (stock.payoutRatio > 75) safety -= 2;
    else if (stock.payoutRatio > 60) safety -= 1;

    // ROE — ujemne lub zerowe = niebezpiecznie
    if (stock.roe < 0) safety -= 3;
    else if (stock.roe < 5) safety -= 1;

    // Debt/Equity — brak danych lub ekstremalny
    if (stock.debtToEquity === 0 && stock.roe > 0) safety -= 1; // anomalia
    if (stock.debtToEquity > 200) safety -= 2;
    else if (stock.debtToEquity > 100) safety -= 1;

    // Earnings growth — spadający
    if (stock.earningsGrowth < -10) safety -= 2;
    else if (stock.earningsGrowth < 0) safety -= 1;

    // Beta — wysoka zmienność
    if (stock.beta > 1.5) safety -= 1;

    // Free cash flow coverage
    if (stock.freeCashflow > 0 && stock.marketCap > 0) {
        const fcfYield = (stock.freeCashflow / stock.marketCap) * 100;
        if (fcfYield < stock.dividendYield) safety -= 2; // FCF nie pokrywa dywidendy
    }

    return Math.max(0, Math.min(10, safety));
}

export function getValuationScore(stock) {
    let val = 5;

    // Yield vs 5Y avg
    if (stock.fiveYearAvgYield > 0) {
        const ratio = stock.dividendYield / stock.fiveYearAvgYield;
        if (ratio > 1.2) val += 3;       // dużo powyżej historycznej
        else if (ratio > 1.05) val += 1;  // trochę powyżej
        else if (ratio < 0.8) val -= 2;   // poniżej historycznej
        else if (ratio < 0.95) val -= 1;
    }

    // P/E — niższe = tańsza
    if (stock.peRatio > 0) {
        if (stock.peRatio < 12) val += 2;
        else if (stock.peRatio < 18) val += 1;
        else if (stock.peRatio > 30) val -= 2;
        else if (stock.peRatio > 25) val -= 1;
    }

    return Math.max(0, Math.min(10, val));
}

export function getRiskScore(stock) {
    let risk = 0;

    if (stock.beta > 1.3) risk -= 1;
    if (stock.beta > 1.6) risk -= 1;
    if (stock.debtToEquity > 150) risk -= 1;
    if (stock.debtToEquity === 0 && stock.roe !== 0) risk -= 0.5; // anomalia danych
    if (stock.earningsGrowth < -15) risk -= 1;
    if (stock.payoutRatio > 85) risk -= 1;
    if (stock.roe < 0) risk -= 1;

    return Math.max(-5, Math.min(0, risk));
}

export function computeFinalScore(stock) {
    const div = getDividendSafety(stock);
    const val = getValuationScore(stock);
    const risk = getRiskScore(stock);
    return parseFloat(((div * 0.5) + (val * 0.3) + ((10 + risk) * 0.2)).toFixed(1));
}

export function getVerdict(score) {
    if (score >= 8.0) return "KUPUJ";
    if (score >= 6.0) return "TRZYMAJ";
    return "UNIKAJ";
}

export function getVerdictEmoji(verdict) {
    if (verdict === "KUPUJ") return "✅";
    if (verdict === "TRZYMAJ") return "⚠️";
    return "❌";
}

export function getSafetyLabel(safetyScore) {
    if (safetyScore >= 8) return "Bardzo bezpieczna";
    if (safetyScore >= 5) return "Bezpieczna";
    return "Ryzykowna";
}

export function getSafetyClass(label) {
    if (label === "Bardzo bezpieczna") return "div-safety-very-safe";
    if (label === "Bezpieczna") return "div-safety-safe";
    return "div-safety-risky";
}

export function getRiskReason(stock) {
    const reasons = [];
    if (stock.payoutRatio > 85) reasons.push(`payout ratio ${stock.payoutRatio.toFixed(0)}%`);
    if (stock.debtToEquity > 150) reasons.push(`zadłużenie D/E ${stock.debtToEquity.toFixed(0)}`);
    if (stock.roe < 0) reasons.push(`ujemne ROE ${stock.roe.toFixed(1)}%`);
    if (stock.beta > 1.5) reasons.push(`beta ${stock.beta.toFixed(2)} (wysoka zmienność)`);
    if (stock.earningsGrowth < -10) reasons.push(`zyski -${Math.abs(stock.earningsGrowth).toFixed(0)}% r/r`);
    return reasons.length > 0 ? `Ryzyko: ${reasons.slice(0, 2).join(", ")}.` : null;
}

export function getVerdictClass(verdict) {
    if (verdict === "KUPUJ") return "div-verdict-buy";
    if (verdict === "TRZYMAJ") return "div-verdict-hold";
    return "div-verdict-avoid";
}

export function getReason(stock, safety, valuation) {
    const reasons = [];

    // Safety — with concrete number
    if (safety >= 8) reasons.push(`wsk. wypłaty ${stock.payoutRatio.toFixed(0)}% — dywidenda bezpieczna`);
    else if (safety >= 5) reasons.push(`wsk. wypłaty ${stock.payoutRatio.toFixed(0)}% — umiarkowane pokrycie`);
    else reasons.push(`wsk. wypłaty ${stock.payoutRatio.toFixed(0)}% — zagrożona`);

    // Valuation — with P/E or yield context
    if (valuation >= 7 && stock.peRatio > 0) reasons.push(`P/E ${stock.peRatio.toFixed(1)} — tanio`);
    else if (valuation >= 5) reasons.push("wycena neutralna");
    else if (stock.peRatio > 0) reasons.push(`P/E ${stock.peRatio.toFixed(1)} — drogo`);

    // Risk modifiers — concrete
    if (stock.roe < 0) reasons.push(`ROE ${stock.roe.toFixed(1)}%`);
    if (stock.earningsGrowth > 10) reasons.push(`zyski +${stock.earningsGrowth.toFixed(0)}% r/r`);
    if (stock.earningsGrowth < -10) reasons.push(`zyski ${stock.earningsGrowth.toFixed(0)}% r/r`);
    if (stock.debtToEquity > 150) reasons.push(`D/E ${stock.debtToEquity.toFixed(0)}`);

    return reasons.slice(0, 3).join(" · ");
}

export function getYieldContext(stock) {
    if (!stock.fiveYearAvgYield || stock.fiveYearAvgYield === 0) return null;
    const ratio = stock.dividendYield / stock.fiveYearAvgYield;
    if (ratio > 1.15) return "atrakcyjny punkt wejścia";
    if (ratio < 0.85) return "drogi vs historia";
    return "neutralny";
}

export function getTrendArrow(stock) {
    const fcf = stock.freeCashflow > 0 ? (stock.earningsGrowth > 5 ? "↑" : stock.earningsGrowth < -5 ? "↓" : "→") : "↓";
    const div = stock.payoutRatio < 60 ? "↑" : stock.payoutRatio > 80 ? "↓" : "→";
    return { fcf, div };
}

export function enrichStock(stock) {
    const safety = getDividendSafety(stock);
    const valuation = getValuationScore(stock);
    const risk = getRiskScore(stock);
    const finalScore = computeFinalScore(stock);
    const verdict = getVerdict(finalScore);
    const safetyLabel = getSafetyLabel(safety);
    const reason = getReason(stock, safety, valuation, risk);
    const riskReason = getRiskReason(stock);
    const yieldContext = getYieldContext(stock);
    const trends = getTrendArrow(stock);
    return {
        ...stock,
        divScore: safety,
        valScore: valuation,
        riskScore: risk,
        finalScore,
        verdict,
        safetyLabel,
        reason,
        riskReason,
        yieldContext,
        trends,
    };
}
