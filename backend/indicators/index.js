export function calculateRSI(history, periods = 14) {
    if (history.length < periods + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= periods; i++) {
        let diff = history[i].c - history[i - 1].c;
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / periods, avgLoss = losses / periods;
    for (let i = periods + 1; i < history.length; i++) {
        let diff = history[i].c - history[i - 1].c;
        avgGain = (avgGain * (periods - 1) + (diff >= 0 ? diff : 0)) / periods;
        avgLoss = (avgLoss * (periods - 1) + (diff < 0 ? -diff : 0)) / periods;
    }
    return avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
}

export function getSMA(history, periods) {
    if (history.length < periods) return history[history.length - 1]?.c || 0;
    return history.slice(-periods).reduce((sum, h) => sum + h.c, 0) / periods;
}

export function calculateEMA(history, periods) {
    if (history.length < periods) return history[history.length - 1]?.c || 0;
    const k = 2 / (periods + 1);
    let ema = history.slice(0, periods).reduce((s, h) => s + h.c, 0) / periods;
    for (let i = periods; i < history.length; i++) ema = history[i].c * k + ema * (1 - k);
    return ema;
}

export function calculateEMASeries(history, periods) {
    if (history.length < periods) return [];
    const k = 2 / (periods + 1);
    const result = new Array(periods - 1).fill(null);
    let ema = history.slice(0, periods).reduce((s, h) => s + h.c, 0) / periods;
    result.push(ema);
    for (let i = periods; i < history.length; i++) {
        ema = history[i].c * k + ema * (1 - k);
        result.push(ema);
    }
    return result;
}

export function calculateMACD(history, fast = 12, slow = 26, signal = 9) {
    const empty = { macd: 0, signal: 0, histogram: 0, macdSeries: [], signalSeries: [], histSeries: [] };
    if (history.length < slow + signal) return empty;
    const emaFastSeries = calculateEMASeries(history, fast);
    const emaSlowSeries = calculateEMASeries(history, slow);
    const macdLine = history.map((_, i) =>
        emaFastSeries[i] !== null && emaSlowSeries[i] !== null ? emaFastSeries[i] - emaSlowSeries[i] : null
    );
    const validMacd = macdLine.filter(v => v !== null);
    if (validMacd.length < signal) return empty;
    const k = 2 / (signal + 1);
    let sig = validMacd.slice(0, signal).reduce((s, v) => s + v, 0) / signal;
    const signalSeries = [];
    let sigIdx = 0;
    for (let i = 0; i < macdLine.length; i++) {
        if (macdLine[i] === null) { signalSeries.push(null); continue; }
        if (sigIdx < signal) { signalSeries.push(null); sigIdx++; continue; }
        sig = macdLine[i] * k + sig * (1 - k);
        signalSeries.push(+sig.toFixed(4));
    }
    const histSeries = macdLine.map((v, i) =>
        v !== null && signalSeries[i] !== null ? +(v - signalSeries[i]).toFixed(4) : null
    );
    const lastMacd = macdLine[macdLine.length - 1] ?? 0;
    const lastSig  = signalSeries[signalSeries.length - 1] ?? 0;
    return { macd: lastMacd, signal: lastSig, histogram: lastMacd - lastSig, macdSeries: macdLine, signalSeries, histSeries };
}

export function calculateBollingerBands(history, periods = 20, multiplier = 2) {
    if (history.length < periods) return { upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 0, series: [] };
    const series = [];
    for (let i = 0; i < history.length; i++) {
        if (i < periods - 1) { series.push({ t: history[i].t, upper: null, middle: null, lower: null }); continue; }
        const slice = history.slice(i - periods + 1, i + 1);
        const sma = slice.reduce((s, h) => s + h.c, 0) / periods;
        const stdDev = Math.sqrt(slice.reduce((s, h) => s + Math.pow(h.c - sma, 2), 0) / periods);
        series.push({ t: history[i].t, upper: sma + multiplier * stdDev, middle: sma, lower: sma - multiplier * stdDev });
    }
    const last = series[series.length - 1];
    const lastC = history[history.length - 1].c;
    const bandwidth = last.upper && last.lower ? ((last.upper - last.lower) / last.middle) * 100 : 0;
    const percentB  = last.upper && last.lower ? ((lastC - last.lower) / (last.upper - last.lower)) * 100 : 50;
    return { upper: last.upper, middle: last.middle, lower: last.lower, bandwidth, percentB, series };
}

export function calculateATR(history, periods = 14) {
    if (history.length < 2) return 0;
    const trValues = [];
    for (let i = 1; i < history.length; i++) {
        const high = history[i].h || history[i].c;
        const low  = history[i].l || history[i].c;
        const prev = history[i - 1].c;
        trValues.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)));
    }
    if (trValues.length < periods) return trValues.reduce((s, v) => s + v, 0) / trValues.length;
    let atr = trValues.slice(0, periods).reduce((s, v) => s + v, 0) / periods;
    for (let i = periods; i < trValues.length; i++) atr = (atr * (periods - 1) + trValues[i]) / periods;
    return atr;
}

export function calculateADX(history, periods = 14) {
    if (history.length < periods * 2) return { adx: 0, plusDI: 0, minusDI: 0, trend: 'BRAK DANYCH' };
    const trValues = [], plusDM = [], minusDM = [];
    for (let i = 1; i < history.length; i++) {
        const high = history[i].h || history[i].c, low = history[i].l || history[i].c;
        const prevHigh = history[i-1].h || history[i-1].c, prevLow = history[i-1].l || history[i-1].c;
        const prevClose = history[i-1].c;
        trValues.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        const upMove = high - prevHigh, downMove = prevLow - low;
        plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    let smoothTR = trValues.slice(0, periods).reduce((s, v) => s + v, 0);
    let smoothPlus = plusDM.slice(0, periods).reduce((s, v) => s + v, 0);
    let smoothMinus = minusDM.slice(0, periods).reduce((s, v) => s + v, 0);
    const dxValues = [];
    for (let i = periods; i < trValues.length; i++) {
        smoothTR = smoothTR - smoothTR / periods + trValues[i];
        smoothPlus = smoothPlus - smoothPlus / periods + plusDM[i];
        smoothMinus = smoothMinus - smoothMinus / periods + minusDM[i];
        const pDI = smoothTR > 0 ? (smoothPlus / smoothTR) * 100 : 0;
        const mDI = smoothTR > 0 ? (smoothMinus / smoothTR) * 100 : 0;
        dxValues.push({ dx: (pDI + mDI) > 0 ? (Math.abs(pDI - mDI) / (pDI + mDI)) * 100 : 0, pDI, mDI });
    }
    if (dxValues.length < periods) return { adx: 0, plusDI: 0, minusDI: 0, trend: 'BRAK DANYCH' };
    let adx = dxValues.slice(0, periods).reduce((s, v) => s + v.dx, 0) / periods;
    let lastPDI = 0, lastMDI = 0;
    for (let i = periods; i < dxValues.length; i++) {
        adx = (adx * (periods - 1) + dxValues[i].dx) / periods;
        lastPDI = dxValues[i].pDI; lastMDI = dxValues[i].mDI;
    }
    const strength = adx >= 40 ? 'BARDZO SILNY' : adx >= 25 ? 'SILNY' : adx >= 20 ? 'UMIARKOWANY' : 'SŁABY / BOCZNY';
    return { adx: Math.round(adx), plusDI: Math.round(lastPDI), minusDI: Math.round(lastMDI), trend: `${strength} ${lastPDI > lastMDI ? 'WZROSTOWY' : 'SPADKOWY'}` };
}

export function calculateStochRSI(history, periods = 14, smooth = 3) {
    if (history.length < periods * 2) return { k: 50, d: 50, signal: 'NEUTRALNY' };
    const closes = history.map(h => h.c);
    let gains = 0, losses = 0;
    for (let i = 1; i <= periods; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) gains += d; else losses -= d;
    }
    let avgGain = gains / periods, avgLoss = losses / periods;
    const rsiValues = [avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)];
    for (let i = periods + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        avgGain = (avgGain * (periods - 1) + (d > 0 ? d : 0)) / periods;
        avgLoss = (avgLoss * (periods - 1) + (d < 0 ? -d : 0)) / periods;
        rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    if (rsiValues.length < periods) return { k: 50, d: 50, signal: 'NEUTRALNY' };
    const stochValues = [];
    for (let i = periods - 1; i < rsiValues.length; i++) {
        const win = rsiValues.slice(i - periods + 1, i + 1);
        const lo = Math.min(...win), hi = Math.max(...win);
        stochValues.push(hi === lo ? 50 : ((rsiValues[i] - lo) / (hi - lo)) * 100);
    }
    const sma = (arr, i) => arr.slice(i - smooth + 1, i + 1).reduce((s, v) => s + v, 0) / smooth;
    const kValues = [], dValues = [];
    for (let i = smooth - 1; i < stochValues.length; i++) kValues.push(sma(stochValues, i));
    for (let i = smooth - 1; i < kValues.length; i++) dValues.push(sma(kValues, i));
    const k = kValues[kValues.length - 1] ?? 50;
    const d = dValues[dValues.length - 1] ?? 50;
    let signal = 'NEUTRALNY';
    if (k > 80 && d > 80) signal = 'WYKUPIONY';
    else if (k < 20 && d < 20) signal = 'WYPRZEDANY';
    else if (k > d && k < 50) signal = 'BULLISH CROSSOVER';
    else if (k < d && k > 50) signal = 'BEARISH CROSSOVER';
    return { k: Math.round(k), d: Math.round(d), signal };
}

export function calculateOBV(history) {
    if (history.length < 2) return { value: 0, trend: 'NEUTRALNY' };
    let obv = 0;
    const obvSeries = [0];
    for (let i = 1; i < history.length; i++) {
        if (history[i].c > history[i-1].c) obv += (history[i].v || 0);
        else if (history[i].c < history[i-1].c) obv -= (history[i].v || 0);
        obvSeries.push(obv);
    }
    const last20 = obvSeries.slice(-20);
    const slope = last20[last20.length - 1] - last20[0];
    return { value: obv, trend: slope > 0 ? 'ROSNACY (akumulacja)' : slope < 0 ? 'SPADAJACY (dystrybucja)' : 'NEUTRALNY' };
}

export function calculatePivotPoints(history) {
    if (history.length < 5) return null;
    const week = history.slice(-5);
    const H = Math.max(...week.map(h => h.h || h.c));
    const L = Math.min(...week.map(h => h.l || h.c));
    const C = week[week.length - 1].c;
    const P = (H + L + C) / 3;
    return { P: +P.toFixed(2), R1: +(2*P-L).toFixed(2), R2: +(P+(H-L)).toFixed(2), S1: +(2*P-H).toFixed(2), S2: +(P-(H-L)).toFixed(2) };
}

export function calculateFibonacci(high, low) {
    const range = high - low;
    return {
        fib_236: +(high - 0.236 * range).toFixed(2),
        fib_382: +(high - 0.382 * range).toFixed(2),
        fib_500: +(high - 0.500 * range).toFixed(2),
        fib_618: +(high - 0.618 * range).toFixed(2),
        fib_786: +(high - 0.786 * range).toFixed(2),
    };
}
