import 'dotenv/config';
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
import axios from 'axios';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { setupDividendRoutes, initDividends } from './dividends.js';
import { setupStockRoutes } from './server.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Mount dividend routes on main server
setupDividendRoutes(app);

// Mount stock/traditional market routes on main server
setupStockRoutes(app);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Gemma 4 + szybki Gemini fallback (bez retry — natychmiast kolejny model)
const AI_MODELS = [
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'gemini-2.0-flash'
];

const aiCache = {};
const AI_CACHE_TTL = 5 * 60 * 1000; // 5 minut

async function generateWithFallback(prompt, systemPrompt) {
  const cacheKey = prompt.substring(0, 200);
  if (aiCache[cacheKey] && (Date.now() - aiCache[cacheKey].ts) < AI_CACHE_TTL) {
    console.log('⚡ AI cache hit');
    return aiCache[cacheKey].text;
  }

  let lastError = null;
  for (const modelName of AI_MODELS) {
    try {
      console.log(`🤖 Próbuję model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      });
      const text = result.response.text();
      console.log(`✅ Model ${modelName} — OK`);
      aiCache[cacheKey] = { text, ts: Date.now() };
      return text;
    } catch (err) {
      console.error(`⚠️ ${modelName}: ${(err.message || '').substring(0, 100)}`);
      lastError = err;
    }
  }
  throw new Error('AI niedostępne. Ostatni błąd: ' + (lastError?.message?.substring(0, 100) || 'nieznany'));
}

const dataCache = {};
const newsCache = {};
const newsEmitter = new EventEmitter();
const CACHE_TTL = 15 * 60 * 1000; // 15 min (avoid CoinGecko 429)
const NEWS_CACHE_TTL = 15 * 60 * 1000;
const NEWS_CHECK_INTERVAL = 5 * 60 * 1000; // Sprawdzaj co 5 minut

const COINGECKO_MAP = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'SOL': 'solana',
  'XRP': 'ripple',
  'BNB': 'binancecoin',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
  'LINK': 'chainlink',
  'AVAX': 'avalanche-2',
  'MATIC': 'matic-network',
  'UNI': 'uniswap',
  'SHIB': 'shiba-inu',
  'ATOM': 'cosmos',
  'NEAR': 'near',
  'POLKA': 'polkadot',
  'DOT': 'polkadot',
  'ICP': 'internet-computer',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'PEPE': 'pepe',
  'FLOKI': 'floki',
  'MEME': 'memecoin',
  'WIF': 'dogwifhat',
  'BONK': 'bonk',
  'JUP': 'jupiter',
  'SAGA': 'saga',
  'GMX': 'gmx',
  'BLUR': 'blur'
};

// Mapowanie tickerów na słowa kluczowe do filtrowania wiadomości Finnhub
const TICKER_KEYWORDS = {
  'BTC': ['bitcoin', 'btc'],
  'ETH': ['ethereum', 'eth', 'ether'],
  'ADA': ['cardano', 'ada'],
  'DOGE': ['dogecoin', 'doge'],
  'SOL': ['solana', 'sol'],
  'XRP': ['ripple', 'xrp'],
  'BNB': ['binance', 'bnb'],
  'LTC': ['litecoin', 'ltc'],
  'BCH': ['bitcoin cash', 'bch'],
  'LINK': ['chainlink', 'link'],
  'AVAX': ['avalanche', 'avax'],
  'MATIC': ['polygon', 'matic'],
  'UNI': ['uniswap', 'uni'],
  'SHIB': ['shiba', 'shib'],
  'ATOM': ['cosmos', 'atom'],
  'NEAR': ['near protocol', 'near'],
  'DOT': ['polkadot', 'dot'],
  'POLKA': ['polkadot'],
  'ICP': ['internet computer', 'icp'],
  'ARB': ['arbitrum', 'arb'],
  'OP': ['optimism'],
  'PEPE': ['pepe'],
  'FLOKI': ['floki'],
  'MEME': ['memecoin', 'meme'],
  'WIF': ['dogwifhat', 'wif'],
  'BONK': ['bonk'],
  'JUP': ['jupiter', 'jup'],
  'SAGA': ['saga'],
  'GMX': ['gmx'],
  'BLUR': ['blur']
};

// ======================== IMPORTANT KEYWORDS ========================

const IMPORTANT_KEYWORDS = {
  'VERY_HIGH': [
    'SEC', 'lawsuit', 'hack', 'vulnerability', 'breach', 'exploit',
    'bankruptcy', 'collapse', 'shutdown', 'delisting', 'banned',
    'fraud', 'scandal', 'investigation', 'arrest', 'crash',
    'bitcoin ETF', 'ethereum ETF', 'regulation', 'approved',
    'partnership', 'acquisition', 'merger', 'IPO', 'listing',
    'upgrade', 'halving', 'fork', 'mainstream adoption'
  ],
  'HIGH': [
    'bull', 'bear', 'pump', 'dump', 'surge', 'rally',
    'drop', 'fall', 'support', 'resistance', 'trend',
    'analysis', 'prediction', 'forecast', 'technical',
    'institutional', 'whale', 'buy', 'sell', 'trading'
  ],
  'MEDIUM': [
    'update', 'release', 'news', 'announcement', 'report',
    'market', 'price', 'volume', 'sentiment', 'fear'
  ]
};

// ======================== WSKAŹNIKI ========================

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  // Pierwsza średnia (SMA)
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  // Wilder smoothing
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calculateSMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1];
  return prices.slice(-period).reduce((a, b) => a + b) / period;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateMACD(prices) {
  if (prices.length < 27) return { macdLine: '0', signalLine: '0', histogram: '0', signal: 'NEUTRALNY' };
  // Iteracyjne EMA12 i EMA26
  const k12 = 2 / 13, k26 = 2 / 27;
  let ema12 = prices.slice(0, 12).reduce((a, b) => a + b) / 12;
  let ema26 = prices.slice(0, 26).reduce((a, b) => a + b) / 26;
  for (let i = 12; i < 26; i++) ema12 = prices[i] * k12 + ema12 * (1 - k12);
  const macdValues = [];
  for (let i = 26; i < prices.length; i++) {
    ema12 = prices[i] * k12 + ema12 * (1 - k12);
    ema26 = prices[i] * k26 + ema26 * (1 - k26);
    macdValues.push(ema12 - ema26);
  }
  // Signal line (EMA9 z MACD)
  const k9 = 2 / 10;
  let signal = macdValues.length >= 9
    ? macdValues.slice(0, 9).reduce((a, b) => a + b) / 9
    : macdValues[macdValues.length - 1];
  for (let i = 9; i < macdValues.length; i++) {
    signal = macdValues[i] * k9 + signal * (1 - k9);
  }
  const macdLine = macdValues[macdValues.length - 1];
  const histogram = macdLine - signal;
  return {
    macdLine: macdLine.toFixed(2),
    signalLine: signal.toFixed(2),
    histogram: histogram.toFixed(2),
    signal: histogram > 0 ? 'BYCZY' : 'NIEDŹWIEDZI'
  };
}

function calculateBollingerBands(closes, period = 20) {
  if (closes.length < period) return { upper: closes[closes.length - 1], middle: closes[closes.length - 1], lower: closes[closes.length - 1], width: 0 };
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: sma + 2 * stdDev,
    middle: sma,
    lower: sma - 2 * stdDev,
    width: ((sma + 2 * stdDev) - (sma - 2 * stdDev)) / sma * 100
  };
}

function calculateATR(candles, period = 14) {
  if (candles.length < 2) return 0;
  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trueRanges.length < period) return trueRanges.reduce((a, b) => a + b) / trueRanges.length;
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

// ADX — siła trendu (0-100, >25 = silny trend)
function calculateADX(candles, period = 14) {
  if (candles.length < period + 1) return { adx: 25, plusDI: 50, minusDI: 50, trend: 'BRAK DANYCH' };

  const trueRanges = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high, low = candles[i].low;
    const prevHigh = candles[i - 1].high, prevLow = candles[i - 1].low, prevClose = candles[i - 1].close;

    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const plusDM = (high - prevHigh) > (prevLow - low) && (high - prevHigh) > 0 ? high - prevHigh : 0;
    const minusDM = (prevLow - low) > (high - prevHigh) && (prevLow - low) > 0 ? prevLow - low : 0;
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  // Wilder smoothed TR, +DM, -DM
  let smoothTR = trueRanges.slice(0, period).reduce((a, b) => a + b);
  let smoothPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b);
  let smoothMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b);

  const dxValues = [];
  for (let i = period; i < trueRanges.length; i++) {
    smoothTR = smoothTR - (smoothTR / period) + trueRanges[i];
    smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDMs[i];
    smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDMs[i];

    const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push({ dx, plusDI, minusDI });
  }

  if (dxValues.length < period) {
    const last = dxValues[dxValues.length - 1] || { dx: 25, plusDI: 50, minusDI: 50 };
    return { adx: last.dx, plusDI: last.plusDI, minusDI: last.minusDI, trend: last.dx > 25 ? (last.plusDI > last.minusDI ? 'SILNY WZROST' : 'SILNY SPADEK') : 'BOCZNY' };
  }

  let adx = dxValues.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i].dx) / period;
  }

  const last = dxValues[dxValues.length - 1];
  let trend = 'BOCZNY';
  if (adx > 25) trend = last.plusDI > last.minusDI ? 'SILNY WZROST' : 'SILNY SPADEK';
  else if (adx > 20) trend = 'SŁABY TREND';

  return { adx: parseFloat(adx.toFixed(1)), plusDI: parseFloat(last.plusDI.toFixed(1)), minusDI: parseFloat(last.minusDI.toFixed(1)), trend };
}

// Stochastic RSI — lepszy overbought/oversold
function calculateStochRSI(closes, rsiPeriod = 14, stochPeriod = 14) {
  if (closes.length < rsiPeriod + stochPeriod + 1) return { k: 50, d: 50, signal: 'NEUTRALNY' };

  // Oblicz serię RSI
  const rsiValues = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= rsiPeriod; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= rsiPeriod;
  avgLoss /= rsiPeriod;
  rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));

  for (let i = rsiPeriod + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (rsiPeriod - 1) + (diff > 0 ? diff : 0)) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + (diff < 0 ? Math.abs(diff) : 0)) / rsiPeriod;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
  }

  if (rsiValues.length < stochPeriod) return { k: 50, d: 50, signal: 'NEUTRALNY' };

  // Stochastic on RSI values
  const kValues = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const window = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const minRSI = Math.min(...window);
    const maxRSI = Math.max(...window);
    kValues.push(maxRSI === minRSI ? 50 : ((rsiValues[i] - minRSI) / (maxRSI - minRSI)) * 100);
  }

  const k = kValues[kValues.length - 1];
  const d = kValues.length >= 3 ? kValues.slice(-3).reduce((a, b) => a + b) / 3 : k;

  let signal = 'NEUTRALNY';
  if (k > 80 && d > 80) signal = 'WYKUPIONY';
  else if (k < 20 && d < 20) signal = 'WYPRZEDANY';
  else if (k > d && k < 80) signal = 'BYCZY';
  else if (k < d && k > 20) signal = 'NIEDŹWIEDZI';

  return { k: parseFloat(k.toFixed(1)), d: parseFloat(d.toFixed(1)), signal };
}

// OBV — On-Balance Volume (potwierdza trend wolumenem)
function calculateOBV(candles) {
  if (candles.length < 2) return { obv: 0, trend: 'BRAK DANYCH', divergence: false };

  let obv = 0;
  const obvValues = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
    obvValues.push(obv);
  }

  // OBV trend (last 10 candles)
  const recent = obvValues.slice(-10);
  const obvTrend = recent[recent.length - 1] > recent[0] ? 'WZROSTOWY' : 'SPADKOWY';

  // Dywergencja: cena rośnie ale OBV spada = bearish divergence
  const priceUp = candles[candles.length - 1].close > candles[Math.max(0, candles.length - 10)].close;
  const obvUp = obvValues[obvValues.length - 1] > obvValues[Math.max(0, obvValues.length - 10)];
  const divergence = priceUp !== obvUp;

  return {
    obv: obv,
    trend: obvTrend,
    divergence,
    divergenceType: divergence ? (priceUp && !obvUp ? 'NIEDŹWIEDZIA' : 'BYCZA') : 'BRAK'
  };
}

// Dywergencja RSI — najsilniejszy sygnał reversal
function detectRSIDivergence(closes, period = 14) {
  if (closes.length < period + 20) return { detected: false, type: 'BRAK' };

  // Oblicz RSI dla ostatnich 20 punktów
  const rsiValues = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    rsiValues.push({ rsi: avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)), price: closes[i] });
  }

  if (rsiValues.length < 10) return { detected: false, type: 'BRAK' };

  const recent = rsiValues.slice(-10);
  const mid = Math.floor(recent.length / 2);

  // Bearish: cena robi wyższy szczyt, RSI niższy szczyt
  const priceHigher = recent[recent.length - 1].price > recent[mid].price;
  const rsiLower = recent[recent.length - 1].rsi < recent[mid].rsi;
  if (priceHigher && rsiLower && recent[recent.length - 1].rsi > 50) {
    return { detected: true, type: 'NIEDŹWIEDZIA (cena ↑ RSI ↓)' };
  }

  // Bullish: cena robi niższy dół, RSI wyższy dół
  const priceLower = recent[recent.length - 1].price < recent[mid].price;
  const rsiHigher = recent[recent.length - 1].rsi > recent[mid].rsi;
  if (priceLower && rsiHigher && recent[recent.length - 1].rsi < 50) {
    return { detected: true, type: 'BYCZA (cena ↓ RSI ↑)' };
  }

  return { detected: false, type: 'BRAK' };
}

function calculateSAR(candles) {
  if (candles.length < 2) return { sar: 0, trend: 'N/A' };

  let sar = candles[0].low;
  let trend = 'UP';
  let af = 0.02;
  let maxAf = 0.2;
  let hp = candles[0].high;
  let lp = candles[0].low;

  for (let i = 1; i < candles.length; i++) {
    if (trend === 'UP') {
      sar = sar + af * (hp - sar);
      if (candles[i].low < sar) {
        trend = 'DOWN';
        sar = hp;
        hp = candles[i].low;
        lp = candles[i].low;
        af = 0.02;
      } else {
        if (candles[i].high > hp) {
          hp = candles[i].high;
          af = Math.min(af + 0.02, maxAf);
        }
        if (candles[i].low < lp) {
          lp = candles[i].low;
        }
      }
    } else {
      sar = sar - af * (sar - lp);
      if (candles[i].high > sar) {
        trend = 'UP';
        sar = lp;
        hp = candles[i].high;
        lp = candles[i].low;
        af = 0.02;
      } else {
        if (candles[i].low < lp) {
          lp = candles[i].low;
          af = Math.min(af + 0.02, maxAf);
        }
        if (candles[i].high > hp) {
          hp = candles[i].high;
        }
      }
    }
  }

  return {
    sar: sar.toFixed(2),
    trend: trend === 'UP' ? 'WZROSTOWY' : 'SPADKOWY',
    signal: trend === 'UP' ? 'BYCZY' : 'NIEDŹWIEDZI'
  };
}

function detectCandlePatterns(candles) {
  if (candles.length < 3) return [];

  const patterns = [];
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const prevPrevCandle = candles[candles.length - 3];

  const bodySize = (c) => Math.abs(c.close - c.open);
  const wickSize = (c) => c.high - c.low;
  const isGreen = (c) => c.close > c.open;

  if (wickSize(lastCandle) === 0) return ['Brak danych'];

  if (isGreen(lastCandle) && bodySize(lastCandle) < wickSize(lastCandle) / 3) {
    patterns.push('🔨 HAMMER - Potencjalny reversal wzrostowy');
  }

  if (!isGreen(lastCandle) && bodySize(lastCandle) < wickSize(lastCandle) / 3) {
    patterns.push('👤 HANGING MAN - Potencjalny reversal spadkowy');
  }

  if (Math.abs(lastCandle.close - lastCandle.open) < wickSize(lastCandle) * 0.05) {
    patterns.push('✝️ DOJI - Indecisja rynkowa');
  }

  if (isGreen(lastCandle) && !isGreen(prevCandle) &&
    lastCandle.close > prevCandle.open && lastCandle.open < prevCandle.close) {
    patterns.push('📈 BULLISH ENGULFING - Silny sygnał wzrostowy');
  }

  if (!isGreen(lastCandle) && isGreen(prevCandle) &&
    lastCandle.close < prevCandle.open && lastCandle.open > prevCandle.close) {
    patterns.push('📉 BEARISH ENGULFING - Silny sygnał spadkowy');
  }

  return patterns.length > 0 ? patterns : ['Brak charakterystycznych formacji'];
}

// ======================== IMPORTANCE SCORING ========================

function calculateImportanceScore(text) {
  const lower = text.toLowerCase();
  let score = 0;

  // Bardzo wysokie
  for (let word of IMPORTANT_KEYWORDS.VERY_HIGH) {
    if (lower.includes(word.toLowerCase())) {
      score += 3;
    }
  }

  // Wysokie
  for (let word of IMPORTANT_KEYWORDS.HIGH) {
    if (lower.includes(word.toLowerCase())) {
      score += 2;
    }
  }

  // Średnie
  for (let word of IMPORTANT_KEYWORDS.MEDIUM) {
    if (lower.includes(word.toLowerCase())) {
      score += 1;
    }
  }

  return score;
}

function getImportanceLevel(score) {
  if (score >= 9) return '🔴 KRYTYCZNA';
  if (score >= 6) return '🟠 BARDZO WAŻNA';
  if (score >= 3) return '🟡 WAŻNA';
  return '🟢 NORMALNA';
}

// ======================== WIADOMOŚCI ========================

// Globalny cache na surowe dane z Finnhub (jeden request dla wszystkich tickerów)
let finnhubRawCache = { data: [], timestamp: 0 };
const FINNHUB_RAW_TTL = 10 * 60 * 1000; // 10 minut

async function fetchFinnhubRaw() {
  if (finnhubRawCache.data.length > 0 && (Date.now() - finnhubRawCache.timestamp) < FINNHUB_RAW_TTL) {
    return finnhubRawCache.data;
  }

  console.log(`📰 Pobieranie globalnych wiadomości z Finnhub...`);
  const newsRes = await axios.get(
    `https://finnhub.io/api/v1/news`,
    {
      params: {
        category: 'crypto',
        token: process.env.FINNHUB_API_KEY
      },
      timeout: 8000
    }
  );

  if (Array.isArray(newsRes.data)) {
    finnhubRawCache = { data: newsRes.data, timestamp: Date.now() };
    console.log(`📰 Finnhub: pobrano ${newsRes.data.length} artykułów globalnych`);
    return newsRes.data;
  }
  return [];
}

async function getCryptoNews(ticker) {
  try {
    if (newsCache[ticker] && (Date.now() - newsCache[ticker].timestamp) < NEWS_CACHE_TTL) {
      return newsCache[ticker].data;
    }

    const allArticles = await fetchFinnhubRaw();

    // Filtruj wiadomości po słowach kluczowych tickera
    const keywords = TICKER_KEYWORDS[ticker.toUpperCase()] || [ticker.toLowerCase()];

    const filtered = allArticles.filter(article => {
      const text = (article.headline + ' ' + (article.summary || '')).toLowerCase();
      return keywords.some(kw => text.includes(kw));
    });

    // Jeśli brak dopasowań, weź ogólne kryptonewsy
    const articlesToUse = filtered.length > 0 ? filtered.slice(0, 10) : allArticles.slice(0, 5);

    const news = articlesToUse.map(article => {
      const fullText = article.headline + ' ' + (article.summary || '');
      const importance = calculateImportanceScore(fullText);
      const importanceLevel = getImportanceLevel(importance);

      return {
        title: article.headline,
        body: (article.summary || '').substring(0, 150) + '...',
        source: article.source,
        url: article.url,
        image: article.image || null,
        published: new Date(article.datetime * 1000).toLocaleString('pl-PL'),
        sentiment: analyzeSentiment(fullText),
        importance: importance,
        importanceLevel: importanceLevel,
        isImportant: importance >= 3
      };
    }).sort((a, b) => b.importance - a.importance);

    newsCache[ticker] = {
      data: news,
      timestamp: Date.now()
    };

    // Emituj ważne wiadomości
    const importantNews = news.filter(n => n.isImportant);
    if (importantNews.length > 0) {
      importantNews.forEach(n => {
        newsEmitter.emit('important-news', {
          ticker,
          ...n
        });
      });
    }

    console.log(`📰 Finnhub: ${news.length} artykułów dla ${ticker}`);
    return news;
  } catch (err) {
    console.error(`⚠️ Finnhub News error: ${err.message}`);
    return [];
  }
}

function analyzeSentiment(text) {
  const positiveWords = ['moon', 'pump', 'bull', 'surge', 'gain', 'rally', 'partnership', 'launch', 'bullish', 'up', 'positive', 'approved', 'success'];
  const negativeWords = ['crash', 'dump', 'bear', 'drop', 'loss', 'bearish', 'down', 'hack', 'scam', 'fraud', 'negative', 'rejected', 'failure'];

  const lower = text.toLowerCase();
  let positive = positiveWords.filter(word => lower.includes(word)).length;
  let negative = negativeWords.filter(word => lower.includes(word)).length;

  if (positive > negative) return '📈 POZYTYWNA';
  if (negative > positive) return '📉 NEGATYWNA';
  return '➡️ NEUTRALNA';
}

// ======================== FEAR & GREED ========================

let fngCache = { value: null, timestamp: 0 };
let fngHistoryCache = { data: null, timestamp: 0 };

async function getFearAndGreed() {
  if (fngCache.value && (Date.now() - fngCache.timestamp) < 30 * 60 * 1000) {
    return fngCache.value;
  }
  try {
    const res = await axios.get('https://api.alternative.me/fng/', { timeout: 5000 });
    const data = res.data?.data?.[0];
    if (data) {
      fngCache = { value: { value: parseInt(data.value), classification: data.value_classification }, timestamp: Date.now() };
      return fngCache.value;
    }
  } catch (e) {
    console.log('⚠️ Fear & Greed API niedostępne');
  }
  return { value: 50, classification: 'Neutral' };
}

async function getFearAndGreedHistory(days = 30) {
  if (fngHistoryCache.data && (Date.now() - fngHistoryCache.timestamp) < 60 * 60 * 1000) {
    return fngHistoryCache.data;
  }
  try {
    const res = await axios.get(`https://api.alternative.me/fng/?limit=${days}`, { timeout: 8000 });
    if (res.data?.data) {
      const series = res.data.data.map(d => ({
        value: parseInt(d.value),
        timestamp: parseInt(d.timestamp) * 1000,
        classification: d.value_classification
      })).reverse(); // oldest first
      fngHistoryCache = { data: series, timestamp: Date.now() };
      return series;
    }
  } catch (e) {
    console.log('⚠️ Fear & Greed History API niedostępne');
  }
  return [];
}

function makeDayKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function buildSentimentSeries(chartData, fngHistory, news) {
  // Map F&G data by UTC date key (YYYY-MM-DD) for reliable matching
  const fngByDay = {};
  for (const fg of fngHistory) {
    const dayKey = makeDayKey(new Date(fg.timestamp));
    const val = parseInt(fg.value, 10);
    if (!isNaN(val)) fngByDay[dayKey] = val;
  }

  const fngKeys = Object.keys(fngByDay);
  const chartKeys = chartData.slice(0, 5).map(c => c.timestamp ? makeDayKey(new Date(c.timestamp * 1000)) : '?');
  console.log(`📊 Sentiment DEBUG: fngByDay=${fngKeys.length} keys [${fngKeys.slice(0, 5).join(', ')}], chartDays=[${chartKeys.join(', ')}]`);

  // News sentiment score: +1 positive, -1 negative, 0 neutral
  const newsScoreTotal = news.reduce((acc, n) => {
    if (n.sentiment?.includes('POZYTYWNA')) return acc + 1;
    if (n.sentiment?.includes('NEGATYWNA')) return acc - 1;
    return acc;
  }, 0);
  const newsNorm = news.length > 0 ? Math.max(-1, Math.min(1, newsScoreTotal / Math.max(news.length, 1))) : 0;

  let matched = 0;
  // Build per-candle sentiment (0-100 scale matching F&G)
  const series = chartData.map((candle) => {
    let fgVal;
    if (candle.timestamp) {
      const dayKey = makeDayKey(new Date(candle.timestamp * 1000));
      fgVal = fngByDay[dayKey];
      if (fgVal !== undefined) matched++;
    }
    if (fgVal === undefined) fgVal = 50; // default neutral

    // Ensure numeric
    fgVal = parseInt(fgVal, 10) || 50;

    // Blend F&G (80%) with news sentiment (20%) for combined score
    const newsComponent = (newsNorm + 1) * 50; // convert -1..1 to 0..100
    const combined = Math.round(fgVal * 0.8 + newsComponent * 0.2);
    return Math.max(0, Math.min(100, combined));
  });
  console.log(`📊 Sentiment: ${matched}/${chartData.length} matched | sample values: [${series.slice(0, 5).join(', ')}]`);
  return series;
}

// ======================== COMPOSITE SCORING (DYNAMIC WEIGHTS) ========================

function getMarketRegime(adxValue) {
  if (adxValue > 25) return { name: 'TRENDOWY', weights: { trend: 50, momentum: 20, volume: 18, sentiment: 12 } };
  if (adxValue > 20) return { name: 'SŁABY TREND', weights: { trend: 40, momentum: 25, volume: 20, sentiment: 15 } };
  return { name: 'BOCZNY', weights: { trend: 25, momentum: 35, volume: 25, sentiment: 15 } };
}

function calculateCompositeScore(data) {
  const regime = getMarketRegime(data.adx?.adx || 20);
  const weights = regime.weights;
  let signals = { bullish: 0, bearish: 0, neutral: 0 };

  // ── TREND CATEGORY (EMA, SMA, ADX, SAR) ──
  let trendRaw = 0;
  const trendSignals = [];

  if (data.ema12 > data.ema26) { trendRaw += 25; signals.bullish++; trendSignals.push('EMA12 > EMA26 (byczy cross)'); }
  else { trendRaw -= 25; signals.bearish++; trendSignals.push('EMA12 < EMA26 (niedźwiedzi cross)'); }

  if (data.sma20 > data.sma50) { trendRaw += 25; signals.bullish++; trendSignals.push('SMA20 > SMA50 (złoty krzyż)'); }
  else { trendRaw -= 25; signals.bearish++; trendSignals.push('SMA20 < SMA50 (krzyż śmierci)'); }

  if (data.adx?.adx > 25) {
    if (data.adx.plusDI > data.adx.minusDI) { trendRaw += 30; signals.bullish++; trendSignals.push(`ADX ${data.adx.adx} silny wzrost`); }
    else { trendRaw -= 30; signals.bearish++; trendSignals.push(`ADX ${data.adx.adx} silny spadek`); }
  } else { signals.neutral++; trendSignals.push(`ADX ${data.adx?.adx || '?'} brak silnego trendu`); }

  if (data.sar?.signal === 'BYCZY') { trendRaw += 20; signals.bullish++; trendSignals.push('SAR byczy'); }
  else { trendRaw -= 20; signals.bearish++; trendSignals.push('SAR niedźwiedzi'); }

  trendRaw = Math.max(-100, Math.min(100, trendRaw));

  // ── MOMENTUM CATEGORY (RSI, MACD, StochRSI) ──
  let momentumRaw = 0;
  const momentumSignals = [];

  if (data.rsi < 30) { momentumRaw += 35; signals.bullish++; momentumSignals.push(`RSI ${data.rsi?.toFixed(0)} wyprzedany → KUPUJ`); }
  else if (data.rsi > 70) { momentumRaw -= 35; signals.bearish++; momentumSignals.push(`RSI ${data.rsi?.toFixed(0)} wykupiony → SPRZEDAJ`); }
  else if (data.rsi > 50) { momentumRaw += 10; signals.bullish++; momentumSignals.push(`RSI ${data.rsi?.toFixed(0)} lekko byczy`); }
  else { momentumRaw -= 10; signals.bearish++; momentumSignals.push(`RSI ${data.rsi?.toFixed(0)} lekko niedźwiedzi`); }

  if (data.macd?.signal === 'BYCZY') { momentumRaw += 35; signals.bullish++; momentumSignals.push('MACD byczy crossover'); }
  else { momentumRaw -= 35; signals.bearish++; momentumSignals.push('MACD niedźwiedzi'); }

  if (data.stochRsi?.signal === 'WYPRZEDANY') { momentumRaw += 30; signals.bullish++; momentumSignals.push('StochRSI wyprzedany'); }
  else if (data.stochRsi?.signal === 'WYKUPIONY') { momentumRaw -= 30; signals.bearish++; momentumSignals.push('StochRSI wykupiony'); }
  else if (data.stochRsi?.signal === 'BYCZY') { momentumRaw += 15; signals.bullish++; momentumSignals.push('StochRSI byczy'); }
  else if (data.stochRsi?.signal === 'NIEDŹWIEDZI') { momentumRaw -= 15; signals.bearish++; momentumSignals.push('StochRSI niedźwiedzi'); }

  momentumRaw = Math.max(-100, Math.min(100, momentumRaw));

  // ── VOLUME CATEGORY (OBV, BB, Volume) ──
  let volumeRaw = 0;
  const volumeSignals = [];

  if (data.obv?.divergence) {
    if (data.obv.divergenceType === 'BYCZA') { volumeRaw += 35; signals.bullish++; volumeSignals.push('Dywergencja OBV bycza'); }
    else { volumeRaw -= 35; signals.bearish++; volumeSignals.push('Dywergencja OBV niedźwiedzia'); }
  } else { volumeSignals.push('OBV brak dywergencji'); }

  if (data.rsiDivergence?.detected) {
    if (data.rsiDivergence.type.includes('BYCZA')) { volumeRaw += 30; signals.bullish++; volumeSignals.push('⚠️ Dywergencja RSI BYCZA'); }
    else { volumeRaw -= 30; signals.bearish++; volumeSignals.push('⚠️ Dywergencja RSI NIEDŹWIEDZIA'); }
  }

  if (data.price < data.bb?.lower) { volumeRaw += 25; signals.bullish++; volumeSignals.push('Cena pod dolnym Bollingerem'); }
  else if (data.price > data.bb?.upper) { volumeRaw -= 25; signals.bearish++; volumeSignals.push('Cena nad górnym Bollingerem'); }
  else { volumeSignals.push('Cena w Bollinger Bands'); }

  if (data.volume > data.avgVolume * 1.5) { volumeRaw += 10; volumeSignals.push('Wolumen podwyższony'); }
  else if (data.volume < data.avgVolume * 0.5) { volumeRaw -= 10; volumeSignals.push('Wolumen niski'); }

  volumeRaw = Math.max(-100, Math.min(100, volumeRaw));

  // ── SENTIMENT CATEGORY (Fear & Greed, News) ──
  let sentimentRaw = 0;
  const sentimentSignals = [];

  if (data.fearGreed?.value < 25) { sentimentRaw += 40; sentimentSignals.push(`Fear & Greed: ${data.fearGreed.value} (Extreme Fear → szansa)`); }
  else if (data.fearGreed?.value < 40) { sentimentRaw += 15; sentimentSignals.push(`Fear & Greed: ${data.fearGreed.value} (Fear)`); }
  else if (data.fearGreed?.value > 75) { sentimentRaw -= 40; sentimentSignals.push(`Fear & Greed: ${data.fearGreed.value} (Extreme Greed → ryzyko)`); }
  else if (data.fearGreed?.value > 60) { sentimentRaw -= 15; sentimentSignals.push(`Fear & Greed: ${data.fearGreed.value} (Greed)`); }
  else { sentimentSignals.push(`Fear & Greed: ${data.fearGreed?.value || '?'} (Neutral)`); }

  // News sentiment aggregate
  if (data.news && data.news.length > 0) {
    const posNews = data.news.filter(n => n.sentiment?.includes('POZYTYWNA')).length;
    const negNews = data.news.filter(n => n.sentiment?.includes('NEGATYWNA')).length;
    const newsBias = posNews - negNews;
    if (newsBias >= 2) { sentimentRaw += 30; sentimentSignals.push(`Newsy: ${posNews} pozytywnych vs ${negNews} negatywnych`); }
    else if (newsBias <= -2) { sentimentRaw -= 30; sentimentSignals.push(`Newsy: ${negNews} negatywnych vs ${posNews} pozytywnych`); }
    else { sentimentSignals.push(`Newsy: mieszane (${posNews}+ / ${negNews}-)`); }
  }

  sentimentRaw = Math.max(-100, Math.min(100, sentimentRaw));

  // ── FINAL COMPOSITE (weighted sum) ──
  const trendContrib = +(trendRaw * weights.trend / 100).toFixed(1);
  const momentumContrib = +(momentumRaw * weights.momentum / 100).toFixed(1);
  const volumeContrib = +(volumeRaw * weights.volume / 100).toFixed(1);
  const sentimentContrib = +(sentimentRaw * weights.sentiment / 100).toFixed(1);

  const finalScore = Math.round(trendContrib + momentumContrib + volumeContrib + sentimentContrib);
  const normalized = Math.max(-100, Math.min(100, finalScore));

  // Confidence = weighted function of score strength + signal agreement
  const signalAgreement = Math.max(signals.bullish, signals.bearish) / Math.max(1, signals.bullish + signals.bearish + signals.neutral);
  const confidence = Math.min(95, Math.round(Math.abs(normalized) * 0.6 + signalAgreement * 100 * 0.4));

  let decision;
  if (confidence < 40) {
    decision = 'OBSERWUJ';
  } else if (normalized > 50) decision = 'KUPUJ';
  else if (normalized > 25) decision = 'LEKKI KUPUJ';
  else if (normalized < -50) decision = 'SPRZEDAJ';
  else if (normalized < -25) decision = 'LEKKI SPRZEDAJ';
  else decision = confidence < 60 ? 'OBSERWUJ' : 'TRZYMAJ';

  const risk = Math.abs(normalized) < 20 ? 'wysokie' : Math.abs(normalized) < 50 ? 'średnie' : 'niskie';

  const allDetails = [];
  if (Math.abs(trendContrib) > 5) allDetails.push(trendSignals[0]);
  if (Math.abs(momentumContrib) > 5) allDetails.push(momentumSignals[0]);
  if (Math.abs(volumeContrib) > 5) allDetails.push(volumeSignals[0]);
  if (Math.abs(sentimentContrib) > 3) allDetails.push(sentimentSignals[0]);

  return {
    score: normalized,
    decision,
    confidence,
    risk,
    signals,
    details: allDetails,
    regime: regime.name,
    weights,
    breakdown: {
      trend: { raw: trendRaw, weight: weights.trend, contribution: trendContrib, signals: trendSignals },
      momentum: { raw: momentumRaw, weight: weights.momentum, contribution: momentumContrib, signals: momentumSignals },
      volume: { raw: volumeRaw, weight: weights.volume, contribution: volumeContrib, signals: volumeSignals },
      sentiment: { raw: sentimentRaw, weight: weights.sentiment, contribution: sentimentContrib, signals: sentimentSignals }
    },
    formula: `Score = T(${trendRaw})×${weights.trend}% + M(${momentumRaw})×${weights.momentum}% + V(${volumeRaw})×${weights.volume}% + S(${sentimentRaw})×${weights.sentiment}% = ${normalized}`
  };
}

// ======================== FIBONACCI ========================

function calculateFibonacci(high, low) {
  const diff = high - low;
  return [
    { level: 0, price: +low.toFixed(2), label: '0%' },
    { level: 0.236, price: +(low + diff * 0.236).toFixed(2), label: '23.6%' },
    { level: 0.382, price: +(low + diff * 0.382).toFixed(2), label: '38.2%' },
    { level: 0.5, price: +(low + diff * 0.5).toFixed(2), label: '50%' },
    { level: 0.618, price: +(low + diff * 0.618).toFixed(2), label: '61.8%' },
    { level: 0.786, price: +(low + diff * 0.786).toFixed(2), label: '78.6%' },
    { level: 1, price: +high.toFixed(2), label: '100%' }
  ];
}

// ======================== BACKTEST (ROLLING WINDOW — NO LEAKAGE) ========================

function calculateBacktest(candles) {
  if (!candles || candles.length < 16) return { accuracy: 0, totalTrades: 0, avgReturnPerSignal: 0, equityCurve: [100], disclaimer: 'Za mało danych na backtest.' };

  const results = [];
  // Start from day 14 (need 14+ candles for RSI) to day n-1 (need next day for result)
  for (let i = 14; i < candles.length - 1; i++) {
    const slice = candles.slice(0, i + 1); // ONLY data up to this day — NO leakage
    const closes = slice.map(c => c.close);
    const price = closes[closes.length - 1];

    // Calculate indicators on LIMITED dataset
    const rsi = calculateRSI(closes);
    const macd = calculateMACD(closes);
    const sar = calculateSAR(slice);
    const adx = calculateADX(slice);
    const stochRsi = calculateStochRSI(closes);
    const obv = calculateOBV(slice);
    const bb = calculateBollingerBands(closes);
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const rsiDiv = detectRSIDivergence(closes);

    // Composite score from limited data (no Fear&Greed or news — those are real-time only)
    const miniData = {
      rsi, macd, sar, adx, stochRsi, obv, bb, ema12, ema26, sma20, sma50,
      rsiDivergence: rsiDiv, price,
      fearGreed: { value: 50 }, // neutral placeholder
      volume: slice[slice.length - 1]?.volume || 0,
      avgVolume: slice.reduce((s, c) => s + (c.volume || 0), 0) / slice.length,
      news: []
    };
    const composite = calculateCompositeScore(miniData);

    // Result: what happened NEXT day
    const nextDayReturn = (candles[i + 1].close - candles[i].close) / candles[i].close * 100;
    const isTrade = Math.abs(composite.score) > 10; // only clear signals count
    const signalCorrect = isTrade
      ? (composite.score > 10 && nextDayReturn > 0) || (composite.score < -10 && nextDayReturn < 0)
      : true; // HOLD = not a trade

    results.push({
      day: i,
      signal: composite.decision,
      score: composite.score,
      nextDayReturn: +nextDayReturn.toFixed(3),
      correct: signalCorrect,
      isTrade
    });
  }

  const trades = results.filter(r => r.isTrade);
  const correct = trades.filter(r => r.correct);
  const avgReturn = trades.length > 0
    ? trades.reduce((sum, r) => sum + (r.score > 0 ? r.nextDayReturn : -r.nextDayReturn), 0) / trades.length
    : 0;

  // Mini equity curve (cumulative returns)
  let equity = 100;
  let maxEquity = 100;
  let maxDrawdown = 0;
  const equityCurve = [100];
  trades.forEach(t => {
    const ret = t.score > 0 ? t.nextDayReturn : -t.nextDayReturn;
    equity *= (1 + ret / 100);
    equityCurve.push(+equity.toFixed(2));

    if (equity > maxEquity) {
      maxEquity = equity;
    }
    const currentDrawdown = ((maxEquity - equity) / maxEquity) * 100;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
  });

  return {
    accuracy: trades.length > 0 ? +(correct.length / trades.length * 100).toFixed(1) : 0,
    totalTrades: trades.length,
    correctTrades: correct.length,
    avgReturnPerSignal: +avgReturn.toFixed(2),
    maxDrawdown: -Number(maxDrawdown.toFixed(1)),
    equityCurve,
    disclaimer: 'Backtest na danych historycznych 30D. Wyniki przeszłe nie gwarantują przyszłych.'
  };
}

// ======================== SCENARIOS (DATA-DRIVEN PROBABILITIES) ========================

function generateScenarios(data) {
  const { price, atr, composite, resistance1, support1, support2, resistance2, currency } = data;
  const normalizedScore = composite.score;

  // Base probability = transformation of composite score
  // Score +50 → ~65% bullish, Score 0 → ~50/50, Score -50 → ~65% bearish
  const bullishProb = Math.round(50 + normalizedScore * 0.3);

  // Volatility factor (ATR% of price)
  const atrPercent = price > 0 ? (atr / price) * 100 : 2;
  const extremeProb = Math.round(Math.min(20, Math.max(5, atrPercent * 3)));

  const isBullish = normalizedScore > 0;

  // Normalize: base + alt + extreme = 100%
  const rawBase = isBullish ? bullishProb : (100 - bullishProb);
  const baseProb = Math.max(30, Math.min(70, rawBase - Math.floor(extremeProb / 2)));
  const altProb = Math.max(10, 100 - baseProb - extremeProb);

  return {
    base: {
      label: 'Scenariusz bazowy',
      probability: baseProb,
      target: isBullish ? +(price + atr * 1.5).toFixed(2) : +(price - atr * 1.5).toFixed(2),
      invalidation: isBullish ? +support1.toFixed(2) : +resistance1.toFixed(2),
      condition: isBullish
        ? `Utrzymanie powyżej ${support1.toFixed(0)} ${currency}`
        : `Utrzymanie poniżej ${resistance1.toFixed(0)} ${currency}`,
      direction: isBullish ? 'bullish' : 'bearish'
    },
    alternative: {
      label: 'Scenariusz alternatywny',
      probability: altProb,
      target: isBullish ? +(price - atr * 1.5).toFixed(2) : +(price + atr * 1.5).toFixed(2),
      invalidation: isBullish ? +resistance1.toFixed(2) : +support1.toFixed(2),
      condition: isBullish
        ? `Przełamanie ${support1.toFixed(0)} w dół`
        : `Przełamanie ${resistance1.toFixed(0)} w górę`,
      direction: isBullish ? 'bearish' : 'bullish'
    },
    extreme: {
      label: 'Scenariusz ekstremalny',
      probability: extremeProb,
      target: +(price - atr * 3).toFixed(2),
      condition: `Przełamanie ${support2.toFixed(0)} (S2)`,
      direction: 'bearish'
    },
    methodology: `Prawdopodobieństwa: composite score (${normalizedScore}) + zmienność ATR (${atrPercent.toFixed(1)}%). Reżim: ${composite.regime}.`
  };
}

// ======================== RISK MANAGEMENT (LINKED TO SCENARIOS) ========================

function calculateRiskManagement(data, scenarios) {
  const { price, atr } = data;
  const base = scenarios.base;
  const isLong = base.direction === 'bullish';

  // Primary SL = invalidation of base scenario
  let stopLoss = +base.invalidation;
  let takeProfit1 = +base.target;

  // Sanity check: SL must be on correct side of price
  // For LONG: SL < price, TP > price
  // For SHORT: SL > price, TP < price
  if (isLong) {
    if (stopLoss >= price) stopLoss = +(price - atr * 2).toFixed(2);
    if (takeProfit1 <= price) takeProfit1 = +(price + atr * 1.5).toFixed(2);
  } else {
    if (stopLoss <= price) stopLoss = +(price + atr * 2).toFixed(2);
    if (takeProfit1 >= price) takeProfit1 = +(price - atr * 1.5).toFixed(2);
  }

  // TP2 = extended target (3x ATR)
  const takeProfit2 = isLong
    ? +(price + atr * 3).toFixed(2)
    : +(price - atr * 3).toFixed(2);

  // R:R = |TP - Entry| / |Entry - SL|
  const risk = Math.abs(price - stopLoss);
  const reward1 = Math.abs(takeProfit1 - price);
  const reward2 = Math.abs(takeProfit2 - price);

  // If R/R < 1.0, tighten SL using ATR to guarantee minimum R/R of 1.0
  if (risk > 0 && reward1 / risk < 1.0) {
    const tighterSL = isLong
      ? +(price - reward1).toFixed(2)       // SL = entry - reward (R/R = 1.0)
      : +(price + reward1).toFixed(2);
    stopLoss = tighterSL;
  }

  const finalRisk = Math.abs(price - stopLoss);
  const rrRatio1 = finalRisk > 0 ? +(reward1 / finalRisk).toFixed(2) : 0;
  const rrRatio2 = finalRisk > 0 ? +(reward2 / finalRisk).toFixed(2) : 0;

  // Max loss %
  const maxLossPercent = price > 0 ? +((finalRisk / price) * 100).toFixed(2) : 0;

  // Position size recommendation
  let positionSize;
  if (maxLossPercent < 3) positionSize = '2-5% portfela';
  else if (maxLossPercent < 5) positionSize = '1-3% portfela';
  else positionSize = '0.5-1% portfela (wysokie ryzyko)';

  // Trade readiness filter
  const tradeReady = rrRatio1 >= 1.5;
  let tradeReason = '';
  if (!tradeReady) {
    tradeReason = `Słaby R/R (${rrRatio1}:1 < 1.5:1). Brak optymalnych warunków do wejścia.`;
  }

  return {
    entry: +price.toFixed(2),
    stopLoss: +stopLoss,
    takeProfit1: +takeProfit1,
    takeProfit2,
    riskRewardRatio1: rrRatio1,
    riskRewardRatio2: rrRatio2,
    maxLossPercent,
    positionSize,
    direction: base.direction,
    tradeReady,
    tradeReason,
    kMultiplier: finalRisk > 0 ? +(finalRisk / atr).toFixed(1) : 2.0,
    methodology: `SL = invalidacja scenariusza bazowego (skorygowany dla min R/R ≥ 1.0). TP1 = target bazowy. TP2 = 3×ATR. Kierunek: ${isLong ? 'LONG' : 'SHORT'}.`
  };
}

// ======================== RETRY HELPER ========================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function axiosWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, options);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
        console.log(`⏳ API 429 rate limit — retry ${attempt + 1}/${maxRetries} po ${(delay / 1000).toFixed(1)}s`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

// ======================== MACRO CONTEXT ========================

let macroCache = { data: null, timestamp: 0 };
const MACRO_CACHE_TTL = 30 * 60 * 1000; // 30 min

async function getMarketContext() {
  if (macroCache.data && (Date.now() - macroCache.timestamp) < MACRO_CACHE_TTL) {
    return macroCache.data;
  }
  try {
    const globalRes = await axiosWithRetry('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
    const gd = globalRes.data?.data;
    const result = {
      btcDominance: gd?.market_cap_percentage?.btc ? +gd.market_cap_percentage.btc.toFixed(1) : null,
      ethDominance: gd?.market_cap_percentage?.eth ? +gd.market_cap_percentage.eth.toFixed(1) : null,
      totalMarketCap: gd?.total_market_cap?.usd || null,
      marketCapChange24h: gd?.market_cap_change_percentage_24h_usd ? +gd.market_cap_change_percentage_24h_usd.toFixed(2) : null,
      activeCryptocurrencies: gd?.active_cryptocurrencies || null,
      fedRate: '5.25-5.50%',
      fedRateUpdated: '2024-07-31',
      disclaimer: 'Dane makro: CoinGecko Global. FED rate aktualizowany ręcznie.'
    };
    macroCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (e) {
    console.log('⚠️ Macro context niedostępny');
    return { btcDominance: null, totalMarketCap: null, fedRate: '5.25-5.50%', disclaimer: 'Makro niedostępne' };
  }
}

// ======================== NEWS IMPACT ENRICHMENT (DETERMINISTIC) ========================

function enrichNewsWithImpact(newsArray) {
  return newsArray.map(n => {
    const direction = n.sentiment?.includes('POZYTYWNA') ? 'bullish'
      : n.sentiment?.includes('NEGATYWNA') ? 'bearish'
        : 'neutral';
    const directionConfidence = Math.min(70, 30 + (n.importance || 0) * 5); // CAPPED at 70%
    const impact = n.importance >= 6 ? 'HIGH' : n.importance >= 3 ? 'MEDIUM' : 'LOW';
    const dirLabel = direction === 'bullish' ? '📈 wzrostowy' : direction === 'bearish' ? '📉 spadkowy' : '➡️ neutralny';
    const shortSummary = `${n.title.substring(0, 60)}${n.title.length > 60 ? '...' : ''} → ${dirLabel} (${directionConfidence}%)`;

    return {
      ...n,
      impact,
      direction,
      directionConfidence,
      shortSummary
    };
  });
}

// ======================== NEWS AGGREGATION SCORE ========================

function calculateNewsAggregation(enrichedNews) {
  if (!enrichedNews || enrichedNews.length === 0) {
    return { score: 0, label: 'Brak danych', direction: 'neutral', totalNews: 0, bullishCount: 0, bearishCount: 0, neutralCount: 0, avgConfidence: 0, topImpact: [] };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  const confidences = [];

  enrichedNews.forEach(n => {
    // Weight by importance (higher importance = more weight)
    const weight = (n.importance || 1);
    const dirValue = n.direction === 'bullish' ? 1 : n.direction === 'bearish' ? -1 : 0;
    weightedSum += dirValue * weight;
    totalWeight += weight;

    if (n.direction === 'bullish') bullishCount++;
    else if (n.direction === 'bearish') bearishCount++;
    else neutralCount++;

    if (n.directionConfidence) confidences.push(n.directionConfidence);
  });

  // Normalize to -100..+100
  const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  const score = Math.round(Math.max(-100, Math.min(100, rawScore)));
  const avgConfidence = confidences.length > 0 ? Math.round(confidences.reduce((a, b) => a + b) / confidences.length) : 0;

  let label;
  if (score > 30) label = 'Silnie pozytywne';
  else if (score > 10) label = 'Pozytywne';
  else if (score < -30) label = 'Silnie negatywne';
  else if (score < -10) label = 'Negatywne';
  else label = 'Neutralne';

  // Top impact news (HIGH only)
  const topImpact = enrichedNews.filter(n => n.impact === 'HIGH').slice(0, 3).map(n => ({
    title: n.title.substring(0, 80),
    direction: n.direction,
    confidence: n.directionConfidence
  }));

  return {
    score,
    label,
    direction: score > 10 ? 'bullish' : score < -10 ? 'bearish' : 'neutral',
    totalNews: enrichedNews.length,
    bullishCount,
    bearishCount,
    neutralCount,
    avgConfidence,
    topImpact
  };
}

// ======================== OVERLAY SERIES ========================

function calculateRSISeries(closes, period = 14) {
  const result = new Array(Math.min(period, closes.length)).fill(null);
  if (closes.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;
  result.push(avgLoss === 0 ? 100 : +(100 - (100 / (1 + avgGain / avgLoss))).toFixed(2));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    result.push(avgLoss === 0 ? 100 : +(100 - (100 / (1 + avgGain / avgLoss))).toFixed(2));
  }
  return result;
}

function calculateOverlayEMASeries(prices, period) {
  const result = new Array(Math.min(period - 1, prices.length)).fill(null);
  if (prices.length < period) return result;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
  result.push(+ema.toFixed(2));
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    result.push(+ema.toFixed(2));
  }
  return result;
}

function calculateOverlaySMASeries(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const slice = prices.slice(i - period + 1, i + 1);
    result.push(+(slice.reduce((a, b) => a + b) / period).toFixed(2));
  }
  return result;
}

function calculateOverlayBBSeries(closes, period = 20) {
  const result = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push({ upper: null, middle: null, lower: null }); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b) / period;
    const stdDev = Math.sqrt(slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period);
    result.push({ upper: +(sma + 2 * stdDev).toFixed(2), middle: +sma.toFixed(2), lower: +(sma - 2 * stdDev).toFixed(2) });
  }
  return result;
}

// ======================== MICRO/MACRO TREND ========================

function analyzeMicroTrend(data) {
  let score = 0;
  const details = [];
  if (data.rsi > 60) { score += 2; details.push('RSI > 60 (momentum byczy)'); }
  else if (data.rsi < 40) { score -= 2; details.push('RSI < 40 (momentum niedźwiedzi)'); }
  else { details.push('RSI neutralne'); }
  if (data.stochRsi.k > data.stochRsi.d) { score += 1; details.push('StochRSI K > D (byczy)'); }
  else { score -= 1; details.push('StochRSI K < D (niedźwiedzi)'); }
  const hist = parseFloat(data.macd.histogram);
  if (hist > 0) { score += 2; details.push('MACD histogram +'); }
  else { score -= 2; details.push('MACD histogram \u2212'); }
  if (data.sar.signal === 'BYCZY') { score += 1; details.push('SAR byczy'); }
  else { score -= 1; details.push('SAR niedźwiedzi'); }
  let rec;
  if (score >= 4) rec = 'KUPUJ';
  else if (score >= 2) rec = 'LEKKI KUPUJ';
  else if (score <= -4) rec = 'SPRZEDAJ';
  else if (score <= -2) rec = 'LEKKI SPRZEDAJ';
  else rec = 'TRZYMAJ';
  return { score, recommendation: rec, details, timeframe: '1-7 dni' };
}

function analyzeMacroTrend(data) {
  let score = 0;
  const details = [];
  if (data.sma20 > data.sma50) { score += 2; details.push('SMA20 > SMA50 (z\u0142oty krzy\u017c)'); }
  else { score -= 2; details.push('SMA20 < SMA50 (krzy\u017c \u015bmierci)'); }
  if (data.ema12 > data.ema26) { score += 2; details.push('EMA12 > EMA26'); }
  else { score -= 2; details.push('EMA12 < EMA26'); }
  if (data.adx.adx > 25) {
    if (data.adx.plusDI > data.adx.minusDI) { score += 2; details.push('ADX ' + data.adx.adx + ' silny wzrost'); }
    else { score -= 2; details.push('ADX ' + data.adx.adx + ' silny spadek'); }
  } else { details.push('ADX ' + data.adx.adx + ' \u2014 brak silnego trendu'); }
  if (data.price > data.sma50) { score += 1; details.push('Cena > SMA50'); }
  else { score -= 1; details.push('Cena < SMA50'); }
  if (data.price < data.bb.lower) { score += 1; details.push('Pod dolnym Bollingerem'); }
  else if (data.price > data.bb.upper) { score -= 1; details.push('Nad g\u00f3rnym Bollingerem'); }
  let rec;
  if (score >= 5) rec = 'KUPUJ';
  else if (score >= 2) rec = 'LEKKI KUPUJ';
  else if (score <= -5) rec = 'SPRZEDAJ';
  else if (score <= -2) rec = 'LEKKI SPRZEDAJ';
  else rec = 'TRZYMAJ';
  return { score, recommendation: rec, details, timeframe: '7-30 dni' };
}

// ======================== COINGECKO ========================

async function getCoinGeckoData(ticker, currency = 'USD') {
  try {
    const coinId = COINGECKO_MAP[ticker.toUpperCase()];
    if (!coinId) {
      throw new Error(`Nieznana kryptowaluta: ${ticker}`);
    }

    console.log(`🔄 CoinGecko: ${ticker} (${coinId})`);

    // Sequential calls with small delay to avoid 429 rate limits
    const ohlcRes = await axiosWithRetry(`https://api.coingecko.com/api/v3/coins/${coinId}/ohlc`, {
      params: { vs_currency: currency.toLowerCase(), days: 30 },
      timeout: 15000
    });

    await sleep(4000);

    const chartRes = await axiosWithRetry(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`, {
      params: { vs_currency: currency.toLowerCase(), days: 30, interval: 'daily' },
      timeout: 15000
    });

    const volumes = chartRes.data.total_volumes?.map(v => parseFloat(v[1])) || [];
    const marketCaps = chartRes.data.market_caps?.map(m => parseFloat(m[1])) || [];
    const avgVolume = volumes.length > 0 ? volumes.reduce((a, b) => a + b) / volumes.length : 0;
    const lastVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
    const marketCap = marketCaps.length > 0 ? marketCaps[marketCaps.length - 1] : 0;

    // Prawdziwe świece OHLC z CoinGecko (4h candles)
    const rawOhlc = ohlcRes.data; // [[timestamp, open, high, low, close], ...]
    if (!rawOhlc || rawOhlc.length === 0) {
      throw new Error(`Brak danych OHLC dla ${ticker}`);
    }

    // Agreguj 4h świece do dziennych
    const dailyMap = {};
    rawOhlc.forEach((d) => {
      const date = new Date(d[0]);
      const dayKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      if (!dailyMap[dayKey]) {
        dailyMap[dayKey] = { timestamp: Math.floor(d[0] / 1000), open: d[1], high: d[2], low: d[3], close: d[4] };
      } else {
        dailyMap[dayKey].high = Math.max(dailyMap[dayKey].high, d[2]);
        dailyMap[dayKey].low = Math.min(dailyMap[dayKey].low, d[3]);
        dailyMap[dayKey].close = d[4]; // ostatni close dnia
      }
    });

    // Dopasuj wolumen do dnia
    const volumeByDay = {};
    (chartRes.data.total_volumes || []).forEach(v => {
      const date = new Date(v[0]);
      const dayKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      volumeByDay[dayKey] = parseFloat(v[1]);
    });

    const sortedDays = Object.keys(dailyMap).sort();
    const candles = sortedDays.map(dayKey => ({
      ...dailyMap[dayKey],
      volume: volumeByDay[dayKey] || 0
    }));

    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const prevPrice = closes.length > 1 ? closes[closes.length - 2] : currentPrice;
    const change = currentPrice - prevPrice;
    const changePercent = (change / prevPrice) * 100;

    const allHighs = candles.map(c => c.high);
    const allLows = candles.map(c => c.low);
    const high = Math.max(...allHighs);
    const low = Math.min(...allLows);

    const chartData = candles.map((candle) => {
      const date = new Date(candle.timestamp * 1000);
      return {
        date: date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        dayOfWeek: date.toLocaleDateString('pl-PL', { weekday: 'short' }),
        fullDate: date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }),
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        changePercent: ((candle.close - candle.open) / candle.open) * 100
      };
    });

    return {
      chartData,
      currentPrice,
      change,
      changePercent,
      high,
      low,
      closes,
      volume: lastVolume,
      avgVolume,
      marketCap,
      candles
    };
  } catch (err) {
    console.error(`❌ CoinGecko error: ${err.message}`);
    throw err;
  }
}

async function getMarketData(ticker, currency = 'USD') {
  try {
    const symbol = ticker.toUpperCase();
    const cacheKey = `${symbol}-${currency}`;

    if (dataCache[cacheKey] && (Date.now() - dataCache[cacheKey].timestamp) < CACHE_TTL) {
      console.log(`⚡ Cache hit: ${cacheKey}`);
      return dataCache[cacheKey].data;
    }

    const geckoData = await getCoinGeckoData(symbol, currency);
    const [newsRaw, fearGreed, macroContext, fngHistory] = await Promise.all([
      getCryptoNews(symbol),
      getFearAndGreed(),
      getMarketContext(),
      getFearAndGreedHistory(30)
    ]);

    // Enrich news with deterministic impact/direction
    const news = enrichNewsWithImpact(newsRaw);

    const closes = geckoData.closes;
    const high = geckoData.high;
    const low = geckoData.low;
    const range = high - low;

    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macdData = calculateMACD(closes);
    const sarData = calculateSAR(geckoData.candles);
    const bbData = calculateBollingerBands(closes);
    const atr = calculateATR(geckoData.candles);
    const adxData = calculateADX(geckoData.candles);
    const stochRsiData = calculateStochRSI(closes);
    const obvData = calculateOBV(geckoData.candles);
    const rsiDivData = detectRSIDivergence(closes);
    const patterns = detectCandlePatterns(geckoData.candles);
    const fibonacci = calculateFibonacci(high, low);
    const rsiSeries = calculateRSISeries(closes);
    const ema12Series = calculateOverlayEMASeries(closes, 12);
    const ema26Series = calculateOverlayEMASeries(closes, 26);
    const sma20Series = calculateOverlaySMASeries(closes, 20);
    const sma50Series = calculateOverlaySMASeries(closes, 50);
    const bbOverlaySeries = calculateOverlayBBSeries(closes);

    const priceTimestamp = Date.now();
    const data = {
      ticker: symbol,
      pair: `${symbol}-${currency}`,
      currency: currency,
      price: geckoData.currentPrice,
      priceTimestamp,
      change: geckoData.change,
      changePercent: geckoData.changePercent,
      high,
      low,
      // Pivot Points
      pivotPoint: (high + low + geckoData.currentPrice) / 3,
      support1: 2 * ((high + low + geckoData.currentPrice) / 3) - high,
      resistance1: 2 * ((high + low + geckoData.currentPrice) / 3) - low,
      support2: ((high + low + geckoData.currentPrice) / 3) - (high - low),
      resistance2: ((high + low + geckoData.currentPrice) / 3) + (high - low),
      rsi: calculateRSI(closes),
      sma20: calculateSMA(closes, 20),
      sma50: calculateSMA(closes, 50),
      ema12: ema12,
      ema26: ema26,
      macd: macdData,
      sar: sarData,
      bb: bbData,
      atr: atr,
      adx: adxData,
      stochRsi: stochRsiData,
      obv: obvData,
      rsiDivergence: rsiDivData,
      fearGreed: fearGreed,
      volume: geckoData.volume,
      avgVolume: geckoData.avgVolume,
      marketCap: geckoData.marketCap,
      patterns: patterns,
      fibonacci: fibonacci,
      overlays: { rsiSeries, ema12Series, ema26Series, sma20Series, sma50Series, bbSeries: bbOverlaySeries, sentimentSeries: buildSentimentSeries(geckoData.chartData, fngHistory, news) },
      news: news,
      importantNews: news.filter(n => n.isImportant),
      lastUpdate: new Date().toISOString(),
      source: 'CoinGecko',
      chartData: geckoData.chartData,
      days: geckoData.chartData.length
    };

    // Composite scoring (dynamic weights)
    data.composite = calculateCompositeScore(data);
    data.microTrend = analyzeMicroTrend(data);
    data.macroTrend = analyzeMacroTrend(data);

    // NEW: Backtest, Scenarios, Risk Management, Macro
    data.backtest = calculateBacktest(geckoData.candles);
    data.scenarios = generateScenarios(data);
    data.riskManagement = calculateRiskManagement(data, data.scenarios);
    data.macroContext = macroContext;
    data.newsAggregation = calculateNewsAggregation(news);

    dataCache[cacheKey] = {
      data,
      timestamp: Date.now()
    };

    console.log(`✅ ${symbol}: ${currency} ${geckoData.currentPrice.toFixed(2)} | Score: ${data.composite.score} → ${data.composite.decision} | Backtest: ${data.backtest.accuracy}%`);
    return data;
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    throw err;
  }
}

// ======================== BACKGROUND NEWS MONITOR ========================

function startNewsMonitoring() {
  setInterval(async () => {
    try {
      // Wymuś odświeżenie globalnego cache Finnhub (1 request)
      finnhubRawCache.timestamp = 0;
      await fetchFinnhubRaw();
      // Wyczyść cache per-ticker żeby przy następnym zapytaniu przefiltrować na nowo
      Object.keys(newsCache).forEach(k => { newsCache[k].timestamp = 0; });
      console.log('🔄 News cache odświeżony');
    } catch (err) {
      console.error(`Error monitoring news:`, err.message);
    }
  }, NEWS_CHECK_INTERVAL);

  console.log(`🔔 News monitoring started - checking every ${NEWS_CHECK_INTERVAL / 1000 / 60} minutes`);
}

// ======================== ROUTES ========================

app.post('/api/analyze', async (req, res) => {
  try {
    const { prompt, ticker, currency } = req.body;

    if (!ticker) {
      return res.status(400).json({ error: "Brak tickera" });
    }

    console.log(`📊 Analizuję: ${ticker}/${currency}`);

    let data;
    try {
      data = await getMarketData(ticker, currency);
    } catch (fetchErr) {
      // If CoinGecko 429 — serve stale cache if available
      const cacheKey = `${ticker.toUpperCase()}-${currency}`;
      if (dataCache[cacheKey]?.data) {
        console.log(`⚠️ CoinGecko 429 — serving stale cache for ${cacheKey}`);
        data = dataCache[cacheKey].data;
      } else {
        throw fetchErr;
      }
    }

    const newsText = data.news.length > 0
      ? `\n📰 WIADOMOŚCI:\n${data.news.slice(0, 3).map(n => `- ${n.importanceLevel} ${n.title} (${n.sentiment})`).join('\n')}`
      : '';

    const analysis = `
📊 DANE (${data.ticker}/${currency}): ${data.lastUpdate}
💰 Cena: ${data.price.toFixed(2)} ${currency} | Zmiana: ${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%
💎 Kapitalizacja: $${data.marketCap > 0 ? (data.marketCap / 1000000000).toFixed(2) + 'B' : 'N/A'}
📊 High/Low 30d: ${data.high.toFixed(2)} / ${data.low.toFixed(2)}
🎯 Pivot: ${data.pivotPoint.toFixed(2)} | R1: ${data.resistance1.toFixed(2)} | R2: ${data.resistance2.toFixed(2)} | S1: ${data.support1.toFixed(2)} | S2: ${data.support2.toFixed(2)}
📈 Wolumen: ${data.volume.toFixed(0)} | Średni: ${data.avgVolume.toFixed(0)}
🔧 RSI(14): ${data.rsi.toFixed(1)} | StochRSI K: ${data.stochRsi.k} D: ${data.stochRsi.d} (${data.stochRsi.signal})
📊 SMA20: ${data.sma20.toFixed(2)} | SMA50: ${data.sma50.toFixed(2)} | EMA12: ${data.ema12.toFixed(2)} | EMA26: ${data.ema26.toFixed(2)}
🎯 MACD: ${data.macd.macdLine} (Signal: ${data.macd.signalLine}, Hist: ${data.macd.histogram}) ${data.macd.signal}
🛑 SAR: ${data.sar.sar} ${data.sar.trend} | ADX: ${data.adx.adx} +DI: ${data.adx.plusDI} -DI: ${data.adx.minusDI} (${data.adx.trend})
📉 BB: ${data.bb.lower.toFixed(2)} / ${data.bb.middle.toFixed(2)} / ${data.bb.upper.toFixed(2)} (Width: ${data.bb.width.toFixed(1)}%)
📏 ATR(14): ${data.atr.toFixed(2)} (${((data.atr / data.price) * 100).toFixed(2)}% zmienności)
📊 OBV trend: ${data.obv.trend} | Dywergencja: ${data.obv.divergenceType}
⚠️ Dywergencja RSI: ${data.rsiDivergence.type}
😱 Fear & Greed Index: ${data.fearGreed.value}/100 (${data.fearGreed.classification})
🕯️ Formacje: ${data.patterns.join(', ')}

🤖 COMPOSITE SCORE: ${data.composite.score}/100 → ${data.composite.decision}
Pewność algorytmu: ${data.composite.confidence}% | Ryzyko: ${data.composite.risk}
Sygnały: ${data.composite.signals.bullish} byczych, ${data.composite.signals.bearish} niedźwiedzich, ${data.composite.signals.neutral} neutralnych
Kluczowe: ${data.composite.details.join(' | ')}${newsText}
Pytanie: ${prompt || 'Analiza techniczna'}`;

    const systemPrompt = `Jesteś profesjonalnym traderem krypto z 10-letnim doświadczeniem. Masz dane z 12 wskaźników + composite score algorytmiczny.
ZASADY: TYLKO po polsku. Bez markdown. Używaj emoji. NIE pisz przemyśleń. TYLKO gotowa analiza.

⚠️ KRYTYCZNA ZASADA SPÓJNOŚCI:
Composite Score algorytmu: ${data.composite.score}/100 → ${data.composite.decision}
Twoja decyzja MUSI być SPÓJNA z kierunkiem composite score:
- Score > 25 = KUPUJ / LEKKI KUPUJ (LONG)
- Score < -25 = SPRZEDAJ / LEKKI SPRZEDAJ (SHORT)
- Score -25 do 25 przy pewności ≥ 60% = TRZYMAJ
- Score -25 do 25 przy pewności < 60% = OBSERWUJ (czekaj na silniejszy sygnał)
NIGDY nie dawaj sygnału SPRZEDAJ gdy score jest dodatni, ani KUPUJ gdy score jest ujemny.
Decyzja algorytmu: ${data.composite.decision} (pewność: ${data.composite.confidence}%).
${data.composite.decision === 'OBSERWUJ' ? 'Pewność poniżej progu — NIE rekomenduj otwierania pozycji. Zalecaj obserwację rynku.' : ''}

🧭 KIERUNEK TRADE: ${data.riskManagement?.direction === 'bullish' ? 'LONG (kupno)' : 'SHORT (sprzedaż)'}
Wszystkie sekcje MUSZĄ używać tego samego kierunku. SL, TP, scenariusze — WSZYSTKO pod ${data.riskManagement?.direction === 'bullish' ? 'LONG' : 'SHORT'}.
${!data.riskManagement?.tradeReady ? '⛔ TRADE NIE GOTOWY: ' + data.riskManagement?.tradeReason + ' Zamiast setupu napisz: "Brak optymalnych warunków do wejścia."' : ''}

SEKCJE:
1️⃣ TREND I MOMENTUM — RSI, StochRSI, MACD, SAR, ADX. Siła trendu 1-10. Czy ADX potwierdza?
2️⃣ ŚREDNIE I BOLLINGER — EMA/SMA crossover + pozycja w Bollingerze. Squeeze = zbliżający się ruch.
3️⃣ WSPARCIE I OPÓR — Pivot Points S1/S2/R1/R2 + BB jako dynamiczny S/R.
4️⃣ WOLUMEN I OBV — Czy wolumen potwierdza trend? Dywergencja OBV = ostrzeżenie!
5️⃣ DYWERGENCJE — RSI i OBV divergence = najsilniejsze sygnały reversal. Oceń ważność.
6️⃣ SENTYMENT — Fear & Greed Index + sentyment newsów (${data.newsAggregation?.label || 'brak'}).
7️⃣ WIADOMOŚCI — Wpływ na cenę krótko/długoterminowo.
8️⃣ SCENARIUSZE — Byczy/niedźwiedzi z konkretnymi cenami i prawdopodobieństwem %.
9️⃣ ZARZĄDZANIE POZYCJĄ — UŻYJ DOKŁADNIE TYCH WARTOŚCI (obliczone algorytmicznie):
* Kierunek: ${data.riskManagement?.direction === 'bullish' ? 'LONG' : 'SHORT'}
* Entry: ${data.riskManagement?.entry} ${currency}
* Stop-Loss: ${data.riskManagement?.stopLoss} ${currency}
* Take-Profit (TP1): ${data.riskManagement?.takeProfit1} ${currency}
* Take-Profit (TP2): ${data.riskManagement?.takeProfit2} ${currency}
* R:R ratio: ${data.riskManagement?.riskRewardRatio1}:1
${!data.riskManagement?.tradeReady ? '* ⛔ Setup nieoptymalny — zalecaj obserwację.' : '* ✅ Setup optymalny — gotowy do wejścia.'}
NIE WYMYŚLAJ WŁASNYCH WARTOŚCI SL/TP! Użyj powyższych liczb dokładnie.

🔟 DECYZJA TRADINGOWA
Composite Score: ${data.composite.score} → ${data.composite.decision}
Sygnał: (SPÓJNY z composite score — ${data.composite.decision})
Pewność: ${data.composite.confidence}% (algorytmiczna — nie zmieniaj!)
Siła trendu: X/10
Ryzyko: ${data.composite.risk}
Argumenty (dokładnie 3):
1. [Najsilniejszy argument techniczny]
2. [Argument z sentymentu/newsów]
3. [Argument z wolumenu/on-chain]
Uzasadnienie: krótkie wyjaśnienie dlaczego ten kierunek.`;

    // Próbuj wygenerować analizę AI z fallback
    let aiAnalysis = '';
    try {
      let raw = await generateWithFallback(analysis, systemPrompt);
      // Wytnij "thinking" AI — wszystko przed pierwszą sekcją 1️⃣
      const firstSection = raw.indexOf('1️⃣');
      if (firstSection > 0) {
        raw = raw.substring(firstSection);
      }
      // Wytnij śmieci AI (self-correction, checks, thinking, meta-text)
      const junkPatterns = [
        /\n\s*\*?\s*(Polish only|No markdown|Ensure|Let me|Self-correct|Wait,?\s|Double check|Final check|Let's go|I will|I'll|Okay|Sure|Got it|Understood|Alright).*/gis,
        /\n\s*\*?\s*(Language|Formatting|Style|Structure|Input Data|Drafting|Construction):.*/gis,
        /\n\s*-?:?\s*(Polish\??|No markdown\??|Emojis?\??|No thoughts\??|Only final|against rules|Check:?).*(Yes|No|Done)?\.?\s*/gis,
        /\n\s*Check:?\s*.*/gis,
        /\n\s*-:?\s*(Polish|markdown|Emojis|thoughts|final analysis)\??\s*(Yes|No).*$/gim,
        /\n\s*(I'll avoid|I will avoid|Let me re-?check|Self-correction|Checked\.|All \d+ sections).*$/gim,
        /\n\s*\*?\s*(bez markdown|nie pisz|no bolding|no italics|no headers|only polish|emojis used|no thoughts|all 10 sections|checked\.).*$/gim,
      ];
      for (const p of junkPatterns) {
        raw = raw.replace(p, '');
      }
      // Usuń puste linie zostawione po wycięciu
      raw = raw.replace(/\n{3,}/g, '\n\n');
      aiAnalysis = raw.trim();
    } catch (aiErr) {
      console.error(`⚠️ AI niedostępne: ${aiErr.message}`);
      aiAnalysis = `⚠️ AI tymczasowo niedostępne (rate limit). Dane rynkowe i wiadomości są aktualne.\n\n📊 Podsumowanie danych:\n- Cena: ${data.price.toFixed(2)} ${currency}\n- Zmiana: ${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%\n- RSI: ${data.rsi.toFixed(0)} (${data.rsi > 70 ? 'Wykupiony' : data.rsi < 30 ? 'Wyprzedany' : 'Neutralny'})\n- MACD: ${data.macd.signal}\n- SAR: ${data.sar.signal}\n\nSpróbuj ponownie za 30 sekund, aby uzyskać pełną analizę Gemma 4.`;
    }

    res.json({
      success: true,
      ticker: data.ticker,
      currency: currency,
      analysis: aiAnalysis,
      marketData: {
        price: data.price,
        priceTimestamp: data.priceTimestamp,
        change: data.change,
        changePercent: data.changePercent,
        marketCap: data.marketCap,
        volume: data.volume,
        avgVolume: data.avgVolume,
        rsi: data.rsi,
        sma20: data.sma20,
        sma50: data.sma50,
        ema12: data.ema12,
        ema26: data.ema26,
        macd: data.macd,
        sar: data.sar,
        pivotPoint: data.pivotPoint,
        support1: data.support1,
        support2: data.support2,
        resistance1: data.resistance1,
        resistance2: data.resistance2,
        high: data.high,
        low: data.low,
        bb: data.bb,
        atr: data.atr,
        adx: data.adx,
        stochRsi: data.stochRsi,
        obv: data.obv,
        rsiDivergence: data.rsiDivergence,
        fearGreed: data.fearGreed,
        composite: data.composite,
        patterns: data.patterns,
        news: data.news,
        importantNews: data.importantNews,
        lastUpdate: data.lastUpdate,
        source: data.source,
        fibonacci: data.fibonacci,
        overlays: data.overlays,
        microTrend: data.microTrend,
        macroTrend: data.macroTrend,
        backtest: data.backtest,
        scenarios: data.scenarios,
        riskManagement: data.riskManagement,
        macroContext: data.macroContext,
        newsAggregation: data.newsAggregation
      },
      chartData: data.chartData,
      days: data.days
    });

  } catch (error) {
    console.error("❌", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/important-news', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendNews = (news) => {
    res.write(`data: ${JSON.stringify(news)}\n\n`);
  };

  newsEmitter.on('important-news', sendNews);

  req.on('close', () => {
    newsEmitter.removeListener('important-news', sendNews);
  });
});

app.get('/', (req, res) => {
  res.json({ status: "✅ Online - COINGECKO + FINNHUB + GEMMA 4 AI" });
});

app.get('/api/debug/sentiment', async (req, res) => {
  try {
    const fng = await getFearAndGreedHistory(30);
    const sample = fng.slice(0, 5).map(f => ({
      date: makeDayKey(new Date(f.timestamp)),
      value: f.value,
      type: typeof f.value,
      classification: f.classification
    }));
    res.json({ total: fng.length, sample, cacheKeys: Object.keys(dataCache) });
  } catch (e) {
    res.json({ error: e.message });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`\n✅ Backend: http://localhost:${PORT}`);
  console.log(`📊 CoinGecko API - OHLC 30 dni`);
  console.log(`🤖 AI Engine: Gemma 4 (gemma-4-31b-it) + Gemini fallback`);
  console.log(`📰 Finnhub News - Real Time Crypto Monitoring`);

  // Uruchom monitoring wiadomości
  startNewsMonitoring();

  // Inicjalizuj moduł dywidendowy
  console.log(`\n📊 Inicjalizacja modułu dywidendowego...`);
  await initDividends();
  console.log(`✅ Dividends routes zamontowane na /api/dividends\n`);
});

app.get('/api/news', async (req, res) => {
  try {
    const ticker = req.query.ticker || 'BTC';
    const newsData = await getCryptoNews(ticker);
    res.json(newsData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== ORDER BOOK (Binance Depth) ========================

let orderBookCache = {};

app.get('/api/orderbook', async (req, res) => {
  try {
    const ticker = (req.query.ticker || 'BTC').toUpperCase();
    const symbol = `${ticker}USDT`;
    const cacheKey = symbol;

    if (orderBookCache[cacheKey] && (Date.now() - orderBookCache[cacheKey].timestamp) < 15000) {
      return res.json(orderBookCache[cacheKey].data);
    }

    const response = await axios.get('https://api.binance.com/api/v3/depth', {
      params: { symbol, limit: 50 },
      timeout: 8000
    });

    const bids = response.data.bids.map(([price, qty]) => ({
      price: parseFloat(price),
      quantity: parseFloat(qty),
      total: parseFloat(price) * parseFloat(qty)
    }));

    const asks = response.data.asks.map(([price, qty]) => ({
      price: parseFloat(price),
      quantity: parseFloat(qty),
      total: parseFloat(price) * parseFloat(qty)
    }));

    const allQtys = [...bids, ...asks].map(o => o.quantity);
    const avgQty = allQtys.reduce((a, b) => a + b, 0) / allQtys.length;
    const wallThreshold = avgQty * 5;

    const bidWalls = bids.filter(b => b.quantity >= wallThreshold).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const askWalls = asks.filter(a => a.quantity >= wallThreshold).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

    let bidCum = 0, askCum = 0;
    const bidDepth = bids.map(b => { bidCum += b.total; return { ...b, cumulative: bidCum }; });
    const askDepth = asks.map(a => { askCum += a.total; return { ...a, cumulative: askCum }; });

    const totalBidVol = bids.reduce((s, b) => s + b.total, 0);
    const totalAskVol = asks.reduce((s, a) => s + a.total, 0);
    const imbalance = totalBidVol / (totalBidVol + totalAskVol);

    const result = {
      symbol,
      timestamp: Date.now(),
      bids: bidDepth.slice(0, 25),
      asks: askDepth.slice(0, 25),
      bidWalls,
      askWalls,
      totalBidVolume: totalBidVol,
      totalAskVolume: totalAskVol,
      imbalance: +(imbalance * 100).toFixed(1),
      imbalanceLabel: imbalance > 0.6 ? 'BYCZA DOMINACJA' : imbalance < 0.4 ? 'NIEDŹWIEDZIA DOMINACJA' : 'RÓWNOWAGA',
      spread: asks[0] ? +(asks[0].price - bids[0].price).toFixed(2) : 0,
      midPrice: asks[0] && bids[0] ? +((asks[0].price + bids[0].price) / 2).toFixed(2) : 0
    };

    orderBookCache[cacheKey] = { data: result, timestamp: Date.now() };
    res.json(result);
  } catch (error) {
    console.error('Order Book error:', error.message);
    res.status(500).json({ error: 'Order book unavailable: ' + error.message });
  }
});

// ======================== WHALE WATCH (WebSocket Real-Time) ========================

// WebSocket imported at top of file

// Dynamic whale threshold per ticker (USD)
const WHALE_THRESHOLDS = {
  BTC: 500000,
  ETH: 250000,
  SOL: 100000,
  BNB: 100000,
  XRP: 100000,
  ADA: 50000,
  DOGE: 50000,
  DEFAULT: 50000
};

function getWhaleThreshold(ticker) {
  return WHALE_THRESHOLDS[ticker.toUpperCase()] || WHALE_THRESHOLDS.DEFAULT;
}

// Rolling window: keep whale trades from last 30 minutes
const WHALE_WINDOW_MS = 30 * 60 * 1000;
const whaleStreams = {};  // { symbol: { ws, trades[], stats, threshold } }

function createWhaleStream(ticker) {
  const symbol = `${ticker.toUpperCase()}USDT`;
  const symbolLower = symbol.toLowerCase();
  const threshold = getWhaleThreshold(ticker.toUpperCase());

  if (whaleStreams[symbol]?.ws?.readyState === WebSocket.OPEN) {
    return; // already streaming
  }

  const state = {
    ws: null,
    trades: [],
    threshold,
    totalAnalyzed: 0,
    startedAt: Date.now(),
    lastTradeAt: null
  };

  function connect() {
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbolLower}@aggTrade`;
    console.log(`🐋 Whale Watch: connecting to ${symbol} aggTrade stream...`);

    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.on('open', () => {
      console.log(`🐋 Whale Watch: ${symbol} stream LIVE (threshold: $${(threshold/1000).toFixed(0)}K)`);
    });

    ws.on('message', (raw) => {
      try {
        const d = JSON.parse(raw);
        const price = parseFloat(d.p);
        const qty = parseFloat(d.q);
        const total = price * qty;
        state.totalAnalyzed++;
        state.lastTradeAt = Date.now();

        if (total >= threshold) {
          const trade = {
            price,
            quantity: qty,
            total,
            time: d.T || Date.now(),
            isBuyerMaker: d.m,
            timeStr: new Date(d.T || Date.now()).toLocaleTimeString('pl-PL'),
            side: d.m ? 'SELL' : 'BUY',
            sideLabel: d.m ? 'Sprzedaz' : 'Kupno',
            totalFormatted: total >= 1000000 ? '$' + (total / 1000000).toFixed(2) + 'M' : '$' + (total / 1000).toFixed(1) + 'K'
          };
          state.trades.push(trade);
          console.log(`🐋 WHALE ${symbol}: ${trade.side} ${trade.totalFormatted} @ $${price.toLocaleString()}`);
        }

        // Prune old trades outside rolling window
        const cutoff = Date.now() - WHALE_WINDOW_MS;
        state.trades = state.trades.filter(t => t.time >= cutoff);
      } catch { /* ignore parse errors */ }
    });

    ws.on('close', () => {
      console.log(`🐋 Whale Watch: ${symbol} stream closed — reconnecting in 5s...`);
      setTimeout(connect, 5000);
    });

    ws.on('error', (err) => {
      console.error(`🐋 Whale Watch: ${symbol} error: ${err.message}`);
      ws.close();
    });
  }

  connect();
  whaleStreams[symbol] = state;
}

function stopWhaleStream(symbol) {
  if (whaleStreams[symbol]?.ws) {
    whaleStreams[symbol].ws.close();
    delete whaleStreams[symbol];
  }
}

app.get('/api/whales', (req, res) => {
  try {
    const ticker = (req.query.ticker || 'BTC').toUpperCase();
    const symbol = `${ticker}USDT`;
    const threshold = getWhaleThreshold(ticker);

    // Start stream if not running
    if (!whaleStreams[symbol] || whaleStreams[symbol].ws?.readyState !== WebSocket.OPEN) {
      createWhaleStream(ticker);
    }

    const state = whaleStreams[symbol];
    if (!state) {
      return res.json({
        symbol,
        timestamp: Date.now(),
        whaleThreshold: threshold,
        whaleTrades: [],
        whaleCount: 0, buyCount: 0, sellCount: 0,
        buyVolume: 0, sellVolume: 0,
        whalePressure: 50, pressureLabel: 'NEUTRALNA',
        summary: `Uruchamianie strumienia ${symbol}... dane pojawią się za chwilę.`,
        avgTradeSize: 0,
        totalTradesAnalyzed: 0,
        streamActive: false,
        windowMinutes: WHALE_WINDOW_MS / 60000
      });
    }

    const whaleTrades = [...state.trades].sort((a, b) => b.total - a.total).slice(0, 20);
    const buyWhales = whaleTrades.filter(t => t.side === 'BUY');
    const sellWhales = whaleTrades.filter(t => t.side === 'SELL');
    const buyVolume = buyWhales.reduce((s, t) => s + t.total, 0);
    const sellVolume = sellWhales.reduce((s, t) => s + t.total, 0);
    const totalWhaleVol = buyVolume + sellVolume;
    const whalePressure = totalWhaleVol > 0 ? (buyVolume / totalWhaleVol) * 100 : 50;

    const streamAge = Math.round((Date.now() - state.startedAt) / 60000);

    let summary = '';
    if (whaleTrades.length === 0) {
      summary = `Brak transakcji >${(threshold / 1000).toFixed(0)}K USD w ostatnich ${Math.min(streamAge, 30)} min. Rynek spokojny.`;
    } else if (whalePressure > 65) {
      summary = `BYCZA PRESJA — ${buyWhales.length} wielorybich kupna ($${(buyVolume / 1000).toFixed(0)}K) vs ${sellWhales.length} sprzedaży ($${(sellVolume / 1000).toFixed(0)}K) w ${Math.min(streamAge, 30)} min.`;
    } else if (whalePressure < 35) {
      summary = `NIEDŹWIEDZIA PRESJA — ${sellWhales.length} wielorybich sprzedaży ($${(sellVolume / 1000).toFixed(0)}K) vs ${buyWhales.length} kupna ($${(buyVolume / 1000).toFixed(0)}K) w ${Math.min(streamAge, 30)} min.`;
    } else {
      summary = `RÓWNOWAGA — ${buyWhales.length} kupna ($${(buyVolume / 1000).toFixed(0)}K) vs ${sellWhales.length} sprzedaży ($${(sellVolume / 1000).toFixed(0)}K) w ${Math.min(streamAge, 30)} min.`;
    }

    res.json({
      symbol,
      timestamp: Date.now(),
      whaleThreshold: threshold,
      whaleTrades,
      whaleCount: whaleTrades.length,
      buyCount: buyWhales.length,
      sellCount: sellWhales.length,
      buyVolume,
      sellVolume,
      whalePressure: +whalePressure.toFixed(1),
      pressureLabel: whalePressure > 65 ? 'BYCZA' : whalePressure < 35 ? 'NIEDŹWIEDZIA' : 'NEUTRALNA',
      summary,
      avgTradeSize: 0,
      totalTradesAnalyzed: state.totalAnalyzed,
      streamActive: state.ws?.readyState === WebSocket.OPEN,
      streamAgeMinutes: streamAge,
      windowMinutes: WHALE_WINDOW_MS / 60000
    });
  } catch (error) {
    console.error('Whale Watch error:', error.message);
    res.status(500).json({ error: 'Whale data unavailable: ' + error.message });
  }
});