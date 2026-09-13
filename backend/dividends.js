import 'dotenv/config';
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import yahooFinance from 'yahoo-finance2';

// Suppress yahoo-finance2 validation warnings
try { yahooFinance.suppressNotices(['yahooSurvey']); } catch(e) {}

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const AI_MODELS = [
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'gemini-2.0-flash'
];

const aiCache = {};
const AI_CACHE_TTL = 5 * 60 * 1000;

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

// ======================== DIVIDEND CONFIG ========================

// Szeroka pula 30 spółek dywidendowych — system codziennie ocenia i rankuje najlepsze
const DIVIDEND_POOL = [
  // Healthcare
  'JNJ', 'ABBV', 'PFE', 'MRK', 'BMY',
  // Consumer Defensive
  'KO', 'PEP', 'PG', 'CL', 'KHC',
  // Energy
  'XOM', 'CVX', 'EOG', 'PSX',
  // Technology
  'MSFT', 'AAPL', 'TXN', 'AVGO',
  // Communication
  'T', 'VZ',
  // Financials
  'JPM', 'GS',
  // Industrials
  'CAT', 'MMM', 'LMT',
  // Utilities
  'NEE', 'SO', 'DUK',
  // REITs
  'O', 'VICI',
];

const MAX_DISPLAY = 15;

const SECTOR_ICONS = {
  'Healthcare': 'fa-solid fa-heart-pulse',
  'Consumer Defensive': 'fa-solid fa-wine-bottle',
  'Consumer Cyclical': 'fa-solid fa-cart-shopping',
  'Energy': 'fa-solid fa-gas-pump',
  'Technology': 'fa-solid fa-microchip',
  'Real Estate': 'fa-solid fa-building',
  'Communication Services': 'fa-solid fa-tower-cell',
  'Industrials': 'fa-solid fa-industry',
  'Financial Services': 'fa-solid fa-landmark',
  'Utilities': 'fa-solid fa-bolt',
  'Basic Materials': 'fa-solid fa-gem',
};

const SECTOR_PL = {
  'Healthcare': 'Ochrona zdrowia',
  'Consumer Defensive': 'Dobra konsumpcyjne',
  'Consumer Cyclical': 'Dobra cykliczne',
  'Energy': 'Energia',
  'Technology': 'Technologia',
  'Real Estate': 'Nieruchomości (REIT)',
  'Communication Services': 'Telekomunikacja',
  'Industrials': 'Przemysł',
  'Financial Services': 'Finanse',
  'Utilities': 'Usługi komunalne',
  'Basic Materials': 'Surowce',
};

const stockCache = {};
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

let allStocks = [];
let lastRefresh = null;
let isRefreshing = false;

const DISK_CACHE_FILE = './dividends-cache.json';

function saveCacheToDisk() {
  try {
    fs.writeFileSync(DISK_CACHE_FILE, JSON.stringify({ allStocks, lastRefresh, stockCache }, null, 2));
    console.log('💾 Cache zapisany na dysk');
  } catch (e) { console.error('💾 Zapis cache error:', e.message); }
}

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(DISK_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISK_CACHE_FILE, 'utf-8'));
      if (data.allStocks?.length > 0) {
        allStocks = data.allStocks;
        lastRefresh = data.lastRefresh;
        if (data.stockCache) Object.assign(stockCache, data.stockCache);
        console.log(`💾 Załadowano cache z dysku: ${allStocks.length} spółek | ${lastRefresh}`);
        return true;
      }
    }
  } catch (e) { console.error('💾 Odczyt cache error:', e.message); }
  return false;
}

// ======================== YAHOO FINANCE FETCH ========================

// Batch fetch basic quotes for all tickers (single HTTP request)
async function fetchAllQuotes(tickers) {
  try {
    const results = await yahooFinance.quote(tickers);
    return Array.isArray(results) ? results : [results];
  } catch (err) {
    console.error('❌ Yahoo batch quote error:', err.message?.substring(0, 150));
    return [];
  }
}

// Detailed fetch for a single ticker (used for top candidates)
async function fetchStockDetails(ticker) {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile', 'calendarEvents']
    });
    return quote;
  } catch (err) {
    console.error(`⚠️ Yahoo detail ${ticker}:`, err.message?.substring(0, 80));
    return null;
  }
}

function buildStockFromQuote(q) {
  const sector = q.sector || 'Unknown';
  const divYield = (q.dividendYield || 0) * 100;
  return {
    ticker: q.symbol,
    name: q.shortName || q.longName || q.symbol,
    sector,
    sectorPl: SECTOR_PL[sector] || sector,
    industry: q.industry || '',
    logo: SECTOR_ICONS[sector] || 'fa-solid fa-chart-line',
    price: parseFloat((q.regularMarketPrice || 0).toFixed(2)),
    changePercent: parseFloat((q.regularMarketChangePercent || 0).toFixed(2)),
    marketCap: q.marketCap || 0,
    dividendYield: parseFloat(divYield.toFixed(2)),
    dividendPerShare: parseFloat((q.trailingAnnualDividendRate || 0).toFixed(2)),
    payoutRatio: 0,
    exDivDate: 'N/A',
    divDate: 'N/A',
    fiveYearAvgYield: parseFloat(divYield.toFixed(2)),
    peRatio: parseFloat((q.trailingPE || 0).toFixed(2)),
    forwardPE: parseFloat((q.forwardPE || 0).toFixed(2)),
    pegRatio: 0,
    beta: 0,
    fiftyTwoWeekHigh: parseFloat((q.fiftyTwoWeekHigh || 0).toFixed(2)),
    fiftyTwoWeekLow: parseFloat((q.fiftyTwoWeekLow || 0).toFixed(2)),
    roe: 0,
    debtToEquity: 0,
    freeCashflow: 0,
    revenueGrowth: 0,
    earningsGrowth: parseFloat((q.earningsQuarterlyGrowth || 0) * 100).toFixed(2) * 1,
    profitMargin: 0,
    currency: q.currency || 'USD',
    description: '',
    exchange: q.fullExchangeName || q.exchange || '',
    country: '',
    ipoDate: '',
    image: '',
    score: 0,
  };
}

function enrichWithDetails(stock, details) {
  if (!details) return stock;
  const summary = details.summaryDetail || {};
  const keyStats = details.defaultKeyStatistics || {};
  const financial = details.financialData || {};
  const profile = details.assetProfile || {};
  const calendar = details.calendarEvents || {};

  const exDivRaw = calendar.exDividendDate;
  const divDateRaw = calendar.dividendDate;

  stock.payoutRatio = parseFloat(((keyStats.payoutRatio || summary.payoutRatio || 0) * 100).toFixed(1));
  stock.beta = parseFloat((summary.beta || keyStats.beta3Year || 0).toFixed(2));
  stock.fiveYearAvgYield = parseFloat((summary.fiveYearAvgDividendYield || stock.dividendYield).toFixed(2));
  stock.pegRatio = parseFloat((keyStats.pegRatio || 0).toFixed(2));
  stock.roe = parseFloat(((financial.returnOnEquity || 0) * 100).toFixed(2));
  stock.debtToEquity = parseFloat(((financial.debtToEquity || 0) / 100).toFixed(2));
  stock.freeCashflow = financial.freeCashflow || 0;
  stock.revenueGrowth = parseFloat(((financial.revenueGrowth || 0) * 100).toFixed(2));
  stock.earningsGrowth = parseFloat(((financial.earningsGrowth || 0) * 100).toFixed(2));
  stock.profitMargin = parseFloat(((financial.profitMargins || 0) * 100).toFixed(2));
  stock.exDivDate = exDivRaw ? new Date(exDivRaw).toISOString().split('T')[0] : 'N/A';
  stock.divDate = divDateRaw ? new Date(divDateRaw).toISOString().split('T')[0] : 'N/A';
  stock.industry = profile.industry || stock.industry;
  stock.sector = profile.sector || stock.sector;
  stock.sectorPl = SECTOR_PL[stock.sector] || stock.sector;
  stock.logo = SECTOR_ICONS[stock.sector] || stock.logo;
  stock.description = profile.longBusinessSummary || '';
  stock.country = profile.country || '';
  return stock;
}

// ======================== AUTO-REFRESH ========================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function refreshAllStocks(retryCount = 0) {
  if (isRefreshing) return;
  isRefreshing = true;
  console.log('🔄 Pobieranie danych z Yahoo Finance (batch mode)...');
  console.log(`📋 Pula: ${DIVIDEND_POOL.length} spółek — szukam TOP ${MAX_DISPLAY} najbardziej opłacalnych\n`);
  try {
    // STEP 1: Batch quote — one request for all tickers (basic data)
    console.log('📡 Step 1: Batch quote dla wszystkich tickerów...');
    const quotes = await fetchAllQuotes(DIVIDEND_POOL);

    if (quotes.length === 0) {
      console.log('❌ Batch quote zwrócił 0 wyników');
      if (allStocks.length === 0 && retryCount < 2) {
        const delayMin = (retryCount + 1) * 2;
        console.log(`⏳ Ponawiam za ${delayMin} min (próba ${retryCount + 1}/2)...`);
        isRefreshing = false;
        setTimeout(() => refreshAllStocks(retryCount + 1), delayMin * 60 * 1000);
        return;
      }
      isRefreshing = false;
      return;
    }

    // Build basic stock objects and filter those with dividends
    let stocks = quotes
      .filter(q => q && q.symbol && (q.dividendYield || q.trailingAnnualDividendRate))
      .map(buildStockFromQuote)
      .filter(s => s.dividendYield > 0);

    console.log(`📊 Step 1 gotowy: ${stocks.length} spółek z dywidendą\n`);

    // STEP 2: Enrich top candidates with detailed financials (1 req per ticker, with delay)
    // Sort by basic yield first to pick top candidates
    stocks.sort((a, b) => b.dividendYield - a.dividendYield);
    const topCandidates = stocks.slice(0, MAX_DISPLAY + 5); // fetch a few extra for scoring

    console.log(`📡 Step 2: Szczegóły dla ${topCandidates.length} najlepszych kandydatów...`);
    for (const stock of topCandidates) {
      const details = await fetchStockDetails(stock.ticker);
      enrichWithDetails(stock, details);
      await sleep(1500); // 1.5s delay between detailed requests
    }

    // Oblicz score opłacalności
    for (const s of topCandidates) {
      s.score = calculateProfitabilityScore(s);
    }

    // Sortuj od najlepszej i weź top
    topCandidates.sort((a, b) => b.score - a.score);

    if (topCandidates.length > 0) {
      allStocks = topCandidates.slice(0, MAX_DISPLAY);
      lastRefresh = new Date().toISOString();
      console.log('\n🏆 TOP 15 najbardziej opłacalnych spółek dywidendowych:');
      allStocks.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.ticker.padEnd(5)} — score: ${String(s.score).padStart(2)}/100 | yield: ${s.dividendYield}% | ROE: ${s.roe}% | $${s.price}`);
      });
    }
    console.log(`\n✅ Przeanalizowano ${stocks.length}/${DIVIDEND_POOL.length} — wyświetlam TOP ${allStocks.length} | ${lastRefresh || 'brak'}`);
    if (allStocks.length > 0) saveCacheToDisk();
  } catch (err) {
    console.error('❌ Refresh error:', err.message);
  } finally {
    isRefreshing = false;
  }
}

// ======================== PROFITABILITY SCORE ========================

function calculateProfitabilityScore(stock) {
  let score = 0;

  // 1. Stopa dywidendy (max 30 pkt) — wyższa = lepsza, ale nie za wysoka (trap)
  const dy = stock.dividendYield;
  if (dy >= 2 && dy <= 6) score += Math.min(30, dy * 6);
  else if (dy > 6 && dy <= 8) score += 25;
  else if (dy > 8) score += 15; // dividend trap risk
  else if (dy > 0) score += dy * 5;

  // 2. Payout ratio (max 20 pkt) — niższe = bezpieczniejsze
  const pr = stock.payoutRatio;
  if (pr > 0 && pr <= 50) score += 20;
  else if (pr <= 70) score += 15;
  else if (pr <= 85) score += 10;
  else if (pr <= 100) score += 5;

  // 3. ROE (max 20 pkt) — wyższe = lepsza efektywność
  const roe = stock.roe;
  if (roe >= 25) score += 20;
  else if (roe >= 15) score += 15;
  else if (roe >= 10) score += 10;
  else if (roe >= 5) score += 5;

  // 4. Marża zysku netto (max 15 pkt)
  const pm = stock.profitMargin;
  if (pm >= 25) score += 15;
  else if (pm >= 15) score += 12;
  else if (pm >= 10) score += 8;
  else if (pm >= 5) score += 4;

  // 5. Debt/Equity (max 15 pkt) — niższe = bezpieczniejsze
  const de = stock.debtToEquity;
  if (de >= 0 && de <= 0.5) score += 15;
  else if (de <= 1.0) score += 12;
  else if (de <= 1.5) score += 8;
  else if (de <= 2.5) score += 4;

  return Math.min(100, Math.round(score));
}

// ======================== FINNHUB NEWS ========================

const newsCache = {};
const NEWS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4h

async function fetchStockNews(ticker, limit = 5) {
  const cacheKey = `news_${ticker}`;
  if (newsCache[cacheKey] && (Date.now() - newsCache[cacheKey].ts) < NEWS_CACHE_TTL) {
    return newsCache[cacheKey].data;
  }

  if (!FINNHUB_KEY) return [];

  try {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data } = await axios.get('https://finnhub.io/api/v1/company-news', {
      params: { symbol: ticker, from: fromDate, to, token: FINNHUB_KEY }
    });

    const news = (data || []).slice(0, limit).map(n => ({
      headline: n.headline || '',
      summary: (n.summary || '').substring(0, 200),
      source: n.source || '',
      url: n.url || '',
      datetime: n.datetime ? new Date(n.datetime * 1000).toISOString() : '',
      image: n.image || '',
    }));

    newsCache[cacheKey] = { data: news, ts: Date.now() };
    return news;
  } catch (err) {
    console.error(`📰 News error ${ticker}:`, err.message?.substring(0, 80));
    return [];
  }
}

// ======================== FALLBACK DATA ========================
// Static seed data used when FMP API is completely unavailable (429 rate limits)
// Updated periodically — ensures the page always loads
const FALLBACK_STOCKS = [
  { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', sectorPl: 'Ochrona zdrowia', industry: 'Drug Manufacturers', logo: 'fa-solid fa-heart-pulse', price: 155.50, changePercent: 0.3, marketCap: 375e9, dividendYield: 3.25, dividendPerShare: 5.04, payoutRatio: 44.2, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 2.65, peRatio: 22.5, forwardPE: 0, pegRatio: 0, beta: 0.53, fiftyTwoWeekHigh: 168, fiftyTwoWeekLow: 143, roe: 19.8, debtToEquity: 0.44, freeCashflow: 18.2e9, revenueGrowth: 0, earningsGrowth: 5.2, profitMargin: 20.1, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 78 },
  { ticker: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare', sectorPl: 'Ochrona zdrowia', industry: 'Drug Manufacturers', logo: 'fa-solid fa-heart-pulse', price: 195.20, changePercent: 0.5, marketCap: 345e9, dividendYield: 3.15, dividendPerShare: 6.20, payoutRatio: 52.1, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 3.80, peRatio: 60.5, forwardPE: 0, pegRatio: 0, beta: 0.65, fiftyTwoWeekHigh: 212, fiftyTwoWeekLow: 154, roe: 56.2, debtToEquity: 5.73, freeCashflow: 22.4e9, revenueGrowth: 0, earningsGrowth: -3.1, profitMargin: 10.5, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 65 },
  { ticker: 'KO', name: 'Coca-Cola Co.', sector: 'Consumer Defensive', sectorPl: 'Dobra konsumpcyjne', industry: 'Beverages', logo: 'fa-solid fa-wine-bottle', price: 63.80, changePercent: -0.1, marketCap: 275e9, dividendYield: 3.05, dividendPerShare: 1.94, payoutRatio: 73.8, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 3.05, peRatio: 26.2, forwardPE: 0, pegRatio: 0, beta: 0.59, fiftyTwoWeekHigh: 73.5, fiftyTwoWeekLow: 57.9, roe: 38.5, debtToEquity: 1.53, freeCashflow: 9.5e9, revenueGrowth: 0, earningsGrowth: 2.8, profitMargin: 22.7, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 72 },
  { ticker: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Defensive', sectorPl: 'Dobra konsumpcyjne', industry: 'Beverages', logo: 'fa-solid fa-wine-bottle', price: 148.50, changePercent: 0.2, marketCap: 203e9, dividendYield: 3.55, dividendPerShare: 5.26, payoutRatio: 66.5, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 2.85, peRatio: 22.8, forwardPE: 0, pegRatio: 0, beta: 0.55, fiftyTwoWeekHigh: 183, fiftyTwoWeekLow: 141, roe: 48.2, debtToEquity: 2.15, freeCashflow: 7.1e9, revenueGrowth: 0, earningsGrowth: -1.5, profitMargin: 10.8, currency: 'USD', description: '', exchange: 'NASDAQ', country: 'US', ipoDate: '', image: '', score: 74 },
  { ticker: 'XOM', name: 'Exxon Mobil Corp.', sector: 'Energy', sectorPl: 'Energia', industry: 'Oil & Gas', logo: 'fa-solid fa-gas-pump', price: 108.20, changePercent: -0.8, marketCap: 455e9, dividendYield: 3.45, dividendPerShare: 3.76, payoutRatio: 42.3, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 4.10, peRatio: 13.5, forwardPE: 0, pegRatio: 0, beta: 0.82, fiftyTwoWeekHigh: 126, fiftyTwoWeekLow: 95, roe: 18.9, debtToEquity: 0.21, freeCashflow: 36.2e9, revenueGrowth: 0, earningsGrowth: -8.5, profitMargin: 10.2, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 80 },
  { ticker: 'CVX', name: 'Chevron Corp.', sector: 'Energy', sectorPl: 'Energia', industry: 'Oil & Gas', logo: 'fa-solid fa-gas-pump', price: 152.30, changePercent: -0.4, marketCap: 278e9, dividendYield: 4.20, dividendPerShare: 6.40, payoutRatio: 52.8, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 4.00, peRatio: 14.2, forwardPE: 0, pegRatio: 0, beta: 0.95, fiftyTwoWeekHigh: 170, fiftyTwoWeekLow: 135, roe: 14.5, debtToEquity: 0.17, freeCashflow: 21.5e9, revenueGrowth: 0, earningsGrowth: -12.3, profitMargin: 9.8, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 76 },
  { ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', sectorPl: 'Technologia', industry: 'Software', logo: 'fa-solid fa-microchip', price: 430.50, changePercent: 1.2, marketCap: 3200e9, dividendYield: 0.72, dividendPerShare: 3.08, payoutRatio: 25.1, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 0.85, peRatio: 35.2, forwardPE: 0, pegRatio: 0, beta: 0.89, fiftyTwoWeekHigh: 469, fiftyTwoWeekLow: 362, roe: 35.8, debtToEquity: 0.29, freeCashflow: 70.2e9, revenueGrowth: 0, earningsGrowth: 18.5, profitMargin: 35.4, currency: 'USD', description: '', exchange: 'NASDAQ', country: 'US', ipoDate: '', image: '', score: 68 },
  { ticker: 'T', name: 'AT&T Inc.', sector: 'Communication Services', sectorPl: 'Telekomunikacja', industry: 'Telecom', logo: 'fa-solid fa-tower-cell', price: 27.80, changePercent: 0.1, marketCap: 199e9, dividendYield: 5.05, dividendPerShare: 1.40, payoutRatio: 62.5, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 5.80, peRatio: 17.5, forwardPE: 0, pegRatio: 0, beta: 0.78, fiftyTwoWeekHigh: 29.5, fiftyTwoWeekLow: 17.0, roe: 9.2, debtToEquity: 1.12, freeCashflow: 16.8e9, revenueGrowth: 0, earningsGrowth: 6.8, profitMargin: 9.5, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 82 },
  { ticker: 'VZ', name: 'Verizon Comm.', sector: 'Communication Services', sectorPl: 'Telekomunikacja', industry: 'Telecom', logo: 'fa-solid fa-tower-cell', price: 42.60, changePercent: -0.3, marketCap: 179e9, dividendYield: 6.20, dividendPerShare: 2.64, payoutRatio: 57.8, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 5.20, peRatio: 9.8, forwardPE: 0, pegRatio: 0, beta: 0.39, fiftyTwoWeekHigh: 47.3, fiftyTwoWeekLow: 37.6, roe: 22.5, debtToEquity: 1.61, freeCashflow: 18.7e9, revenueGrowth: 0, earningsGrowth: 2.1, profitMargin: 8.6, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 85 },
  { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Financial Services', sectorPl: 'Finanse', industry: 'Banks', logo: 'fa-solid fa-landmark', price: 245.80, changePercent: 0.6, marketCap: 705e9, dividendYield: 2.05, dividendPerShare: 5.04, payoutRatio: 26.2, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 2.55, peRatio: 12.8, forwardPE: 0, pegRatio: 0, beta: 1.05, fiftyTwoWeekHigh: 281, fiftyTwoWeekLow: 186, roe: 15.2, debtToEquity: 1.25, freeCashflow: 0, revenueGrowth: 0, earningsGrowth: 8.5, profitMargin: 32.5, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 70 },
  { ticker: 'O', name: 'Realty Income Corp.', sector: 'Real Estate', sectorPl: 'Nieruchomości (REIT)', industry: 'REIT', logo: 'fa-solid fa-building', price: 55.20, changePercent: 0.2, marketCap: 48e9, dividendYield: 5.65, dividendPerShare: 3.12, payoutRatio: 75.2, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 4.50, peRatio: 49.5, forwardPE: 0, pegRatio: 0, beta: 0.82, fiftyTwoWeekHigh: 64, fiftyTwoWeekLow: 49.5, roe: 2.8, debtToEquity: 0.62, freeCashflow: 2.1e9, revenueGrowth: 0, earningsGrowth: 1.5, profitMargin: 17.2, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 69 },
  { ticker: 'PG', name: 'Procter & Gamble', sector: 'Consumer Defensive', sectorPl: 'Dobra konsumpcyjne', industry: 'Household Products', logo: 'fa-solid fa-wine-bottle', price: 168.50, changePercent: 0.4, marketCap: 398e9, dividendYield: 2.40, dividendPerShare: 4.03, payoutRatio: 62.5, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 2.40, peRatio: 27.8, forwardPE: 0, pegRatio: 0, beta: 0.42, fiftyTwoWeekHigh: 177, fiftyTwoWeekLow: 152, roe: 30.5, debtToEquity: 0.68, freeCashflow: 15.8e9, revenueGrowth: 0, earningsGrowth: 3.2, profitMargin: 18.5, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 71 },
  { ticker: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology', sectorPl: 'Technologia', industry: 'Semiconductors', logo: 'fa-solid fa-microchip', price: 185.30, changePercent: 1.5, marketCap: 865e9, dividendYield: 1.15, dividendPerShare: 2.12, payoutRatio: 68.5, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 2.85, peRatio: 152.5, forwardPE: 0, pegRatio: 0, beta: 1.18, fiftyTwoWeekHigh: 251, fiftyTwoWeekLow: 122, roe: 11.5, debtToEquity: 1.02, freeCashflow: 19.4e9, revenueGrowth: 0, earningsGrowth: 25.2, profitMargin: 10.8, currency: 'USD', description: '', exchange: 'NASDAQ', country: 'US', ipoDate: '', image: '', score: 55 },
  { ticker: 'NEE', name: 'NextEra Energy', sector: 'Utilities', sectorPl: 'Usługi komunalne', industry: 'Utilities', logo: 'fa-solid fa-bolt', price: 71.50, changePercent: 0.3, marketCap: 147e9, dividendYield: 2.85, dividendPerShare: 2.04, payoutRatio: 59.8, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 2.25, peRatio: 22.5, forwardPE: 0, pegRatio: 0, beta: 0.62, fiftyTwoWeekHigh: 87, fiftyTwoWeekLow: 59.5, roe: 11.2, debtToEquity: 1.28, freeCashflow: -2.5e9, revenueGrowth: 0, earningsGrowth: 8.5, profitMargin: 28.2, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 67 },
  { ticker: 'LMT', name: 'Lockheed Martin', sector: 'Industrials', sectorPl: 'Przemysł', industry: 'Aerospace & Defense', logo: 'fa-solid fa-industry', price: 460.20, changePercent: 0.7, marketCap: 110e9, dividendYield: 2.70, dividendPerShare: 12.48, payoutRatio: 43.5, exDivDate: 'N/A', divDate: 'N/A', fiveYearAvgYield: 2.60, peRatio: 17.8, forwardPE: 0, pegRatio: 0, beta: 0.45, fiftyTwoWeekHigh: 618, fiftyTwoWeekLow: 414, roe: 72.8, debtToEquity: 2.58, freeCashflow: 6.2e9, revenueGrowth: 0, earningsGrowth: 5.8, profitMargin: 9.2, currency: 'USD', description: '', exchange: 'NYSE', country: 'US', ipoDate: '', image: '', score: 73 },
];

// ======================== ROUTES ========================

export function setupDividendRoutes(app) {

// GET /api/dividends — zwraca cached dane (odświeżane co 24h)
app.get('/api/dividends', (req, res) => {
  try {
    // Trigger refresh in background — don't block the response
    if (allStocks.length === 0 && !isRefreshing) {
      refreshAllStocks().catch(e => console.error('BG refresh error:', e.message));
    }
    const stocksToSend = allStocks.length > 0 ? allStocks : FALLBACK_STOCKS;
    const isFallback = allStocks.length === 0;
    if (isFallback) console.log('⚠️ Serwuję dane fallback — FMP API niedostępne');
    res.json({ success: true, stocks: stocksToSend, lastRefresh: lastRefresh || new Date().toISOString(), totalAnalyzed: DIVIDEND_POOL.length, fallback: isFallback });
  } catch (error) {
    console.error('❌ Dividends error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dividends/status — status danych
app.get('/api/dividends/status', (req, res) => {
  res.json({
    stocksLoaded: allStocks.length,
    lastRefresh,
    isRefreshing,
    tickers: DIVIDEND_POOL,
    cacheHours: 24,
    dataSource: 'Yahoo Finance',
  });
});

// POST /api/dividends/refresh — wymuszenie odświeżenia
app.post('/api/dividends/refresh', async (req, res) => {
  Object.keys(stockCache).forEach(k => delete stockCache[k]);
  await refreshAllStocks();
  res.json({ success: true, stocksLoaded: allStocks.length, lastRefresh });
});

// GET /api/dividends/news — zbiorcze newsy dla top spółek dywidendowych
app.get('/api/dividends/news', async (req, res) => {
  try {
    const topTickers = allStocks.slice(0, 5).map(s => s.ticker);
    const allNews = [];
    for (const ticker of topTickers) {
      const news = await fetchStockNews(ticker, 3);
      news.forEach(n => allNews.push({ ...n, ticker }));
    }
    allNews.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    res.json({ success: true, news: allNews.slice(0, 12) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dividends/news/:ticker — newsy dla spółki
app.get('/api/dividends/news/:ticker', async (req, res) => {
  try {
    const news = await fetchStockNews(req.params.ticker.toUpperCase());
    res.json({ success: true, ticker: req.params.ticker.toUpperCase(), news });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/dividends/analyze — AI analiza fundamentalna z newsami
app.post('/api/dividends/analyze', async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: 'Brak tickera' });

    console.log(`🧠 AI analiza fundamentalna: ${ticker}`);
    
    // Szukaj w cache (allStocks) zamiast API — unikamy rate limits
    let stock = allStocks.find(s => s.ticker === ticker.toUpperCase());
    if (!stock) {
      // Fallback: spróbuj pobrać z API
      try { stock = await fetchStockData(ticker); } catch (e) { /* ignore */ }
    }
    if (!stock) return res.status(404).json({ success: false, error: `Brak danych dla ${ticker}` });
    
    const news = await fetchStockNews(ticker, 5);

    const newsSection = news.length > 0
      ? '\n\n📰 AKTUALNE WIADOMOŚCI (ostatnie 7 dni):\n' + news.map((n, i) =>
          `${i + 1}. [${n.source}] ${n.headline}${n.summary ? ' — ' + n.summary : ''}`
        ).join('\n')
      : '\n\n📰 Brak aktualnych wiadomości z ostatnich 7 dni.';

    // ── Server-side anomaly detection ──
    const anomalies = [];
    if (stock.debtToEquity === 0 && stock.marketCap > 1e9) {
      anomalies.push(`⚠️ Debt/Equity = 0 przy kapitalizacji $${(stock.marketCap / 1e9).toFixed(1)}B — prawdopodobny błąd danych lub spółka bez długu (wymaga weryfikacji).`);
    }
    if (stock.payoutRatio > 100) {
      anomalies.push(`⚠️ Payout ratio ${stock.payoutRatio.toFixed(0)}% > 100% — spółka wypłaca więcej niż zarabia. Dywidenda finansowana z rezerw/długu.`);
    }
    if (stock.dividendYield > 8) {
      anomalies.push(`⚠️ Yield ${stock.dividendYield.toFixed(1)}% podejrzanie wysoki — potencjalna pułapka dywidendowa (yield trap). Sprawdź historię cięć.`);
    }
    if (stock.roe < 0 && stock.dividendYield > 3) {
      anomalies.push(`⚠️ Ujemne ROE (${stock.roe.toFixed(1)}%) przy yield ${stock.dividendYield.toFixed(1)}% — spółka traci pieniądze, a wypłaca dywidendę.`);
    }
    if (stock.peRatio < 0 || stock.peRatio > 200) {
      anomalies.push(`⚠️ P/E ${stock.peRatio.toFixed(1)} — wartość skrajna, wycena może być zniekształcona.`);
    }
    const anomalySection = anomalies.length > 0
      ? '\n\n🔍 WYKRYTE ANOMALIE (system pre-check):\n' + anomalies.join('\n')
      : '';

    // ── Sector context (averages from pool) ──
    const sectorPeers = allStocks.filter(s => s.sector === stock.sector && s.ticker !== stock.ticker);
    let sectorContext = '';
    if (sectorPeers.length >= 2) {
      const avgYield = (sectorPeers.reduce((a, s) => a + s.dividendYield, 0) / sectorPeers.length).toFixed(2);
      const avgPE = (sectorPeers.filter(s => s.peRatio > 0).reduce((a, s) => a + s.peRatio, 0) / (sectorPeers.filter(s => s.peRatio > 0).length || 1)).toFixed(1);
      const avgPayout = (sectorPeers.reduce((a, s) => a + s.payoutRatio, 0) / sectorPeers.length).toFixed(0);
      sectorContext = `\n\nKONTEKST SEKTORA (${stock.sectorPl}, ${sectorPeers.length} spółek w puli):\nŚr. yield sektora: ${avgYield}% | Śr. P/E sektora: ${avgPE} | Śr. payout sektora: ${avgPayout}%`;
    }

    // ── Price vs 52W range ──
    const range52w = stock.fiftyTwoWeekHigh - stock.fiftyTwoWeekLow;
    const pctFrom52Low = range52w > 0 ? (((stock.price - stock.fiftyTwoWeekLow) / range52w) * 100).toFixed(0) : '?';

    const prompt = `Przeanalizuj tę spółkę dywidendową:

SPÓŁKA: ${stock.name} (${stock.ticker})
Sektor: ${stock.sectorPl} | Branża: ${stock.industry} | Giełda: ${stock.exchange}
Cena: $${stock.price} (${pctFrom52Low}% zakresu 52-tyg.) | Kapitalizacja: $${(stock.marketCap / 1e9).toFixed(2)}B

DYWIDENDA:
Stopa dywidendy: ${stock.dividendYield}% | Dywidenda/akcję: $${stock.dividendPerShare} | Wskaźnik wypłaty: ${stock.payoutRatio}% | Śr. yield 5 lat: ${stock.fiveYearAvgYield}%

WYCENA:
P/E: ${stock.peRatio} | PEG: ${stock.pegRatio} | Score opłacalności: ${stock.score}/100

ZDROWIE FINANSOWE:
ROE: ${stock.roe}% | Dług/Kapitał: ${stock.debtToEquity} | Marża zysku: ${stock.profitMargin}% | Wzrost zysków: ${stock.earningsGrowth}%

RYZYKO:
Beta: ${stock.beta} | 52W Min: $${stock.fiftyTwoWeekLow} | 52W Max: $${stock.fiftyTwoWeekHigh}${sectorContext}${anomalySection}${newsSection}`;

    const systemPrompt = `Rola: Analityk dywidendowy (income-first, NIE growth). TYLKO po polsku. ZERO markdown. Emoji tylko tam gdzie wskazane.

KRYTYCZNE:
- ABSOLUTNY ZAKAZ chain-of-thought, myślenia, self-correction, constraint checks w outputcie
- ZAKAZANE słowa/frazy w outputcie: "Wait", "Let me", "Check", "Final polish", "One more", "Drafting", "Refining", "avoided", "rule check", "constraint", "Let's go", "This means", "between this"
- NIE komentuj instrukcji systemowych. NIE cytuj reguł. NIE pisz co robisz/unikasz
- Pierwsza linia MUSI być [HEADER]. Dosłownie. Nic przed nią — zero tekstu, zero komentarzy
- Produkujesz GOTOWY tekst dla klienta — żadnych notatek wewnętrznych, żadnego meta-komentarza
- Nigdy nie powtarzaj tego samego argumentu. Każdy punkt MUSI wnosić NOWĄ wartość. Jeśli napisałeś o payout ratio w PROS, nie pisz o nim ponownie w CONS ani NEUTRAL

ZASADY KONKRETU:
- ZAKAZANE zwroty: "solidne fundamenty", "atrakcyjna wycena", "stabilna dywidenda", "dobra spółka". To nic nie znaczy
- WYMAGANE: "Wycena P/E 8.6 jest o 30% niższa od średniej sektora (12.3)" zamiast "Wycena jest atrakcyjna"
- WYMAGANE: "Yield 4.8% vs średnia sektorowa 3.1% (+55%)" zamiast "Yield powyżej średniej"
- Każdy wniosek = KONKRETNA LICZBA + PORÓWNANIE (vs sektor, vs historia, vs próg bezpieczeństwa)
- Jeśli w danych jest kontekst sektora — UŻYJ go w porównaniach
- Oceniaj przez cash flow (nie tylko earnings)
- Newsy interpretuj TYLKO przez wpływ na dywidendę i cash flow
- Jeśli wykryto anomalie danych (sekcja ANOMALIE) — MUSISZ je skomentować w [ANOMALY] i uwzględnić w ocenie pewności
- Język analityczny: "presja na marże", "erozja przychodów", "kompresja spreadu"
- Unikaj stwierdzeń oczywistych z tabelki — dawaj insight którego inwestor sam nie wydedukuje

MODEL (oblicz w tle, NIE pokazuj obliczeń):
Dividend Quality (0-10) | Valuation (0-10) | Risk (-5 do 0)
Final = (Div*0.5) + (Val*0.3) + ((10+Risk)*0.2)
8.0+ = KUPUJ | 6.0-8.0 = TRZYMAJ | <6.0 = UNIKAJ

OUTPUT (DOKŁADNIE ten format, NIC przed nim):

[HEADER]
Score: X.X / 10
Pewność: XX%
Rekomendacja: KUPUJ / TRZYMAJ / UNIKAJ
Dywidenda: Bardzo bezpieczna / Bezpieczna / Ryzykowna
Kluczowy wniosek: 1 zdanie podsumowujące (np. "Kupuj ze względu na X, ale uważaj na Y" — musi zawierać ZARÓWNO argument ZA jak i PRZECIW)

[CONFIDENCE_REASON]
1 zdanie wyjaśniające co wpływa na pewność AI (np. "Niska pewność wynika z rozbieżnych sygnałów w newsach i braku danych o FCF za ostatni kwartał")

[PROS]
✅ (1 unikalny argument — bezpieczeństwo dywidendy z LICZBĄ + PORÓWNANIEM np. "Wskaźnik wypłaty 45% vs próg bezpieczeństwa 60% — 15pp zapasu")
✅ (1 unikalny argument — historia/wzrost/pozycja sektorowa z KONKRETNYM faktem)
✅ (1 unikalny argument — wycena vs sektor/historia z LICZBAMI np. "P/E 8.6 o 30% poniżej średniej sektora 12.3")

[CONS]
❌ (1 unikalne ryzyko — z KONKRETNYM zagrożeniem dla cash flow + dane liczbowe)
❌ (1 unikalne ryzyko — INNE niż powyżej, z danymi np. "Dług/EBITDA wzrósł z 2.1 do 3.4")

[NEUTRAL]
⚖️ (1 zdanie o wycenie vs historia — jeśli neutralna)
⚖️ (1 zdanie o pozycji vs sektor)

[NEWS]
Sentyment: POSITIVE / NEUTRAL / NEGATIVE
Siła: X (skala -3 do +3, np. -1.2)
Powód: 1 zdanie o wpływie newsów na cash flow i dywidendę

[SCORES]
Dividend Score: X/10
Valuation: X/10
Risk: -X

[TREND]
FCF: ↑/↓/→ 1 zdanie
Dywidenda: ↑/→/↓ 1 zdanie

[SCENARIO_BULL]
Warunek: co musi się stać (1 zdanie z KONKRETEM np. "Jeśli cena spadnie poniżej $24, stopa dywidendy przekroczy 5%")
Efekt: jaka zmiana oceny/rekomendacji

[SCENARIO_BEAR]
Warunek: co może się pogorszyć (1 zdanie z KONKRETEM np. "Jeśli FCF spadnie <$2B, payout przekroczy 90%")
Efekt: jaka zmiana oceny/rekomendacji

[ALERT]
1 linia: co obserwować w najbliższym raporcie kwartalnym (konkretny wskaźnik)

[ANOMALY]
⚠️ tylko jeśli wykryto anomalie danych — opisz (wymaga weryfikacji). Jeśli brak anomalii, pomiń tę sekcję.`;

    let aiAnalysis = await generateWithFallback(prompt, systemPrompt);
    
    // ══════ AGRESYWNE CZYSZCZENIE ══════
    // Dozwolone sekcje
    const VALID_SECTIONS = new Set([
      'HEADER','CONFIDENCE_REASON','PROS','CONS','NEUTRAL',
      'NEWS','SCORES','TREND','SCENARIO_BULL','SCENARIO_BEAR','ALERT','ANOMALY'
    ]);
    
    // Wzorce AI thinking/self-correction do usunięcia
    const JUNK_PATTERNS = [
      /^(check|self[- ]?correct|final\s+(check|polish)|wait[,.]|let me|refining|drafting|ready|one more|i (will|used|must|should|chose|need)|the (prompt|template|ui|output)|standard markdown)/i,
      /^(in \[|my output|i'll|this is|the user|warning|note:|important:|ok[,.]|alright)/i,
      /^[-*]\s*(polish|language|formatting|style|structure|emoji|no |check |avoid |ensure )/i,
      /constraint|rule check|self.?talk|chain.?of.?thought/i,
      /^(yes\.|correct\.|allowed\.|done\.|good\.)/i,
      /^"[^"]+"\s*[-–—]\s*(avoided|used|replaced|changed|kept)/i,
      /^(let'?s go|moving on|now |here'?s|below is)/i,
      /^(final polish|between this|this (means|conflict)|help:|check if)/i,
      /NIE pisz|Pierwsza linia|ZERO markdown|MUSI by[ćc]/i,
    ];
    
    const rawLines = aiAnalysis.split('\n');
    const cleanLines = [];
    let inValidSection = false;
    let foundHeader = false;
    
    for (const line of rawLines) {
      const t = line.trim();
      if (!t) { cleanLines.push(''); continue; }
      
      // Detect section markers
      const secMatch = t.match(/^\[([\w_]+)\]$/);
      if (secMatch) {
        if (VALID_SECTIONS.has(secMatch[1])) {
          inValidSection = true;
          if (secMatch[1] === 'HEADER') foundHeader = true;
          cleanLines.push(t);
        } else {
          inValidSection = false;
        }
        continue;
      }
      
      // Before [HEADER] found — skip everything (AI preamble/thinking)
      if (!foundHeader) {
        // Exception: if line starts with Score: treat as HEADER content
        if (/^Score:\s/i.test(t)) {
          foundHeader = true;
          inValidSection = true;
          cleanLines.push('[HEADER]');
          cleanLines.push(t);
        }
        continue;
      }
      
      // Check if line matches junk patterns
      let isJunk = false;
      for (const pat of JUNK_PATTERNS) {
        if (pat.test(t)) { isJunk = true; break; }
      }
      if (isJunk) continue;
      
      // Skip lines that look like meta-commentary
      if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('```')) continue;
      
      if (inValidSection) {
        // Extra guard: skip lines that look like AI thinking even inside valid sections
        if (/^(wait|let me|one more|final|check|i (will|should|must|need)|"[^"]+"\s*[-–—]\s*(avoided|used))/i.test(t)) continue;
        if (/rule check|self[- ]?correct|constraint|chain.?of.?thought/i.test(t)) continue;
        if (/NIE pisz|Pierwsza linia|ZERO markdown|MUSI by[ćc]/i.test(t)) continue;
        if (/^(let'?s go|moving on|now |here'?s|below is)/i.test(t)) continue;
        // Skip lines containing [HEADER] mid-sentence (leaked thinking like "Let's go.[HEADER]")
        if (/\[HEADER\]/i.test(t) && !/^\[HEADER\]$/.test(t)) continue;
        cleanLines.push(t);
      }
    }
    
    // Remove trailing empty lines and markdown artifacts
    aiAnalysis = cleanLines.join('\n')
      .replace(/\*{1,2}/g, '')
      .replace(/_{2,}/g, '')
      .replace(/#{1,}\s/g, '')
      .replace(/`{1,3}/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    console.log(`  📰 Uwzględniono ${news.length} newsów w analizie ${ticker}`);

    res.json({
      success: true,
      ticker: stock.ticker,
      stock,
      news,
      analysis: aiAnalysis,
    });
  } catch (error) {
    console.error('❌ AI Dividend analysis error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

} // end setupDividendRoutes

export async function initDividends() {
  console.log(`📊 Dividends module: ${DIVIDEND_POOL.length} spółek w puli, TOP ${MAX_DISPLAY}`);
  console.log(`🔑 Data source: Yahoo Finance (bez limitów)`);

  const hadCache = loadCacheFromDisk();
  const cacheAge = lastRefresh ? (Date.now() - new Date(lastRefresh).getTime()) : Infinity;
  if (!hadCache || cacheAge > CACHE_TTL) {
    await refreshAllStocks();
  } else {
    console.log(`⏭️ Dividends cache aktualny (${(cacheAge / 3600000).toFixed(1)}h) — pomijam API`);
  }

  setInterval(() => {
    console.log('⏰ Zaplanowane odświeżenie danych dywidendowych (24h)...');
    Object.keys(stockCache).forEach(k => delete stockCache[k]);
    refreshAllStocks();
  }, 24 * 60 * 60 * 1000);
}

// ======================== STANDALONE MODE ========================
// Jeśli uruchomiony bezpośrednio: node dividends.js
const isMain = process.argv[1] && (process.argv[1].endsWith('dividends.js') || process.argv[1].endsWith('dividends'));
if (isMain) {
  const app = express();
  const PORT = process.env.DIVIDENDS_PORT || 3001;
  app.use(cors());
  app.use(express.json());
  setupDividendRoutes(app);
  app.get('/', (req, res) => {
    res.json({ status: '✅ Dividends API Online — Yahoo Finance + Gemma 4 AI' });
  });
  app.listen(PORT, async () => {
    console.log(`\n✅ Dividends Backend (standalone): http://localhost:${PORT}`);
    await initDividends();
  });
}
