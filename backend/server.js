import 'dotenv/config';
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
import axios from 'axios';
import { calculateRSI, getSMA, calculateEMA, calculateEMASeries, calculateMACD, calculateBollingerBands, calculateATR, calculateADX, calculateStochRSI, calculateOBV, calculatePivotPoints, calculateFibonacci } from './indicators/index.js';
import { AI_RESPONSE_SCHEMA } from './config/aiSchema.js';

// --- CACHE ---
const analysisCache = new Map();
const dayAnalysisCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 2; // 2h
const DAY_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

// --- RATE LIMITER ---
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 1000 * 60 * 60; // 1h

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

// Indicator functions imported from ./indicators/index.js


function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { count: 1, windowStart: now });
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }
    if (entry.count >= RATE_LIMIT_MAX) {
        const resetIn = Math.ceil((RATE_LIMIT_WINDOW - (now - entry.windowStart)) / 1000 / 60);
        return { allowed: false, remaining: 0, resetIn };
    }
    entry.count++;
    return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

setInterval(() => {
    const now = Date.now();
    for (const [key, val] of analysisCache.entries()) if (now - val.timestamp > CACHE_TTL) analysisCache.delete(key);
    for (const [key, val] of dayAnalysisCache.entries()) if (now - val.timestamp > DAY_CACHE_TTL) dayAnalysisCache.delete(key);
    for (const [ip, val] of rateLimitMap.entries()) if (now - val.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(ip);
}, 1000 * 60 * 30);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'Brak_GEMINI_API_KEY');

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const MASSIVE_KEY = process.env.MASSIVE_API_KEY;

export function setupStockRoutes(app) {

app.get('/api/stock/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
        const response = await axios.get(`https://finnhub.io/api/v1/search?q=${q.toUpperCase()}&token=${FINNHUB_KEY}`);
        res.json((response.data.result || []).map(i => ({ ticker: i.symbol, name: i.description })).slice(0, 8));
    } catch (e) { res.json([]); }
});

function detectMarketStructure(history, n = 5) {
    if (!history || history.length < n * 3) return { structure: 'BRAK DANYCH', high_pattern: null, low_pattern: null };
    const highs = history.map(h => h.h || h.c);
    const lows  = history.map(h => h.l || h.c);
    const pivotHighs = [], pivotLows = [];
    for (let i = n; i < history.length - n; i++) {
        let isH = true, isL = true;
        for (let j = i - n; j <= i + n; j++) {
            if (j === i) continue;
            if (highs[j] >= highs[i]) isH = false;
            if (lows[j]  <= lows[i])  isL = false;
        }
        if (isH) pivotHighs.push(highs[i]);
        if (isL) pivotLows.push(lows[i]);
    }
    if (pivotHighs.length < 2 || pivotLows.length < 2)
        return { structure: 'NIEOKREŚLONA', high_pattern: null, low_pattern: null };
    const pH = pivotHighs.slice(-3), pL = pivotLows.slice(-3);
    const highTrend = pH[pH.length - 1] > pH[0] ? 'HH' : 'LH';
    const lowTrend  = pL[pL.length - 1] > pL[0] ? 'HL' : 'LL';
    let structure;
    if      (highTrend === 'HH' && lowTrend === 'HL') structure = 'TREND WZROSTOWY';
    else if (highTrend === 'LH' && lowTrend === 'LL') structure = 'TREND SPADKOWY';
    else if (highTrend === 'LH' && lowTrend === 'HL') structure = 'KONSOLIDACJA';
    else                                               structure = 'WYBICIE';
    return { structure, high_pattern: highTrend, low_pattern: lowTrend,
             last_pivot_high: +pH[pH.length - 1].toFixed(2),
             last_pivot_low:  +pL[pL.length - 1].toFixed(2) };
}

app.post('/api/stock/analyze', async (req, res) => {
    const { ticker, timeframe = '1Y', entryPrice, stopLoss } = req.body;
    const reqStart = Date.now();

    // Walidacja symbolu
    const symbol = (ticker || '').toUpperCase().trim().replace(/[^A-Z0-9.]/g, '');
    if (!symbol || symbol.length > 10) {
        return res.status(400).json({ error: 'Niepoprawny symbol (max 10 znaków, tylko litery/cyfry).' });
    }
    const ip = getClientIp(req);
    const cacheKey = `${symbol}_${timeframe}_E${entryPrice || 'none'}_S${stopLoss || 'none'}`;

    if (analysisCache.has(cacheKey)) {
        const cached = analysisCache.get(cacheKey);
        return res.json({ ...cached.data, _cached: true });
    }

    const { allowed, remaining, resetIn } = checkRateLimit(ip);
    if (!allowed) {
        return res.status(429).json({ error: `Limit wyczerpany. Spróbuj za ${resetIn} min.` });
    }

    try {
        let allHistory = [], allNews = [], allEarnings = [], allMetric = {}, companyProfile = {};

        let baseData = analysisCache.get(`${symbol}_BASE`);
        if (!baseData) {
            const todayDate = new Date();
            const dateToStr = todayDate.toISOString().split('T')[0];
            const dateFromObj = new Date(todayDate.setFullYear(todayDate.getFullYear() - 2));
            const dateFromStr = dateFromObj.toISOString().split('T')[0];

            // Massive API (Polygon-compatible) — oficjalne, niezawodne źródło danych
            let yfHistory = [];
            try {
                const massiveRes = await axios.get(
                    `https://api.massive.com/v2/aggs/ticker/${symbol}/range/1/day/${dateFromStr}/${dateToStr}?adjusted=true&sort=asc&limit=730&apiKey=${MASSIVE_KEY}`
                );
                const results = massiveRes.data.results || [];
                for (const bar of results) {
                    if (bar.c !== null && bar.c !== undefined) {
                        yfHistory.push({
                            date: new Date(bar.t).toISOString(),
                            close: bar.c,
                            open: bar.o,
                            high: bar.h,
                            low: bar.l,
                            volume: bar.v
                        });
                    }
                }
            } catch (err) {
                console.error("Massive API Error:", err.response?.data || err.message);
            }

            // Fallback: Finnhub candles (daily) when Massive returns nothing
            if (yfHistory.length === 0) {
                try {
                    console.log(`[FALLBACK] Trying Finnhub candles for ${symbol}`);
                    const fromTs = Math.floor(dateFromObj.getTime() / 1000);
                    const toTs   = Math.floor(Date.now() / 1000);
                    const fhRes  = await axios.get(
                        `https://finnhub.io/api/v1/stock/candles?symbol=${symbol}&resolution=D&from=${fromTs}&to=${toTs}&token=${FINNHUB_KEY}`
                    );
                    if (fhRes.data.s === 'ok' && fhRes.data.c?.length) {
                        yfHistory = fhRes.data.t.map((ts, i) => ({
                            date:   new Date(ts * 1000).toISOString(),
                            close:  fhRes.data.c[i],
                            open:   fhRes.data.o[i],
                            high:   fhRes.data.h[i],
                            low:    fhRes.data.l[i],
                            volume: fhRes.data.v[i]
                        }));
                        console.log(`[FALLBACK] Finnhub OK: ${yfHistory.length} bars for ${symbol}`);
                    }
                } catch (fhErr) {
                    console.error("Finnhub fallback error:", fhErr.message);
                }
            }

            // Massive API news — pełne 365 dni z URL artykułów (Polygon-compatible)
            let allNewsArray = [];
            try {
                const d365 = new Date(); d365.setDate(d365.getDate() - 365);
                const from365 = d365.toISOString().split('T')[0];

                const [rEarn, rMetric] = await Promise.all([
                    axios.get(`https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${FINNHUB_KEY}`).catch(() => ({ data: [] })),
                    axios.get(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_KEY}`, { timeout: 5000 }).catch(() => ({ data: {} })),
                ]);

                // Omijamy limit 1000 dla gigantów medialnych (jak NVDA), wykorzystując paginację
                let rawArticles = [];
                let nextUrl = `https://api.massive.com/v2/reference/news?ticker=${symbol}&published_utc.gte=${from365}&limit=1000&sort=published_utc&order=desc&apiKey=${MASSIVE_KEY}`;

                try {
                    for (let k = 0; k < 5; k++) { // Max 5 stron by zabezpieczyć czas (~5000 wiadomości)
                        const r = await axios.get(nextUrl);
                        if (r.data?.results) rawArticles.push(...r.data.results);
                        if (r.data?.next_url) {
                            nextUrl = r.data.next_url + `&apiKey=${MASSIVE_KEY}`;
                        } else {
                            break;
                        }
                    }
                } catch (e) {
                    // ignoruj jeśli kolejne trzaśnięcia napotkały koniec limitów
                }

                // Pobieranie nazwy firmy z profilu by wykluczyć potem fałszywe newsy + fundamental data
                let companyName = symbol;
                let companyProfile = {};
                try {
                    const prof = await axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`);
                    if (prof.data) {
                        companyProfile = prof.data;
                        if (prof.data.name) companyName = prof.data.name.split(' ')[0].toLowerCase();
                    }
                } catch (e) { }

                // Mapowanie Massive news z RYGORYSTYCZNYM filtrem
                const massiveNews = rawArticles.map(n => ({
                    headline: n.title,
                    datetime: Math.floor(new Date(n.published_utc).getTime() / 1000),
                    url: n.article_url || null,
                    description: n.description || null,
                    source: n.publisher?.name || 'Massive',
                    sentiment: n.insights?.find(ins => ins.ticker === symbol)?.sentiment || null
                })).filter(n => {
                    if (!n.headline) return false;
                    const txt = (n.headline).toLowerCase();
                    const tick = symbol.toLowerCase();
                    // Zostaw tylko, jeśli nazwa spółki albo ticker są bezpośrednio w NAGŁÓWKU 
                    // Odrzuca to zgiełk, pakiety zbiorcze (Dogecoin, Dow Jones itp.)
                    return txt.includes(tick) || txt.includes(companyName);
                });

                allNewsArray = massiveNews;
                allEarnings = Array.isArray(rEarn.data) ? rEarn.data : [];
                allMetric = rMetric.data?.metric || {};

            } catch (e) {
                console.error("News/Earnings batch error", e.message);
            }

            allHistory = yfHistory.map(item => ({
                t: new Date(item.date).getTime(), c: item.close, o: item.open, h: item.high, l: item.low, v: item.volume
            })).sort((a, b) => a.t - b.t);

            allNews = allNewsArray;

            analysisCache.set(`${symbol}_BASE`, { timestamp: Date.now(), allHistory, allNews, allEarnings, allMetric, companyProfile });
        } else {
            allHistory = baseData.allHistory;
            allNews = baseData.allNews;
            allEarnings = baseData.allEarnings;
            allMetric = baseData.allMetric || {};
            companyProfile = baseData.companyProfile || {};
        }

        if (!allHistory || allHistory.length === 0) throw new Error("Massive API nie zwróciło danych. Sprawdź MASSIVE_API_KEY lub symbol.");

        // Obliczenia QUANT na CAŁEJ historii
        const rsi = calculateRSI(allHistory);
        const sma50 = getSMA(allHistory, 50);
        const sma20 = getSMA(allHistory, 20);
        const lastC = allHistory[allHistory.length - 1]?.c || 0;

        // Trend krótkoterminowy na podstawie średniej 5-dniowej
        const sma5 = getSMA(allHistory, 5);
        const mom5 = allHistory.length > 5 ? ((lastC - sma5) / sma5) * 100 : 0;

        // Nachylenie SMA50 — czy trend długoterminowy rośnie czy zakręca w dół
        const prevSma50 = getSMA(allHistory.slice(0, -5), 50);
        const sma50Slope = prevSma50 > 0 ? ((sma50 - prevSma50) / prevSma50) * 100 : 0;

        // Trend wolumenu — porównanie średniej z ostatnich 5 dni do ostatnich 20 dni
        const recentVol5 = allHistory.slice(-5).reduce((s, h) => s + (h.v || 0), 0) / 5;
        const recentVol20 = allHistory.slice(-20).reduce((s, h) => s + (h.v || 0), 0) / 20;
        const volumeTrend = recentVol5 > recentVol20 * 1.2 ? 'ROSNĄCY' : (recentVol5 < recentVol20 * 0.8 ? 'MALEJĄCY' : 'NEUTRALNY');
        const isDistribution = mom5 < 0 && volumeTrend === 'ROSNĄCY';

        // --- NOWE WSKAŹNIKI ---
        const ema9  = calculateEMA(allHistory, 9);
        const ema21 = calculateEMA(allHistory, 21);
        const ema50 = calculateEMA(allHistory, 50);
        const ema200 = calculateEMA(allHistory, 200);
        const macdData = calculateMACD(allHistory);
        const bbData = calculateBollingerBands(allHistory);
        const atrData = calculateATR(allHistory);
        const adxData = calculateADX(allHistory);
        const stochRsi = calculateStochRSI(allHistory);

        // EMA Crossovers
        const ema9_21Cross = ema9 > ema21 ? 'BULLISH (9 > 21)' : 'BEARISH (9 < 21)';
        const goldenDeathCross = ema50 > ema200 ? 'GOLDEN CROSS (EMA50 > EMA200) ' : 'DEATH CROSS (EMA50 < EMA200) ';
        const priceVsEma200 = lastC > ema200 ? 'POWYŻEJ EMA200 (strefa byków)' : 'PONIŻEJ EMA200 (strefa niedźwiedzi)';

        // MACD interpretation (fixed)
        const macdCross = macdData.macd > macdData.signal ? 'MACD POWYŻEJ SYGNAŁU (bullish)' : 'MACD PONIŻEJ SYGNAŁU (bearish)';

        // Bollinger Bands interpretation
        const bbPosition = bbData.percentB > 80 ? 'PRZY GÓRNYM PAŚMIE (wykupienie)' : bbData.percentB < 20 ? 'PRZY DOLNYM PAŚMIE (wyprzedanie)' : 'WEWNĄTRZ PASM (normalny zakres)';
        const bbSqueeze = bbData.bandwidth < 5 ? 'SQUEEZE — oczekuj wybicia!' : bbData.bandwidth > 20 ? 'ROZSZERZENIE — wysoka zmienność' : 'NORMALNE PASMA';

        // ATR-based dynamic stop loss
        const atrSL = (lastC - atrData * 2).toFixed(2);
        const atrPercent = lastC > 0 ? ((atrData / lastC) * 100).toFixed(2) : '0';

        // OBV — potwierdza trend wolumenem
        const obvData = calculateOBV(allHistory);

        // Fibonacci retracement od 52W High/Low
        const hist52w = allHistory.slice(-252);
        const high52w = hist52w.length ? Math.max(...hist52w.map(h => h.c)) : lastC;
        const low52w  = hist52w.length ? Math.min(...hist52w.map(h => h.c)) : lastC;
        const fib = calculateFibonacci(high52w, low52w);

        // Pivot Points (tygodniowe)
        const pivots = calculatePivotPoints(allHistory);

        // P/E, P/B z Finnhub metrics
        const peRatio = allMetric['peNormalizedAnnual'] || allMetric['peTTM'] || null;
        const pbRatio = allMetric['pbAnnual'] || allMetric['pbQuarterly'] || null;
        const epsGrowth = allMetric['epsGrowth3Y'] || allMetric['epsGrowth5Y'] || null;
        const revenueGrowth = allMetric['revenueGrowth3Y'] || null;

        // Extended fundamentals from Finnhub metric endpoint
        const fundamentals = {
            // Valuation
            pe_ttm: allMetric['peTTM'] ?? null,
            pe_forward: allMetric['peExclExtraTTM'] ?? allMetric['peBasicExclExtraTTM'] ?? null,
            pb: allMetric['pbAnnual'] ?? allMetric['pbQuarterly'] ?? null,
            ps_ttm: allMetric['psTTM'] ?? null,
            peg: (allMetric['peTTM'] && allMetric['epsGrowth5Y'] && allMetric['epsGrowth5Y'] > 0)
                ? +(allMetric['peTTM'] / allMetric['epsGrowth5Y']).toFixed(2) : null,
            ev_ebitda: allMetric['totalDebt/totalEquityAnnual'] != null ? null : null, // placeholder
            ev_sales: null, // will compute below
            // Profitability
            roe_ttm: allMetric['roeTTM'] ?? allMetric['roeRfy'] ?? null,
            roa_ttm: allMetric['roaTTM'] ?? allMetric['roaRfy'] ?? null,
            net_margin: allMetric['netProfitMarginTTM'] ?? allMetric['netProfitMargin5Y'] ?? null,
            gross_margin: allMetric['grossMarginTTM'] ?? allMetric['grossMargin5Y'] ?? null,
            operating_margin: allMetric['operatingMarginTTM'] ?? allMetric['operatingMargin5Y'] ?? null,
            // Financial health
            current_ratio: allMetric['currentRatioAnnual'] ?? allMetric['currentRatioQuarterly'] ?? null,
            debt_equity: allMetric['totalDebt/totalEquityAnnual'] ?? allMetric['totalDebt/totalEquityQuarterly'] ?? null,
            // Growth
            eps_growth_3y: allMetric['epsGrowth3Y'] ?? null,
            eps_growth_5y: allMetric['epsGrowth5Y'] ?? null,
            revenue_growth_3y: allMetric['revenueGrowth3Y'] ?? null,
            revenue_growth_5y: allMetric['revenueGrowth5Y'] ?? null,
            // Per-share
            fcf_per_share: allMetric['freeCashFlowPerShareTTM'] ?? null,
            book_value_per_share: allMetric['bookValuePerShareAnnual'] ?? allMetric['bookValuePerShareQuarterly'] ?? null,
            revenue_per_share: allMetric['revenuePerShareTTM'] ?? null,
            // Market
            dividend_yield: allMetric['dividendYieldIndicatedAnnual'] ?? null,
            beta: allMetric['beta'] ?? null,
            // Company profile
            market_cap: companyProfile.marketCapitalization ? +(companyProfile.marketCapitalization).toFixed(0) : null,
            sector: companyProfile.finnhubIndustry || null,
            company_name: companyProfile.name || symbol,
            exchange: companyProfile.exchange || null,
            ipo_date: companyProfile.ipo || null,
        };

        // EV/EBITDA & EV/Sales from Finnhub if available
        if (allMetric['enterpriseValueEBITDATTM'] != null) fundamentals.ev_ebitda = allMetric['enterpriseValueEBITDATTM'];
        else if (allMetric['enterpriseValue/ebitdaTTM'] != null) fundamentals.ev_ebitda = allMetric['enterpriseValue/ebitdaTTM'];
        if (allMetric['psTTM'] != null && fundamentals.market_cap && fundamentals.revenue_per_share) {
            // EV/Sales approximation
            fundamentals.ev_sales = +(allMetric['psTTM'] * 1.1).toFixed(2); // rough EV/Sales ≈ P/S * (1 + D/E adj)
        }

        // Relative Strength vs SPY (using cache or fresh fetch)
        let relativeStrength = {};
        try {
            let spyHistory = analysisCache.get('SPY_HISTORY');
            if (!spyHistory) {
                const spyFrom = new Date(); spyFrom.setFullYear(spyFrom.getFullYear() - 2);
                const spyRes = await axios.get(
                    `https://api.massive.com/v2/aggs/ticker/SPY/range/1/day/${spyFrom.toISOString().split('T')[0]}/${new Date().toISOString().split('T')[0]}?adjusted=true&limit=600&apiKey=${MASSIVE_KEY}`,
                    { timeout: 8000 }
                ).catch(() => null);
                if (spyRes?.data?.results?.length) {
                    spyHistory = spyRes.data.results.map(r => ({ t: r.t, c: r.c }));
                    analysisCache.set('SPY_HISTORY', spyHistory);
                    setTimeout(() => analysisCache.delete('SPY_HISTORY'), 3600000);
                }
            }
            if (spyHistory?.length > 5) {
                const calcRet = (hist, days) => {
                    const sl = hist.slice(-days - 1);
                    return sl.length >= 2 ? ((sl[sl.length - 1].c - sl[0].c) / sl[0].c * 100) : null;
                };
                const periods = [{ k: '1m', d: 21 }, { k: '3m', d: 63 }, { k: '6m', d: 126 }, { k: '1y', d: 252 }];
                for (const { k, d } of periods) {
                    const stockRet = calcRet(allHistory, d);
                    const spyRet = calcRet(spyHistory, d);
                    if (stockRet != null && spyRet != null) {
                        relativeStrength[k] = { stock: +stockRet.toFixed(1), spy: +spyRet.toFixed(1), alpha: +(stockRet - spyRet).toFixed(1) };
                    }
                }
            }
        } catch (e) { /* SPY fetch failed, non-critical */ }

        // Ocena wyrównania sygnałów — system ważony
        const distFromHigh52w = high52w > 0 ? ((lastC - high52w) / high52w * 100).toFixed(1) : '0';
        const distFromLow52w  = low52w  > 0 ? ((lastC - low52w)  / low52w  * 100).toFixed(1) : '0';

        // Period returns
        const periodRet = (bars) => {
            const sl = allHistory.slice(-bars - 1);
            if (sl.length < 2) return null;
            return ((sl[sl.length - 1].c - sl[0].c) / sl[0].c * 100).toFixed(1);
        };
        const ret1w  = periodRet(5);
        const ret1m  = periodRet(21);
        const ret3m  = periodRet(63);
        const ret6m  = periodRet(126);
        const ret1y  = periodRet(252);

        // News sentiment aggregate (Massive API insights)
        const sentArticles = allNews.filter(n => n.sentiment);
        const sentBull = sentArticles.filter(n => n.sentiment === 'positive').length;
        const sentBear = sentArticles.filter(n => n.sentiment === 'negative').length;
        const sentTotal = sentArticles.length || 1;
        const sentBullPct = Math.round(sentBull / sentTotal * 100);
        const sentBearPct = Math.round(sentBear / sentTotal * 100);

        // === SCORING Z KATEGORYZACJĄ (transparentny breakdown) ===
        const cats = { trend: { bull: 0, bear: 0, max: 0 }, momentum: { bull: 0, bear: 0, max: 0 }, volatility: { bull: 0, bear: 0, max: 0 }, sentiment: { bull: 0, bear: 0, max: 0 } };

        // --- TREND (waga ~40%) ---
        // EMA50/200 Golden/Death Cross (waga 3 — najwazniejszy sygnal instytucjonalny)
        cats.trend.max += 3;
        if (ema50 > ema200) cats.trend.bull += 3; else cats.trend.bear += 3;
        // Cena vs EMA200 (waga 3)
        cats.trend.max += 3;
        if (lastC > ema200) cats.trend.bull += 3; else cats.trend.bear += 3;
        // Cena vs SMA50 (waga 1)
        cats.trend.max += 1;
        if (lastC >= sma50) cats.trend.bull += 1; else cats.trend.bear += 1;
        // Cena vs SMA20 (waga 1)
        cats.trend.max += 1;
        if (lastC >= sma20) cats.trend.bull += 1; else cats.trend.bear += 1;
        // SMA50 slope (waga 1)
        cats.trend.max += 1;
        if (sma50Slope > 0.5) cats.trend.bull += 1; else if (sma50Slope < -1.5) cats.trend.bear += 1;
        // ADX direction (waga 2 — tylko jesli trend silny ADX>25)
        cats.trend.max += 2;
        if (adxData.adx >= 25) { if (adxData.plusDI > adxData.minusDI) cats.trend.bull += 2; else cats.trend.bear += 2; }

        // --- MOMENTUM (waga ~30%) ---
        // EMA9/21 crossover (waga 1 — krotkoterminowy)
        cats.momentum.max += 1;
        if (ema9 > ema21) cats.momentum.bull += 1; else cats.momentum.bear += 1;
        // MACD vs Signal (waga 2)
        cats.momentum.max += 2;
        if (macdData.macd > macdData.signal) cats.momentum.bull += 2; else cats.momentum.bear += 2;
        // MACD histogram sign (waga 1)
        cats.momentum.max += 1;
        if (macdData.histogram > 0) cats.momentum.bull += 1; else cats.momentum.bear += 1;
        // RSI direction (waga 1)
        cats.momentum.max += 1;
        if (rsi > 50) cats.momentum.bull += 1; else cats.momentum.bear += 1;
        // Momentum 5d (waga 1)
        cats.momentum.max += 1;
        if (mom5 > 1) cats.momentum.bull += 1; else if (mom5 < -1) cats.momentum.bear += 1;

        // --- VOLATILITY (waga ~20%) ---
        // ATR% normalization — core volatility signal (waga 2)
        const atrPctVal = lastC > 0 ? (atrData / lastC) * 100 : 0;
        cats.volatility.max += 2;
        if (atrPctVal < 1.5) cats.volatility.bull += 2;       // niska zmienność → korzystne dla trendów
        else if (atrPctVal < 2.5) cats.volatility.bull += 1;  // umiarkowana
        else if (atrPctVal > 4.0) cats.volatility.bear += 2;  // ekstremalna zmienność → ryzyko
        else if (atrPctVal > 3.0) cats.volatility.bear += 1;  // podwyższona
        // RSI overbought/oversold (waga 1)
        cats.volatility.max += 1;
        if (rsi > 70) cats.volatility.bear += 1; else if (rsi < 30) cats.volatility.bull += 1;
        // Stochastic RSI (waga 1)
        cats.volatility.max += 1;
        if (stochRsi.k > 80) cats.volatility.bear += 1; else if (stochRsi.k < 20) cats.volatility.bull += 1;
        // Bollinger Bands (waga 1)
        cats.volatility.max += 1;
        if (bbData.percentB > 80) cats.volatility.bear += 1; else if (bbData.percentB < 20) cats.volatility.bull += 1;
        // Dystrybucja (waga 2)
        cats.volatility.max += 2;
        if (isDistribution) cats.volatility.bear += 2;

        // --- SENTIMENT (waga ~10%) ---
        cats.sentiment.max += 2;
        if (sentBullPct > 60) cats.sentiment.bull += 2;
        else if (sentBearPct > 60) cats.sentiment.bear += 2;
        else if (sentBullPct > sentBearPct) cats.sentiment.bull += 1;
        else if (sentBearPct > sentBullPct) cats.sentiment.bear += 1;

        // Sumowanie
        let bullScore = cats.trend.bull + cats.momentum.bull + cats.volatility.bull + cats.sentiment.bull;
        let bearScore = cats.trend.bear + cats.momentum.bear + cats.volatility.bear + cats.sentiment.bear;

        // Scoring per category (0-100)
        const catScore = (c) => c.max === 0 ? 50 : (c.bull === 0 && c.bear === 0) ? 50 : Math.round(c.bull / (c.bull + c.bear) * 100);

        // Category weights (how much each contributes to final composite)
        const CATEGORY_WEIGHTS = { trend: 0.40, momentum: 0.30, volatility: 0.20, sentiment: 0.10 };
        const weightedScores = {
            trend: catScore(cats.trend) * CATEGORY_WEIGHTS.trend,
            momentum: catScore(cats.momentum) * CATEGORY_WEIGHTS.momentum,
            volatility: catScore(cats.volatility) * CATEGORY_WEIGHTS.volatility,
            sentiment: catScore(cats.sentiment) * CATEGORY_WEIGHTS.sentiment,
        };
        const weightedTotal = weightedScores.trend + weightedScores.momentum + weightedScores.volatility + weightedScores.sentiment;

        const scoringBreakdown = {
            trend: catScore(cats.trend),
            momentum: catScore(cats.momentum),
            volatility: catScore(cats.volatility),
            sentiment: catScore(cats.sentiment),
            raw: {
                trend:      { bull: cats.trend.bull,      max: cats.trend.max },
                momentum:   { bull: cats.momentum.bull,   max: cats.momentum.max },
                volatility: { bull: cats.volatility.bull, max: cats.volatility.max },
                sentiment:  { bull: cats.sentiment.bull,  max: cats.sentiment.max },
            },
            // Weight contributions (how much each category adds to the final score)
            weights: CATEGORY_WEIGHTS,
            weighted_scores: {
                trend: Math.round(weightedScores.trend),
                momentum: Math.round(weightedScores.momentum),
                volatility: Math.round(weightedScores.volatility),
                sentiment: Math.round(weightedScores.sentiment),
            },
            weighted_total: Math.round(weightedTotal),
        };

        // === SETUP TYPE DETECTION ===
        const isBullTrend = ema50 > ema200 && lastC > ema200;
        const isBearTrend = ema50 < ema200 && lastC < ema200;
        const isBBSqueeze = bbData.bandwidth < 5;
        const isBullMomentum = macdData.macd > macdData.signal && ema9 > ema21;
        const isBearMomentum = macdData.macd < macdData.signal && ema9 < ema21;

        let setupType = 'TREND';
        let setupWarning = null;
        if (isBBSqueeze && adxData.adx < 20) {
            setupType = 'RANGE';
            setupWarning = 'Konsolidacja — brak wyraźnego trendu, czekaj na wybicie z Bollinger Squeeze.';
        } else if (isBullTrend && isBullMomentum) {
            setupType = 'TREND';
        } else if (isBearTrend && isBearMomentum) {
            setupType = 'TREND';
        } else if (isBearTrend && isBullMomentum) {
            setupType = 'REVERSAL';
            setupWarning = 'UWAGA: Kontr-trendowe zagranie (Death Cross aktywny). Podwyższone ryzyko — zmniejsz wielkość pozycji.';
        } else if (isBullTrend && isBearMomentum) {
            setupType = 'PULLBACK';
            setupWarning = 'Pullback w trendzie wzrostowym. Szukaj wsparcia na EMA50/EMA200 przed wejściem.';
        } else if (isBBSqueeze) {
            setupType = 'BREAKOUT';
            setupWarning = 'Bollinger Squeeze — oczekuj silnego ruchu. Ustaw stopy ciasno.';
        }

        const signalBias = bearScore > bullScore
            ? `NIEDŹWIEDZI (${bearScore} pkt SHORT vs ${bullScore} pkt LONG)`
            : `BYCZY (${bullScore} pkt LONG vs ${bearScore} pkt SHORT)`;

        // Trend określany łącznie — cena + nachylenie SMA (nie tylko pozycja względem średniej)
        const longTrend = lastC > sma50 && sma50Slope > 0 ? 'SILNY BYCZY' :
            lastC < sma50 && sma50Slope < 0 ? 'SILNY NIEDŹWIEDZI' :
                lastC > sma50 && sma50Slope < -0.3 ? 'SŁABNĄCY BYCZY (zakręt w dół)' :
                    lastC < sma50 && sma50Slope > 0.3 ? 'SŁABNĄCY NIEDŹWIEDZI (możliwe dno)' :
                        'NIEPEWNY / KONSOLIDACJA';

        const quantStats = {
            rsi: Math.round(rsi),
            momentum5d: mom5.toFixed(1),
            trend: longTrend,
            short_trend: lastC > sma20 ? 'BYCZY (Krótkoterm)' : 'NIEDŹWIEDZI (Krótkoterm)',
            sma50_slope: sma50Slope.toFixed(2) + '%',
            volume_trend: volumeTrend,
            is_distribution: isDistribution,
            is_overbought: rsi > 70,
            is_oversold: rsi < 30,
            signal_bias: signalBias,
            // EMA
            ema9: ema9.toFixed(2),
            ema21: ema21.toFixed(2),
            ema50: ema50.toFixed(2),
            ema200: ema200.toFixed(2),
            ema9_21_cross: ema9_21Cross,
            golden_death_cross: goldenDeathCross,
            price_vs_ema200: priceVsEma200,
            // MACD
            macd: macdData.macd.toFixed(4),
            macd_signal: macdData.signal.toFixed(4),
            macd_histogram: macdData.histogram.toFixed(4),
            macd_cross: macdCross,
            // Bollinger Bands
            bb_upper: bbData.upper?.toFixed(2),
            bb_middle: bbData.middle?.toFixed(2),
            bb_lower: bbData.lower?.toFixed(2),
            bb_bandwidth: bbData.bandwidth.toFixed(2) + '%',
            bb_percentB: bbData.percentB.toFixed(1) + '%',
            bb_position: bbPosition,
            bb_squeeze: bbSqueeze,
            // ATR
            atr: atrData.toFixed(2),
            atr_percent: atrPercent + '%',
            atr_stop_loss: '$' + atrSL,
            // ADX
            adx: adxData.adx,
            adx_plus_di: adxData.plusDI,
            adx_minus_di: adxData.minusDI,
            adx_trend: adxData.trend,
            // Stochastic RSI
            stoch_rsi_k: stochRsi.k,
            stoch_rsi_d: stochRsi.d,
            stoch_rsi_signal: stochRsi.signal,
            // SMA actual values
            sma20: sma20.toFixed(2),
            sma50: sma50.toFixed(2),
            // OBV
            obv_trend: obvData.trend,
            // Fibonacci retracement (52W High/Low)
            fib_236: fib.fib_236,
            fib_382: fib.fib_382,
            fib_500: fib.fib_500,
            fib_618: fib.fib_618,
            fib_786: fib.fib_786,
            // Pivot Points (weekly)
            pivot_p:  pivots?.P  ?? null,
            pivot_r1: pivots?.R1 ?? null,
            pivot_r2: pivots?.R2 ?? null,
            pivot_s1: pivots?.S1 ?? null,
            pivot_s2: pivots?.S2 ?? null,
            // Fundamentals
            pe_ratio: peRatio != null ? Number(peRatio).toFixed(1) : 'N/A',
            pb_ratio: pbRatio != null ? Number(pbRatio).toFixed(2) : 'N/A',
            eps_growth: epsGrowth != null ? Number(epsGrowth).toFixed(1) + '%' : 'N/A',
            revenue_growth: revenueGrowth != null ? Number(revenueGrowth).toFixed(1) + '%' : 'N/A',
            // 52-week context
            high52w: high52w.toFixed(2),
            low52w: low52w.toFixed(2),
            dist_from_high52w: distFromHigh52w + '%',
            dist_from_low52w: distFromLow52w + '%',
            // Period returns
            ret1w:  ret1w  !== null ? ret1w  + '%' : 'N/A',
            ret1m:  ret1m  !== null ? ret1m  + '%' : 'N/A',
            ret3m:  ret3m  !== null ? ret3m  + '%' : 'N/A',
            ret6m:  ret6m  !== null ? ret6m  + '%' : 'N/A',
            ret1y:  ret1y  !== null ? ret1y  + '%' : 'N/A',
            // Sentiment
            sent_bull_pct: sentBullPct + '%',
            sent_bear_pct: sentBearPct + '%',
            sent_total: sentTotal,
            // Defensive BB/MACD/ATR (ensure no undefined)
            bb_upper:  bbData.upper  != null ? Number(bbData.upper).toFixed(2)  : null,
            bb_middle: bbData.middle != null ? Number(bbData.middle).toFixed(2) : null,
            bb_lower:  bbData.lower  != null ? Number(bbData.lower).toFixed(2)  : null,
        };

        // --- FILTORWANIE ZBIORÓW DANYCH WG WYBRANEJ RAMY CZASOWEJ (Timeframe) ---
        const cutoffDays = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730 }[timeframe] || 365;
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - cutoffDays);
        const limitTime = limitDate.getTime();

        const history = allHistory.filter(h => h.t >= limitTime);

        const news = allNews.filter(n => (n.datetime * 1000) >= limitTime);
        const earnings = allEarnings.filter(e => new Date(e.period).getTime() >= limitTime);


        // Znajdywanie anomalii cenowych w tym wyciętym okresie
        let pctChanges = [];
        for (let i = 1; i < history.length; i++) {
            const h = history[i];
            const prev = history[i - 1];
            const pct = ((h.c - prev.c) / prev.c) * 100;
            pctChanges.push({ pct, date: new Date(h.t).toISOString().split('T')[0] });
        }
        pctChanges.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

        // Słownik: data → zmiana % (do wzbogacenia kontekstu AI)
        const pctByDate = {};
        for (const p of pctChanges) pctByDate[p.date] = p.pct;

        const filteredNews = [...news].sort((a, b) => b.datetime - a.datetime);
        let newsByDate = new Map();
        for (const n of filteredNews) {
            const date = new Date(n.datetime * 1000).toISOString().split('T')[0];
            if (!newsByDate.has(date)) newsByDate.set(date, []);
            newsByDate.get(date).push({ ...n, pct: pctByDate[date] ?? 0 });
        }

        let diverseNews = [];
        let curCount = 0;
        const maxContextArticles = 100;

        let sortedDates = [...newsByDate.keys()].sort((a, b) => new Date(b) - new Date(a));
        for (const date of sortedDates) {
            const arr = newsByDate.get(date);
            const absPct = Math.abs(arr[0].pct || 0);

            // Odrzucamy dni bez drgań z kontekstu AI, aby limit 100 starczył na CAŁY rok (a nie uciął się w lutym na Nvidii)
            if (absPct < 1.0) {
                continue;
            }

            let takeCount = 1;
            if (absPct >= 4.0) takeCount = 3;
            else if (absPct >= 2.0) takeCount = 2;

            const selection = arr.slice(0, takeCount);
            diverseNews.push(...selection);
            curCount += selection.length;

            if (curCount > maxContextArticles) break;
        }

        diverseNews.sort((a, b) => {
            const dA = new Date(a.datetime * 1000).toISOString().split('T')[0];
            const dB = new Date(b.datetime * 1000).toISOString().split('T')[0];
            return Math.abs(pctByDate[dB] ?? 0) - Math.abs(pctByDate[dA] ?? 0);
        });

        // Ponieważ wyświetlamy nagłówki bez analizy AI, nie ma sensu pakować ogromnego kontekstu.
        // Zostawiamy mniejszy zestaw tytułów do ogólnego summary.
        const newsContext = diverseNews
            .map(n => {
                const date = new Date(n.datetime * 1000).toISOString().split('T')[0];
                return `DATA: ${date} | TYTUŁ: ${n.headline}`;
            })
            .join('\n');


        // 30 most recent articles (for current narrative, regardless of pct move)
        const recentNews = [...filteredNews].sort((a, b) => b.datetime - a.datetime).slice(0, 30);
        const recentNewsCtx = recentNews.map(n => {
            const date = new Date(n.datetime * 1000).toISOString().split('T')[0];
            const sent = n.sentiment ? ` [${n.sentiment}]` : '';
            return `${date}${sent}: ${n.headline}`;
        }).join('\n');

        // Earnings context (Finnhub)
        const earningsCtx = allEarnings.slice(0, 6).map(e => {
            const surp = e.surprisePercent != null ? ` (surprise: ${e.surprisePercent > 0 ? '+' : ''}${Number(e.surprisePercent).toFixed(1)}%)` : '';
            return `${e.period}: EPS actual=${e.actual ?? 'N/A'} vs est=${e.estimate ?? 'N/A'}${surp}`;
        }).join('\n') || 'No earnings data.';

        const userPositionStr = (entryPrice || stopLoss)
            ? `\nPOZYCJA WŁASNA INWESTORA DO PRZEANALIZOWANIA:\nZadeklarowana cena wejścia: $${entryPrice || 'Brak'}\nZadeklarowany Stop Loss: $${stopLoss || 'Brak'}\nOceń obiektywnie: czy pozycja jest bezpieczna, czy narażona na ryzyko? Podaj konkretne liczby R:R.`
            : `\nINWESTOR NIE POSIADA POZYCJI. Oceń czy aktywo zasługuje na wejście TERAZ — jeśli Signal Bias jest byczy i trend silny, zaproponuj entry. Jeśli dane są mieszane lub niedźwiedzie — rekomenduj NEUTRAL lub czekaj.`;

        const periodReturn = (((lastC - (history[0]?.c || lastC)) / (history[0]?.c || lastC)) * 100);
        const dataRecommendation = bullScore > bearScore ? 'LONG' : (bearScore > bullScore ? 'SHORT' : 'NEUTRAL');
        const compositeScore = Math.round(bullScore / (bullScore + bearScore || 1) * 100);
        // === CONFLICT PENALTY (redukuje composite score przy sprzecznych sygnałach) ===
        let conflictPenalty = 0;
        const conflictSignals = [];
        if (ema50 < ema200 && dataRecommendation === 'LONG') {
            conflictPenalty += 8;
            conflictSignals.push('Death Cross aktywny — trend długoterminowy niedźwiedzi');
        }
        if (ema9 < ema21 && ema50 > ema200 && dataRecommendation === 'LONG') {
            conflictPenalty += 3;
            conflictSignals.push('EMA9 < EMA21 — mikrotren niedźwiedzi przy byczym trendzie długoterminowym');
        }
        if (rsi > 75 && macdData.macd > macdData.signal) {
            conflictPenalty += 5;
            conflictSignals.push(`RSI ${rsi.toFixed(0)} — skrajnie wykupiony przy aktywnym sygnale MACD buy`);
        }
        if (rsi < 25 && macdData.macd < macdData.signal) {
            conflictPenalty += 5;
            conflictSignals.push(`RSI ${rsi.toFixed(0)} — skrajnie wyprzedany przy aktywnym sygnale MACD sell`);
        }
        if (stochRsi?.k != null && stochRsi?.d != null && stochRsi.k > 80 && stochRsi.d > 80 && dataRecommendation === 'LONG') {
            conflictPenalty += 3;
            conflictSignals.push(`Stochastic K=${Number(stochRsi.k).toFixed(0)}/D=${Number(stochRsi.d).toFixed(0)} — wykupiony przy wejściu LONG`);
        }
        const adjustedCompositeScore = Math.max(0, compositeScore - conflictPenalty);
        const compositeLabel = adjustedCompositeScore >= 70 ? 'SILNY BYK' : adjustedCompositeScore >= 55 ? 'BYK' : adjustedCompositeScore >= 45 ? 'NEUTRALNY' : adjustedCompositeScore >= 30 ? 'NIEDŹWIEDŹ' : 'SILNY NIEDŹWIEDŹ';
        const suggestedConfidence = (adjustedCompositeScore >= 68 || adjustedCompositeScore <= 32) ? 'WYSOKA' : (adjustedCompositeScore >= 58 || adjustedCompositeScore <= 42) ? 'SREDNIA' : 'NISKA';
        const currentDate = new Date().toISOString().split('T')[0];

        // === PRE-COMPUTE ALGORITHMIC R:R (wstrzykiwany do promptu) ===
        // Algorytmiczne entry/SL/TP zanim AI cokolwiek wygeneruje
        const algoEntry = lastC;
        const algoSL = parseFloat(atrSL);
        const algoTP_fib = parseFloat(fib.fib_618); // Fibonacci 61.8% jako konserwatywny target
        const algoTP_pivot = pivots?.R1 ?? null;
        const atrTP_long  = lastC + (3 * atrData);
        const atrTP_short = lastC - (3 * atrData);
        const algoTP = dataRecommendation === 'LONG'
            ? Math.max(algoTP_fib || atrTP_long, algoTP_pivot || atrTP_long, atrTP_long)
            : Math.min(algoTP_fib || atrTP_short, algoTP_pivot || atrTP_short, atrTP_short);
        const algoRisk = Math.abs(algoEntry - algoSL);
        const algoReward = Math.abs(algoTP - algoEntry);
        const preComputedRR = algoRisk > 0 ? +(algoReward / algoRisk).toFixed(2) : null;
        const rrQualityLabel = preComputedRR >= 3.0 ? 'WYBITNY' : preComputedRR >= 2.0 ? 'ATRAKCYJNY' : preComputedRR >= 1.5 ? 'KORZYSTNY' : preComputedRR >= 1.0 ? 'AKCEPTOWALNY' : 'NIEKORZYSTNY';

        const promptFull = `Jestes obiektywnym, precyzyjnym analitykiem quant. Analizujesz spolke ${symbol} dla okresu ${timeframe}. DZISIEJSZA DATA: ${currentDate}.
NIE zmyslaj danych. Uzywaj wylacznie dostarczonych wartosci. Jezyk odpowiedzi: POLSKI. Pisz wylacznie poprawnym, profesjonalnym jezykiem polskim gieldowym. Zachowaj wszystkie polskie znaki diakrytyczne (ą, ę, ó, ś, ź, ż, ć, ń, ł). ZAKAZ uzywania angielskich slow tam gdzie istnieje polski odpowiednik (np. 'wsparcie' zamiast 'support', 'opor' zamiast 'resistance', 'trend wzrostowy' zamiast 'uptrend').

=== PELNY ZESTAW WSKAZNIKOW TECHNICZNYCH ===

[OSCYLATORY MOMENTUM]
RSI(14): ${quantStats.rsi}${quantStats.is_overbought ? ' WYKUPIONY >70 - ryzyko odwrocenia' : quantStats.is_oversold ? ' WYPRZEDANY <30 - mozliwe odbicie' : ' - strefa neutralna'}
Stochastic RSI: K=${quantStats.stoch_rsi_k} D=${quantStats.stoch_rsi_d} => ${quantStats.stoch_rsi_signal}
Momentum 5d: ${quantStats.momentum5d}%

[MACD 12/26/9]
MACD: ${quantStats.macd} | Signal: ${quantStats.macd_signal} | Histogram: ${quantStats.macd_histogram}
Status: ${quantStats.macd_cross}

[EMA CROSSOVERS]
EMA9=$${quantStats.ema9} EMA21=$${quantStats.ema21} => ${quantStats.ema9_21_cross}
EMA50=$${quantStats.ema50} EMA200=$${quantStats.ema200} => ${quantStats.golden_death_cross}
Cena $${lastC.toFixed(2)} vs EMA200: ${quantStats.price_vs_ema200}

[SMA TREND]
Trend dlugotermninowy: ${quantStats.trend}
Trend krotkoterminowy (SMA20): ${quantStats.short_trend}
Nachylenie SMA50: ${quantStats.sma50_slope}

[BOLLINGER BANDS 20/2sigma]
Gorna=$${quantStats.bb_upper} Srodkowa=$${quantStats.bb_middle} Dolna=$${quantStats.bb_lower}
%B: ${quantStats.bb_percentB} => ${quantStats.bb_position}
Bandwidth: ${quantStats.bb_bandwidth} => ${quantStats.bb_squeeze}

[ADX - SILA TRENDU 14]
ADX: ${quantStats.adx} | +DI: ${quantStats.adx_plus_di} | -DI: ${quantStats.adx_minus_di}
Ocena: ${quantStats.adx_trend}
(ADX <20=brak trendu, 20-25=slaby, 25-40=silny, >40=bardzo silny)

[ATR - ZMIENNOSC 14]
ATR: $${quantStats.atr} (${quantStats.atr_percent} ceny) | Sugerowany SL (2xATR): ${quantStats.atr_stop_loss}

[WOLUMEN I OBV]
Trend wolumenu (5d vs 20d): ${quantStats.volume_trend}${quantStats.is_distribution ? ' DYSTRYBUCJA: cena spada przy rosnacym wolumenie!' : ''}
Sredni wolumen 20d: ${Math.round(history.slice(-20).reduce((s, h) => s + (h.v || 0), 0) / 20).toLocaleString()} | Wczoraj: ${(history[history.length - 1]?.v || 0).toLocaleString()}
OBV (On-Balance Volume): ${quantStats.obv_trend}

[FIBONACCI RETRACEMENT (52W High=$${quantStats.high52w} / Low=$${quantStats.low52w})]
23.6%: $${quantStats.fib_236} | 38.2%: $${quantStats.fib_382} | 50%: $${quantStats.fib_500} | 61.8%: $${quantStats.fib_618} | 78.6%: $${quantStats.fib_786}
Cena $${lastC.toFixed(2)} vs poziomy Fibonacciego — sprawdz ktory poziom dziala jako wsparcie/opor

[PIVOT POINTS (tygodniowe)]
P: $${quantStats.pivot_p} | R1: $${quantStats.pivot_r1} | R2: $${quantStats.pivot_r2} | S1: $${quantStats.pivot_s1} | S2: $${quantStats.pivot_s2}

[FUNDAMENTY]
SMA20: $${quantStats.sma20} | SMA50: $${quantStats.sma50}
P/E: ${quantStats.pe_ratio} | P/B: ${quantStats.pb_ratio}
EPS Growth 3Y: ${quantStats.eps_growth} | Revenue Growth 3Y: ${quantStats.revenue_growth}

[SUROWE DANE CENOWE - OSTATNIE 30 SWIEC (date,open,high,low,close,vol)]
${history.slice(-30).map(h => {
    const d = new Date(h.t).toISOString().split('T')[0];
    return `${d} O:${h.o?.toFixed(2)} H:${h.h?.toFixed(2)} L:${h.l?.toFixed(2)} C:${h.c?.toFixed(2)} V:${Math.round(h.v/1000)}K`;
}).join('\n')}

[KONTEKST 52-TYGODNIOWY]
52W High: $${quantStats.high52w} | 52W Low: $${quantStats.low52w}
Odleglosc od szczytu 52W: ${quantStats.dist_from_high52w} | Od dna 52W: ${quantStats.dist_from_low52w}

[ZWROTY MULTITIMEFRAME]
1T: ${quantStats.ret1w} | 1M: ${quantStats.ret1m} | 3M: ${quantStats.ret3m} | 6M: ${quantStats.ret6m} | 1R: ${quantStats.ret1y}

[SENTYMENT NEWSOW (AI Insights - Massive API)]
Artykuly z sentymentem: ${quantStats.sent_total} | Pozytywnych: ${quantStats.sent_bull_pct} | Negatywnych: ${quantStats.sent_bear_pct}

[SCORING WAZONY]
Bias techniczny: ${quantStats.signal_bias}
Zmiana w wybranym oknie ${timeframe}: ${periodReturn.toFixed(1)}%
Cena poczatkowa: $${history[0]?.c.toFixed(2)} => Obecna: $${lastC.toFixed(2)}
${userPositionStr}

=== CONSENSUS ALGORYTMU (OBLIGATORYJNY) ===
KIERUNEK: ${dataRecommendation} | COMPOSITE: ${adjustedCompositeScore}/100 (${compositeLabel})${conflictPenalty > 0 ? ` [kara -${conflictPenalty}pkt za konflikty sygnałów]` : ''}
Byki: ${bullScore} pkt | Niedźwiedzie: ${bearScore} pkt | Sugerowana pewność: ${suggestedConfidence}

KRYTYCZNE ZASADY SPOJNOSCI — BEZWZGLEDNIE PRZESTRZEGAJ:
1. quant_analysis.recommendation = "${dataRecommendation}" — BEZ WYJATKOW. NIE ZMIENIAJ.
2. sentiment_score MUSI byc miedzy ${Math.max(0, adjustedCompositeScore - 10)} a ${Math.min(100, adjustedCompositeScore + 10)}. ZAKAZ wartosci domyslnej 50!
3. global_data.final_direction MUSI jednoznacznie wspierac "${dataRecommendation}". Jesli LONG — pisz o wzrostach. Jesli SHORT — o spadkach.
4. Ton summary MUSI odpowiadac "${dataRecommendation}": LONG = dominuje optymizm, SHORT = pesymizm, NEUTRAL = wywazone.
5. bull_case vs bear_case: ${dataRecommendation === 'LONG' ? 'bull_case = SILNE, szczegolowe argumenty. bear_case = pomniejsze ryzyka, zastrzezenia (slabsze).' : dataRecommendation === 'SHORT' ? 'bear_case = SILNE, szczegolowe argumenty. bull_case = pomniejsze szanse (slabsze).' : 'Obie strony rownej wagi.'}
6. ZERO SPRZECZNOSCI. Wszystkie sekcje musza mowic JEDNYM GLOSEM. Nie moze byc tak, ze quant mowi LONG a bear_case jest silniejszy od bull_case.
7. quant_analysis.confidence_level = "${suggestedConfidence}" (mozesz zmienic o 1 poziom jesli masz dobry powod, ale uzasadnij).
8. GEOMETRIA SETUPU: Przy LONG — SL MUSI byc < $${lastC.toFixed(2)} (biezaca cena), TP MUSI byc > entry. Przy SHORT — odwrotnie. Bledna geometria (SL >= entry przy LONG) jest KRYTYCZNYM BLEDEM i zostanie skorygowana przez system.
9. SYGNALY SPRZECZNE: Jesli EMA9/21 sprzeczny z EMA50/200 — wymien to explicite w odpowiednim scenariuszu. Jesli RSI > 75 przy LONG — obowiazkowo ostrzez o ryzyku wyczerpania impulsu wzrostowego w bear_case.
${conflictSignals.length > 0 ? `10. AKTYWNE KONFLIKTY SYGNALOW (system odjalil -${conflictPenalty}pkt z composite score):\n${conflictSignals.map(s => `    - ${s}`).join('\n')}\n    Uwzgledniej je explicite w summary (Akapit 1) i odpowiednim scenariuszu.` : '10. Brak wykrytych konfliktow sygnalow — sygnaly sa spojne.'}

ZASADY DECYZYJNE:
- LONG: Golden Cross + MACD>Signal + Cena>EMA200 + RSI<70 => LONG (niskie ADX = slaby trend, NIE blokuje LONG!)
- SHORT: Death Cross + MACD<Signal + Cena<EMA200 => SHORT
- NEUTRAL: TYLKO gdy sygnaly sa dokladnie 50/50 LUB BB Squeeze (bandwidth<5%) przy braku trendu
- ATR rosnacy = wieksze ryzyko, SL = 2xATR, TP = 3xATR

[ANALIZA FUNDAMENTALNA]
${fundamentals.company_name} | Sektor: ${fundamentals.sector || 'N/A'} | MCap: ${fundamentals.market_cap ? '$' + (fundamentals.market_cap / 1000).toFixed(1) + 'B' : 'N/A'}
Wycena: P/E TTM=${fundamentals.pe_ttm?.toFixed(1) ?? 'N/A'} | P/E Fwd=${fundamentals.pe_forward?.toFixed(1) ?? 'N/A'} | PEG=${fundamentals.peg ?? 'N/A'} | P/B=${fundamentals.pb?.toFixed(2) ?? 'N/A'} | P/S=${fundamentals.ps_ttm?.toFixed(2) ?? 'N/A'} | EV/EBITDA=${fundamentals.ev_ebitda?.toFixed(1) ?? 'N/A'}
Rentownosc: ROE=${fundamentals.roe_ttm?.toFixed(1) ?? 'N/A'}% | ROA=${fundamentals.roa_ttm?.toFixed(1) ?? 'N/A'}% | Marza netto=${fundamentals.net_margin?.toFixed(1) ?? 'N/A'}% | Marza brutto=${fundamentals.gross_margin?.toFixed(1) ?? 'N/A'}% | Marza oper.=${fundamentals.operating_margin?.toFixed(1) ?? 'N/A'}%
Wzrost: EPS 3Y=${fundamentals.eps_growth_3y?.toFixed(1) ?? 'N/A'}% | EPS 5Y=${fundamentals.eps_growth_5y?.toFixed(1) ?? 'N/A'}% | Revenue 3Y=${fundamentals.revenue_growth_3y?.toFixed(1) ?? 'N/A'}%
Zdrowie: Current Ratio=${fundamentals.current_ratio?.toFixed(2) ?? 'N/A'} | D/E=${fundamentals.debt_equity?.toFixed(2) ?? 'N/A'} | FCF/sh=${fundamentals.fcf_per_share?.toFixed(2) ?? 'N/A'}
Rynek: Beta=${fundamentals.beta?.toFixed(2) ?? 'N/A'} | Div Yield=${fundamentals.dividend_yield?.toFixed(2) ?? 'N/A'}%
${Object.keys(relativeStrength).length > 0 ? `\n[SILA RELATYWNA vs S&P 500]\n${Object.entries(relativeStrength).map(([k, v]) => `${k}: ${symbol}=${v.stock}% | SPY=${v.spy}% | Alpha=${v.alpha > 0 ? '+' : ''}${v.alpha}%`).join(' | ')}` : ''}

ZASADY ANALIZY FUNDAMENTALNEJ:
- Jesli P/E > 40 i PEG > 2 — OSTRZEZ o przewartosciowaniu w bear_case
- Jesli P/E < 15 i ROE > 15% — podkresl value play w bull_case
- Jesli D/E > 2 — ostrzez o wysokim zadluzeniu
- W summary Akapit 2 MUSISZ uwzglednic dane fundamentalne (wycene, rentownosc, wzrost)

=== ZASADY BEAR CASE DLA EKSTREMALNEGO MOMENTUM ===
Zmiana 1Y: ${relativeStrength['1y']?.stock ?? 'N/A'}%
${(relativeStrength['1y']?.stock ?? 0) > 150 ? `UWAGA KRYTYCZNA: Spolka wzrosla >${Math.round(relativeStrength['1y']?.stock)}% w ciagu roku! Bear case MUSI byc AGRESYWNY:
- MUSISZ napisac: "Po wzroscie ${Math.round(relativeStrength['1y']?.stock)}% ryzyko korekty 25-35% jest statystycznie wysokie"
- Wymien konkretne poziomy wsparcia, do ktorych moze dojsc korekta (EMA50, EMA200, Fibonacci 38.2%/50%)
- Jesli RSI > 60 — ostrzez o overbought w kontekscie parabolicznego wzrostu
- Jesli P/E > 40 — dodaj "wycena ekstremalnie rozciagnieta vs historyczne srednie sektora"
- Bear case musi miec MINIMUM 5 punktow (nie 4) dla tak ekstremalnych spolek` : (relativeStrength['1y']?.stock ?? 0) > 100 ? `OSTRZEZENIE: Spolka wzrosla >${Math.round(relativeStrength['1y']?.stock)}% w 1Y. Bear case musi zawierac punkt o ryzyku korekty 20-30% i konkretne poziomy wsparcia.` : 'Brak ekstremalnego momentum — standardowe zasady bear case.'}

[WYNIKI KWARTALNE (Finnhub)]
${earningsCtx}

[NAJSWIEZSZE NEWSY - ostatnie 30 artykulow z sentymentem]
${recentNewsCtx}

[NEWSY PRZY NAJWIEKSZYCH WAHANIACH CENOWYCH (posortowane wg ruchu %)]
${newsContext.substring(0, 4500)}

INSTRUKCJE DOTYCZACE TRESCI (format jest wymuszony przez system — pisz tylko tresc):

bull_case: minimum 3 punkty. Kazdy punkt musi zawierac KONKRETNE wartosci wskaznikow, np. "EMA50=$258.92 > EMA200=$251.81 — Golden Cross aktywny", "MACD histogram dodatni: +1.56 — momentum rosnie".

bear_case: minimum 4 punkty. Kazdy z konkretnymi danymi. Nie generalizuj. Np. "ADX=15 — trend zbyt slaby by utrzymac wzrost", "Cena 6.9% ponizej 52W High ($286.19) — opor blisko".
${(setupType === 'REVERSAL' || (ema50 < ema200)) ? `UWAGA — DEATH CROSS / TREND SPADKOWY AKTYWNY: bear_case MUSI miec MINIMUM 5 punktow i byc AGRESYWNY:
- Podaj dokladna odleglosc od 52W High w % i $
- Wymien WSZYSTKIE niedzwiedzie sygnaly: Death Cross, MACD<Signal, cena<EMA200, spadajacy ADX
- Podaj konkretne cele spadkowe (EMA200, Fibonacci 61.8%, Pivot S1/S2)
- Ostrzez ze "trend spadkowy ma statystyczna tendencje do kontynuacji do momentu pojawienia sie Golden Cross"
- NIE LAGODZ tonu — uzytkownik MUSI wiedziec ze to ryzykowna sytuacja` : ''}

summary: Napisz DOKLADNIE TRZY akapity rozdzielone podwojna nowa linia (\n\n). Kazdy akapit MAKSYMALNIE 3 zdania — zwiezle, konkretne, bez lania wody:
  Akapit 1 (TECHNICZNY): Aktualny stan na ${currentDate} — EMA cross, MACD, RSI, pozycja vs 52W High/Low, sila trendu ADX.
  Akapit 2 (KATALIZATORY I FUNDAMENTY): Wymien KONKRETNE nadchodzace wydarzenia ktore moga zmienic cene: najblizszy raport earnings (kiedy, czego sie spodziewac po ostatnim EPS surprise%), konferencje produktowe, zmiany regulacyjne, decyzje Fed, geopolityka — wszystko co jest widoczne w newsach i danych. Dodaj sentyment newsow (${quantStats.sent_bull_pct}% pozytywnych). Jesli nie ma bliskiego triggera — napisz to wprost i podaj co jest nastepnym kluczowym wydarzeniem w kalendarzu.
  Akapit 3 (REKOMENDACJA): Konkretne entry/SL/TP w dolarach, poziom przekonania, kluczowe ryzyko. NIE PODAWAJ R:R w tekscie — jest obliczany automatycznie i wyswietlany w widgecie. ZAKAZ wymieniania slow "bullScore", "bearScore", "Bias Score", "R:R", "stosunek ryzyka do zysku" ani zadnych wewnetrznych zmiennych systemowych — pisz tylko o wskaznikach technicznych, fundamentach i danych rynkowych.

quant_analysis.recommendation: MUSI byc "${dataRecommendation}" — nie zmieniaj!
quant_analysis.probability_long + probability_short musi sumowac sie do DOKLADNIE 100%.
quant_analysis.entry_target: konkretna cena w dolarach (np. "$273.05") lub "NIE WCHODZ" z uzasadnieniem.
quant_analysis.stop_loss: konkretna cena w dolarach (ATR-based, referencja: ${quantStats.atr_stop_loss}). Format: "$XXX.XX".
quant_analysis.take_profit: konkretna cena docelowa w dolarach (np. "$285.26"). Musi byc oparta na oporze technicznym (Fibonacci, Pivot R1/R2, 52W High). Format: "$XXX.XX". NIGDY nie podawaj tekstu — TYLKO cena.
quant_analysis.confidence_level: "${suggestedConfidence}" (WYSOKA/SREDNIA/NISKA — na podstawie wyrownania sygnalow).

=== TWARDA ZASADA R:R (WYLICZONA PRZEZ SYSTEM — POSTEPUJ SCISLE WG WYNIKU) ===
System PRE-OBLICZYL stosunek zysku do ryzyka: R:R = 1:${preComputedRR ?? 'N/A'} — ocena: ${rrQualityLabel}.
NIE LICZYSZ R:R SAMODZIELNIE. Postepujesz wg GOTOWEJ oceny:
${preComputedRR != null && preComputedRR < 1.0 ? `OCENA SYSTEMU: NIEKORZYSTNY (R:R < 1.0). MUSISZ napisac w Akapicie 3: "Biezacy setup nie oferuje optymalnych parametrow wejscia. Rekomendujemy czekanie na glębszą korektę w okolice [podaj konkretny poziom wsparcia np. EMA50, Fibonacci 38.2%] w celu poprawy warunków." ZAKAZ nazywania setupu korzystnym, optymalnym lub zachecania do wejscia.`
: preComputedRR != null && preComputedRR < 1.5 ? `OCENA SYSTEMU: AKCEPTOWALNY (R:R ${preComputedRR}). Napisz ze setup jest akceptowalny ale NIE idealny. Warto czekac na lepszy punkt wejscia. NIE uzywaj slow "optymalny", "idealny", "korzystny".`
: preComputedRR != null && preComputedRR < 2.0 ? `OCENA SYSTEMU: KORZYSTNY (R:R ${preComputedRR}). Setup jest SOLIDNY i KORZYSTNY. Mozesz go nazwac "solidnym" lub "korzystnym". ABSOLUTNY ZAKAZ pisania ze jest niekorzystny! To DOBRY setup.`
: preComputedRR != null && preComputedRR < 3.0 ? `OCENA SYSTEMU: ATRAKCYJNY (R:R ${preComputedRR}). Setup jest ATRAKCYJNY. Podkresl ze warunki wejscia sa bardzo korzystne.`
: `OCENA SYSTEMU: WYBITNY (R:R ${preComputedRR ?? 'N/A'}). Podkresl doskonale parametry setupu.`}
WAZNE: NIGDY nie podawaj wartosci R:R ani slow "stosunek zysku do ryzyka" w tekscie — jest obliczany automatycznie i wyswietlany w widgecie. Skup sie na ocenie jakosci setupu bez podawania liczb R:R.

=== TYP SETUPU (algorytmiczny) ===
Typ: ${setupType}${setupWarning ? '\nOSTRZEZENIE: ' + setupWarning : ''}
Jesli REVERSAL — w summary MUSISZ ostrzec ze to zagranie kontrtrendowe. Jesli RANGE — napisz ze brak trendu, lepiej czekac. Jesli PULLBACK — szukaj entry blizej wsparcia.

global_data.current_status: biezaca sytuacja rynkowa, pozycja wzgledem 52W High/Low i makro.
global_data.future_outlook: scenariusz bazowy na najblizszy miesiac, uwzgledniaj daty earnings.
global_data.elite_view: pozycje instytucjonalne, sygnaly smart money.
global_data.dividend_trend: trend dywidendy i kondycja finansowa spolki.
global_data.sex_appeal: sentyment medialny — ${quantStats.sent_bull_pct}% pozytywnych vs ${quantStats.sent_bear_pct}% negatywnych artykulow.
global_data.final_direction: TWARDY WERDYKT: kierunek + sila przekonania (wysoka/srednia/niska) + kluczowy katalizator + glowne ryzyko.

radar.scenarios: dwa scenariusze — Bear i Bull — z konkretnymi triggerami i targetami cenowymi.
sentiment_score: liczba ${Math.max(0, adjustedCompositeScore - 10)}-${Math.min(100, adjustedCompositeScore + 10)} — MUSI odzwierciedlac consensus algorytmu (${adjustedCompositeScore}/100). ZAKAZ ustawiania na 50 domyslnie!`;
        // --- GENERACJA AI (Structured Output — dane tylko z API) ---
        console.log(`[AI] ${symbol} ${timeframe} | bulls=${bullScore} bears=${bearScore} | composite=${adjustedCompositeScore}(raw=${compositeScore}) | conflicts=${conflictSignals.length}(-${conflictPenalty}pts) | preRR=${preComputedRR} (${rrQualityLabel})`);
        const aiStart = Date.now();

        const AI_MODELS = [
            process.env.GEMINI_MODEL || 'gemma-4-31b-it'
        ];
        const AI_TIMEOUT_MS = 80_000;
        const aiTimeoutPromise = () => new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI timeout (>80s)')), AI_TIMEOUT_MS)
        );
        let parsedAnalysis;
        for (let mi = 0; mi < AI_MODELS.length; mi++) {
            try {
                const model = genAI.getGenerativeModel({
                    model: AI_MODELS[mi],
                    generationConfig: { responseMimeType: "application/json", responseSchema: AI_RESPONSE_SCHEMA, temperature: 0.1 },
                });
                const result = await Promise.race([model.generateContent(promptFull), aiTimeoutPromise()]);
                parsedAnalysis = JSON.parse(result.response.text());
                if (mi > 0) console.log(`[AI] Fallback model used: ${AI_MODELS[mi]}`);
                break;
            } catch (aiErr) {
                console.warn(`[AI] ${AI_MODELS[mi]} failed: ${aiErr.message?.substring(0, 120)}`);
                if (mi === AI_MODELS.length - 1) throw new Error('AI nie zwrocilo odpowiedzi. Sprobuj ponownie.');
            }
        }

        // === COMPUTED R:R (server-side, nie AI) ===
        const parsePrice = (s) => { const m = String(s || '').match(/[\d]+\.?\d*/); return m ? parseFloat(m[0]) : null; };
        const aiEntry = parsePrice(parsedAnalysis.quant_analysis?.entry_target);
        const aiSL    = parsePrice(parsedAnalysis.quant_analysis?.stop_loss);
        const aiTP    = parsePrice(parsedAnalysis.quant_analysis?.take_profit);
        let computedRR = null;
        if (aiEntry && aiSL && aiTP && aiEntry !== aiSL) {
            const risk   = Math.abs(aiEntry - aiSL);
            const reward = Math.abs(aiTP - aiEntry);
            computedRR = risk > 0 ? +(reward / risk).toFixed(2) : null;
        }
        parsedAnalysis.computed_rr = computedRR;
        parsedAnalysis.setup_type = setupType;
        parsedAnalysis.setup_warning = setupWarning;

        // === WALIDACJA GEOMETRII SETUPU (override AI jeśli sprzeczne) ===
        let setupInvalid = null;
        let targetWarning = null;
        if (dataRecommendation === 'LONG' && aiSL != null && aiEntry != null && aiSL >= aiEntry) {
            setupInvalid = `Błąd geometrii: SL ($${aiSL.toFixed(2)}) ≥ Entry ($${aiEntry.toFixed(2)}) przy LONG — zastosowano SL algorytmiczny $${algoSL.toFixed(2)} (2×ATR).`;
            if (parsedAnalysis.quant_analysis) parsedAnalysis.quant_analysis.stop_loss = '$' + algoSL.toFixed(2);
        }
        if (dataRecommendation === 'SHORT' && aiSL != null && aiEntry != null && aiSL <= aiEntry) {
            const shortSL = (lastC + atrData * 2).toFixed(2);
            setupInvalid = `Błąd geometrii: SL ($${aiSL.toFixed(2)}) ≤ Entry ($${aiEntry.toFixed(2)}) przy SHORT — zastosowano SL algorytmiczny $${shortSL} (2×ATR).`;
            if (parsedAnalysis.quant_analysis) parsedAnalysis.quant_analysis.stop_loss = '$' + shortSL;
        }
        if (aiEntry != null && aiTP != null && Math.abs(aiTP - aiEntry) < atrData) {
            const correctedTP = dataRecommendation === 'LONG'
                ? (aiEntry + 2.5 * atrData)
                : (aiEntry - 2.5 * atrData);
            targetWarning = `Cel ($${aiTP.toFixed(2)}) bliższy niż 1×ATR ($${atrData.toFixed(2)}) od entry — nierealistyczny. Skorygowano do $${correctedTP.toFixed(2)} (2.5×ATR).`;
            if (parsedAnalysis.quant_analysis) parsedAnalysis.quant_analysis.take_profit = '$' + correctedTP.toFixed(2);
        }
        parsedAnalysis.setup_invalid = setupInvalid;
        parsedAnalysis.target_warning = targetWarning;

        // === HARD SAFETY RULE: R:R < 1.5 → degrade confidence, inject warning ===
        if (computedRR != null && computedRR < 1.5) {
            parsedAnalysis.rr_warning = computedRR < 1.0
                ? `R:R wynosi zaledwie 1:${computedRR.toFixed(1)} — ryzyko przewyższa potencjalny zysk. Przy 50% skuteczności setup ma ujemną wartość oczekiwaną. Czekaj na głębszą korektę (min. R:R 1:2).`
                : `R:R wynosi 1:${computedRR.toFixed(1)} — poniżej optymalnego progu 1:1.5. Rozważ czekanie na lepszy punkt wejścia lub zawężenie Stop Loss.`;
            // Force confidence down if AI set it too high
            if (parsedAnalysis.quant_analysis?.confidence_level === 'WYSOKA' && computedRR < 1.0) {
                parsedAnalysis.quant_analysis.confidence_level = 'NISKA';
            } else if (parsedAnalysis.quant_analysis?.confidence_level === 'WYSOKA' && computedRR < 1.5) {
                parsedAnalysis.quant_analysis.confidence_level = 'SREDNIA';
            }
        }

        // === POST-PROCESSING: Naprawa sprzecznosci AI tekstu z R:R ===
        if (false) { /* post-processing via regex removed — prompt+schema handle consistency upstream */
            const summaryLower = parsedAnalysis.summary.toLowerCase();
            const saysNegative = summaryLower.includes('niekorzystny') || summaryLower.includes('nie oferuje optymalnych') || summaryLower.includes('czekanie na') || summaryLower.includes('nie wchodzi');
            const saysPositive = summaryLower.includes('korzystny') || summaryLower.includes('solidny') || summaryLower.includes('optymaln') || summaryLower.includes('atrakcyjn');

            // Gdy R:R >= 1.5 ale AI pisze że niekorzystny — fix
            if (computedRR >= 1.5 && saysNegative && !saysPositive) {
                console.log(`[POST-PROCESS] R:R=${computedRR} ale AI napisalo negatywnie — naprawiam summary`);
                parsedAnalysis.summary = parsedAnalysis.summary
                    .replace(/niekorzystny stosunek/gi, 'korzystne parametry')
                    .replace(/nie oferuje optymalnych parametr[oó]w/gi, 'oferuje solidne parametry')
                    .replace(/rekomendujemy czekanie na g[łl][eę]bsz[aą] korekt[eę]/gi, 'warunki wejścia są solidne');
            }
            // Gdy R:R < 1.0 ale AI pisze że korzystny — fix
            if (computedRR < 1.0 && saysPositive && !saysNegative) {
                console.log(`[POST-PROCESS] R:R=${computedRR} ale AI napisalo pozytywnie — naprawiam summary`);
                parsedAnalysis.summary = parsedAnalysis.summary
                    .replace(/korzystn[yeia]/gi, 'wymagający ostrożności')
                    .replace(/solidn[yeia]/gi, 'ograniczony')
                    .replace(/atrakcyjn[yeia]/gi, 'ryzykowny')
                    .replace(/optymaln[yeia]/gi, 'suboptymalne');
            }
        }

        // Anomalie generowane z newsow zebranych przez system (nie AI)
        parsedAnalysis.anomalies = [];
        const allNewsDates = [...new Set(filteredNews.map(n => new Date(n.datetime * 1000).toISOString().split('T')[0]))];
        for (const date of allNewsDates) {
            const dn = filteredNews.filter(n => new Date(n.datetime * 1000).toISOString().split('T')[0] === date);
            parsedAnalysis.anomalies.push({
                date,
                short_desc: `Informacje z rynku (${dn.length})`,
                details: `System przefiltrowal ${dn.length} powiazan wiadomosci z tego dnia:`,
                url: null,
                articles: dn.map(art => ({ headline: art.headline, url: art.url }))
            });
        }

        console.log(`[AI] Done in ${Date.now() - aiStart}ms | Total: ${Date.now() - reqStart}ms`);

        // === P2-A6: RULE-BASED CONSISTENCY VALIDATION ===
        let consistencyFlag = null;
        const aiRec = parsedAnalysis.quant_analysis?.recommendation;
        if (aiRec === 'LONG' && adjustedCompositeScore < 45) {
            consistencyFlag = `Rozbieżność: AI rekomenduje LONG, lecz wynik algorytmiczny to ${adjustedCompositeScore}/100 — sygnały techniczne przeważnie niedźwiedzie.`;
            console.warn(`[CONSISTENCY] LONG rec ale score=${adjustedCompositeScore} — flagging`);
        } else if (aiRec === 'SHORT' && adjustedCompositeScore > 55) {
            consistencyFlag = `Rozbieżność: AI rekomenduje SHORT, lecz wynik algorytmiczny to ${adjustedCompositeScore}/100 — sygnały techniczne przeważnie bycze.`;
            console.warn(`[CONSISTENCY] SHORT rec ale score=${adjustedCompositeScore} — flagging`);
        } else if (conflictSignals.length >= 3 && aiRec === 'LONG') {
            consistencyFlag = `Uwaga: LONG przy ${conflictSignals.length} wykrytych konfliktach sygnałów — ryzyko podwyższone.`;
        }
        if (consistencyFlag && parsedAnalysis.quant_analysis?.confidence_level === 'WYSOKA') {
            parsedAnalysis.quant_analysis.confidence_level = 'SREDNIA';
            consistencyFlag += ' Pewność zdegradowana: WYSOKA→ŚREDNIA.';
        }

        // === I3: Auto-cap confidence at SREDNIA when >=2 conflicting signals ===
        if (conflictSignals.length >= 2 && parsedAnalysis.quant_analysis?.confidence_level === 'WYSOKA') {
            parsedAnalysis.quant_analysis.confidence_level = 'SREDNIA';
            console.log(`[I3] ${conflictSignals.length} conflict signals detected — confidence capped WYSOKA→SREDNIA`);
        }

        // Chart series computed on filtered timeframe history (single source of truth for frontend)
        const csMACD = calculateMACD(history);
        const csBB   = calculateBollingerBands(history);

        // Trend Alignment Matrix — obliczane raz na backendzie, frontend tylko renderuje
        const MATRIX_FRAMES = [
            { label: '1W', days: 10 }, { label: '1M', days: 30 },
            { label: '3M', days: 90 }, { label: '6M', days: 180 }, { label: '1Y', days: 365 },
        ];
        const trend_matrix = MATRIX_FRAMES.map(({ label, days }) => {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
            const slice = allHistory.filter(h => new Date(h.t) >= cutoff);
            if (slice.length < 3) return { label, pct: null, emaSignal: 'N/A', macdSignal: 'N/A', rsiSignal: 'N/A', priceVsEma: 'N/A' };
            const pct = ((slice[slice.length - 1].c - slice[0].c) / slice[0].c) * 100;
            const ema9s  = calculateEMASeries(slice, Math.min(9,  slice.length));
            const ema21s = calculateEMASeries(slice, Math.min(21, slice.length));
            const last9  = ema9s[ema9s.length - 1], last21 = ema21s[ema21s.length - 1];
            const emaSignal = (last9 && last21) ? (last9 > last21 ? 'BULL' : 'BEAR') : 'N/A';
            // Use enough history for MACD calc (need 35+ bars), then look at current values
            const macdLookback = allHistory.filter(h => new Date(h.t) >= new Date(cutoff.getTime() - 120 * 86400000));
            const macdResult = macdLookback.length >= 35 ? calculateMACD(macdLookback) : calculateMACD(allHistory);
            const lm = macdResult.macdSeries?.[macdResult.macdSeries.length - 1];
            const ls = macdResult.signalSeries?.[macdResult.signalSeries.length - 1];
            const macdSignal = (lm != null && ls != null) ? (lm > ls ? 'BULL' : 'BEAR') : 'N/A';
            const sliceRsi = calculateRSI(slice.slice(-Math.max(15, Math.min(slice.length, 30))));
            const rsiSignal = sliceRsi > 65 ? 'OVERBOUGHT' : sliceRsi < 35 ? 'OVERSOLD' : sliceRsi > 55 ? 'BULL' : sliceRsi < 45 ? 'BEAR' : 'NEUTRAL';
            const sliceLastC = slice[slice.length - 1].c;
            const sliceEma200 = slice.length >= 200 ? calculateEMA(slice, 200) : calculateEMA(allHistory, 200);
            const priceVsEma = sliceLastC > sliceEma200 ? 'BULL' : 'BEAR';
            return { label, pct: +pct.toFixed(1), emaSignal, macdSignal, rsiSignal, priceVsEma };
        });

        const chart_series = {
            ema9:   calculateEMASeries(history, 9),
            ema21:  calculateEMASeries(history, 21),
            ema50:  calculateEMASeries(history, 50),
            ema200: calculateEMASeries(history, 200),
            macd:        csMACD.macdSeries,
            macd_signal: csMACD.signalSeries,
            macd_hist:   csMACD.histSeries,
            bb_upper:  csBB.series.map(s => s.upper),
            bb_middle: csBB.series.map(s => s.middle),
            bb_lower:  csBB.series.map(s => s.lower),
            trend_matrix,
        };

        const responseData = {
            analysis: parsedAnalysis,
            history,
            earnings,
            quant_stats: quantStats,
            chart_series,
            ticker: symbol,
            timeframe,
            volatile_days: pctChanges.slice(0, 40).map(v => ({ date: v.date, pct: v.pct })),
            composite_score: adjustedCompositeScore,
            raw_composite_score: compositeScore,
            conflict_signals: conflictSignals,
            scoring_breakdown: scoringBreakdown,
            bull_score: bullScore,
            bear_score: bearScore,
            setup_type: setupType,
            setup_warning: setupWarning,
            fundamentals,
            relative_strength: relativeStrength,
            market_structure: detectMarketStructure(allHistory),
            consistency_flag: consistencyFlag,
            generated_at: new Date().toISOString(),
        };

        analysisCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
        res.json(responseData);

    } catch (e) {
        console.error(`[ERROR] ${e.message}`);
        res.status(500).json({ error: e.message || 'Wewnetrzny blad serwera.' });
    }
});

app.post('/api/stock/analyze-day', async (req, res) => {
    const { ticker, date } = req.body;
    if (!ticker || !date) return res.status(400).end();

    const dayCacheKey = `DAY_${ticker}_${date}`;
    if (dayAnalysisCache.has(dayCacheKey)) {
        const cachedDay = dayAnalysisCache.get(dayCacheKey);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ text: cachedDay.text, cached: true })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
    }

    const cachedBase = analysisCache.get(`${ticker.toUpperCase()}_BASE`);
    const dayNews = (cachedBase?.allNews || []).filter(n => {
        const d = new Date(n.datetime * 1000).toISOString().split('T')[0];
        return d === date;
    });

    const newsInfo = dayNews.length > 0
        ? dayNews.map(n => {
            const desc = n.description ? `\n  Opis: ${n.description.substring(0, 300)}` : '';
            const src = n.source ? ` (${n.source})` : '';
            return `- ${n.headline}${src}${desc}`;
        }).join('\n')
        : 'Brak specyficznego newsa rynkowego (możliwy ruch napędzany szerszym sektorem lub brakiem pokrycia w wybranym źródle).';

    const prompt = `Zadanie: Napisz w 3 zdaniach chłodną, obiektywną analizę dlaczego cena akcji ${ticker} zmieniła się mocno w dniu ${date}.
Dane informacyjne na ten dzień: ${newsInfo}

Wymóg krytyczny: Otrzymujesz surowe dane. Twoja odpowiedź powraca bezpośrednio do użytkownika. NIE używaj myślników, powitań, ani procesu myślowego. Od razu podajesz wnioski końcowe. 

Przykład prawidłowej odpowiedzi:
"Brak istotnych komunikatów ze spółki sugeruje, że wybuch wolumenu jest efektem rotacji kapitału w całym sektorze. Ruch ceny nie ma podłoża fundamentalnego, lecz wynika z korelacji z rynkiem bazowym. Stanowi to typowy szum systemowy, na który nie należy reagować w długim terminie."

Twoja odpowiedź dla ${ticker}:`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || 'gemma-4-31b-it',
            systemInstruction: "Jesteś polskojęzycznym asystentem giełdowym. Wypluwaj jedynie czysty, finałowy tekst. ZABRONIONE JEST PRZEPROWADZANIE PROCESU MYŚLOWEGO ORAZ UŻYWANIE JĘZYKA ANGIELSKIEGO.",
            generationConfig: { temperature: 0.1 }
        });

        const result = await model.generateContentStream(prompt);
        let fullText = '';
        for await (const chunk of result.stream) {
            const text = chunk.text() || '';
            if (text) {
                fullText += text;
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
        }
        dayAnalysisCache.set(dayCacheKey, { timestamp: Date.now(), text: fullText });
        res.write('data: [DONE]\n\n');
    } catch (err) {
        res.write(`data: ${JSON.stringify({ text: 'Błąd AI. Zaskórnik limitowy chmury (Gemma).', error: true })}\n\n`);
        res.write('data: [DONE]\n\n');
    }
    res.end();
});

// --- QUOTE (szybki kurs z cache lub Finnhub) ---
app.get('/api/stock/quote/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase().replace(/[^A-Z0-9.]/g, '');
    if (!symbol) return res.status(400).json({ error: 'Bad symbol' });
    const cached = analysisCache.get(`${symbol}_BASE`);
    if (cached?.allHistory?.length) {
        const last = cached.allHistory[cached.allHistory.length - 1];
        const prev = cached.allHistory[cached.allHistory.length - 2];
        const changePct = prev ? ((last.c - prev.c) / prev.c * 100) : 0;
        return res.json({ symbol, price: last.c, changePct: +changePct.toFixed(2), date: new Date(last.t).toISOString().split('T')[0] });
    }
    try {
        const r = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`, { timeout: 4000 });
        if (!r.data.c) return res.status(404).json({ error: 'Symbol not found' });
        res.json({ symbol, price: r.data.c, changePct: +(r.data.dp || 0).toFixed(2) });
    } catch { res.status(404).json({ error: 'Symbol not found' }); }
});

// --- BACKTEST (Golden Cross strategy na 2Y OHLCV) ---
app.post('/api/stock/backtest', (req, res) => {
    const { ticker, slPct = 7, tpPct = 20 } = req.body;
    const symbol = (ticker || '').toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error: 'Missing ticker' });
    const cached = analysisCache.get(`${symbol}_BASE`);
    if (!cached?.allHistory?.length)
        return res.status(404).json({ error: 'Brak danych. Najpierw uruchom pełną analizę.' });

    const history = cached.allHistory;
    const ema50s  = calculateEMASeries(history, 50);
    const ema200s = calculateEMASeries(history, 200);

    const trades = [];
    let inTrade = false, entryIdx = -1, entryPrice = 0;

    for (let i = 201; i < history.length; i++) {
        if (!ema50s[i] || !ema200s[i] || !ema50s[i-1] || !ema200s[i-1]) continue;
        if (!inTrade) {
            if (ema50s[i-1] <= ema200s[i-1] && ema50s[i] > ema200s[i]) {
                inTrade = true; entryIdx = i; entryPrice = history[i].c;
            }
        } else {
            const curr = history[i].c;
            const pnl  = (curr - entryPrice) / entryPrice * 100;
            const dead = ema50s[i-1] >= ema200s[i-1] && ema50s[i] < ema200s[i];
            if (dead || pnl <= -slPct || pnl >= tpPct) {
                trades.push({
                    entry:      new Date(history[entryIdx].t).toISOString().split('T')[0],
                    exit:       new Date(history[i].t).toISOString().split('T')[0],
                    entryPrice: +entryPrice.toFixed(2),
                    exitPrice:  +curr.toFixed(2),
                    pnlPct:     +pnl.toFixed(1),
                    exitReason: pnl >= tpPct ? 'TP' : pnl <= -slPct ? 'SL' : 'DEATH CROSS',
                    durationDays: i - entryIdx,
                });
                inTrade = false;
            }
        }
    }

    if (!trades.length) return res.json({ symbol, trades: [], message: 'Brak Golden Cross w ostatnich 2 latach.' });

    const wins     = trades.filter(t => t.pnlPct > 0).length;
    const avgRet   = +(trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length).toFixed(1);
    const totalRet = +trades.reduce((s, t) => s + t.pnlPct, 0).toFixed(1);
    const best     = +Math.max(...trades.map(t => t.pnlPct)).toFixed(1);
    const worst    = +Math.min(...trades.map(t => t.pnlPct)).toFixed(1);

    res.json({ symbol, trades, winRate: +(wins / trades.length * 100).toFixed(1), avgRet, totalRet, best, worst, totalTrades: trades.length, slPct, tpPct });
});

} // end setupStockRoutes

// ======================== STANDALONE MODE ========================
const isMain = process.argv[1] && (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server'));
if (isMain) {
  const app = express();
  const PORT = process.env.STOCK_PORT || 3001;
  app.use(cors());
  app.use(express.json());
  setupStockRoutes(app);
  app.listen(PORT, () => console.log(`✅ Stock Analyzer (standalone): http://localhost:${PORT}`));
}