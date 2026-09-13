export const PREFS_LS_KEY = 'autograph_indicator_prefs';

export const INDICATOR_GROUPS = [
  {
    category: 'Wskaźniki techniczne',
    items: [
      { key: 'ema',            label: 'EMA Crossovers (9/21/50/200)' },
      { key: 'macd',           label: 'MACD (12/26/9)' },
      { key: 'bollinger',      label: 'Bollinger Bands (20/2)' },
      { key: 'adx',            label: 'ADX — Siła trendu (14)' },
      { key: 'atr',            label: 'ATR — Zmienność + Stop Loss' },
      { key: 'stochRsi',       label: 'Stoch RSI (14/3/3)' },
      { key: 'fibonacci',      label: 'Fibonacci (52W H/L)' },
      { key: 'pivotPoints',    label: 'Pivot Points tygodniowe' },
      { key: 'fundamentyGrid', label: 'Fundamenty w siatce (P/E, P/B)' },
    ],
  },
  {
    category: 'Sekcje analizy',
    items: [
      { key: 'globalData',        label: 'Global Data & Fundamentals' },
      { key: 'aiScan',            label: 'Skan Główny (AI)' },
      { key: 'bullBear',          label: 'Bull / Bear Case' },
      { key: 'trendMatrix',       label: 'Trend Alignment Matrix' },
      { key: 'anomalies',         label: 'Kalendarium Anomalii' },
      { key: 'fundamentalsPanel', label: 'Panel Fundamentów' },
    ],
  },
];

export const DEFAULT_PREFS = Object.fromEntries(
  INDICATOR_GROUPS.flatMap(g => g.items.map(i => [i.key, true]))
);

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_LS_KEY);
    if (!raw) return null;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs) {
  localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs));
}
