import React from 'react';
import { HelpCircle, X } from 'lucide-react';

const LEGEND_ITEMS = [
  // ===== SEKCJA: GŁÓWNE ELEMENTY DASHBOARDU =====
  { cat: 'WYKRES CENOWY', color: '#00e5ff', items: [
    { name: 'Wykres liniowy', desc: 'Główny wykres cenowy aktywa z wypełnieniem gradientowym. Pokazuje cenę zamknięcia w wybranym przedziale czasowym. Możesz przybliżać (scroll) i przesuwać (przeciąganie).' },
    { name: 'Fioletowe punkty', desc: 'Dni z największą zmiennością cenową (volatile days) — Top 40 dni z najsilniejszymi ruchami. Większe punkty = większe wahania. Kliknij na punkt aby zobaczyć analizę dnia.' },
    { name: 'Overlay EMA 50/200', desc: 'Pomarańczowa linia = EMA50 (trend średnioterminowy). Czerwona = EMA200 (trend długoterminowy). Można włączyć/wyłączyć przyciskiem OVERLAY.' },
    { name: 'Overlay Bollinger Bands', desc: 'Trzy przerywane fioletowe linie — górne, środkowe i dolne pasmo. Cena zwykle oscyluje między nimi. Przełączane przyciskiem OVERLAY.' },
    { name: 'Timeframe (1W/1M/3M/6M/1Y)', desc: 'Filtruje widok wykresu do wybranego okresu. Dane pobierane są zawsze za pełny rok — timeframe to tylko okno widoku.' },
  ]},
  { cat: 'WOLUMEN', color: '#10b981', items: [
    { name: 'Pasek wolumenu (ziel./czer.)', desc: 'Zielony = dzień wzrostowy (zamknięcie > otwarcie). Czerwony = dzień spadkowy. Wielkość słupka = ilość obrotu danego dnia.' },
    { name: 'Avg 20d (żółta linia)', desc: 'Średnia krocząca wolumenu z ostatnich 20 sesji. Pozwala ocenić czy obecny obrót jest powyżej czy poniżej normy.' },
    { name: 'Ratio', desc: 'Stosunek bieżącego wolumenu do średniej 20d. >1.5x = wzmożone zainteresowanie. <0.7x = cichy rynek, niska konwikacja.' },
  ]},
  // ===== SEKCJA: CONSENSUS BANNER =====
  { cat: 'CONSENSUS BANNER', color: '#00e5a0', items: [
    { name: 'Consensus (LONG/SHORT/NEUTRAL)', desc: 'Zagregowana rekomendacja algorytmu na podstawie ważonego scoringu wszystkich wskaźników technicznych. LONG = kupuj, SHORT = sprzedawaj, NEUTRAL = czekaj.' },
    { name: 'Composite Score (0-100)', desc: 'Wynik końcowy algorytmu. 0-30 = silnie niedźwiedzi, 30-45 = niedźwiedzi, 45-55 = neutralny, 55-70 = byczy, 70-100 = silnie byczy.' },
    { name: 'Pewność (WYSOKA/ŚREDNIA/NISKA)', desc: 'Poziom pewności rekomendacji. WYSOKA = silne wyrównanie sygnałów (>68 lub <32), ŚREDNIA = częściowa zgoda, NISKA = sygnały sprzeczne.' },
    { name: 'Typ Setupu', desc: 'TREND = zgodny z trendem, REVERSAL = kontr-trendowy (ryzykowny), PULLBACK = korekta w trendzie, RANGE = boczny rynek, BREAKOUT = oczekiwane wybicie.' },
    { name: 'Score Breakdown (paski)', desc: 'Rozkład punktowy Composite Score: Trend (40%), Momentum (30%), Volatility (20%), Sentiment (10%). Każdy pasek 0-100 — rośnie gdy sygnały w danej kategorii są bycze.' },
    { name: 'Pasek kolorowy', desc: 'Wizualizacja ile procent wyniku pochodzi z Trendu (niebieski), Momentum (zielony), Volatility (żółty) i Sentiment (fioletowy). Szersze segmenty = większy wpływ.' },
  ]},
  // ===== SEKCJA: QUANT ANALYSIS =====
  { cat: 'QUANT ANALYSIS (TRADE SETUP)', color: '#8b5cf6', items: [
    { name: 'Entry / Stop Loss / Take Profit', desc: 'Konkretne poziomy cenowe w USD wygenerowane przez AI na podstawie wskaźników. Entry = sugerowany punkt wejścia. SL = poziom ucięcia straty (oparty na ATR). TP = cel zysku (Fibonacci/Pivot/opór).' },
    { name: 'R:R (Ryzyko:Zysk)', desc: 'Stosunek potencjalnego zysku do ryzyka obliczony server-side: (TP − Entry) / (Entry − SL). 1:1.5+ = KORZYSTNY, 1:2+ = ATRAKCYJNY, 1:3+ = WYBITNY.' },
    { name: 'Badge R:R (KORZYSTNY/AKCEPTOWALNY/...)', desc: 'Kolorowy tag obok R:R: zielony WYBITNY/ATRAKCYJNY/KORZYSTNY = dobry setup, żółty AKCEPTOWALNY = średni, czerwony NIEKORZYSTNY = nie wchodzić.' },
    { name: 'PROB (prawdopodobieństwo)', desc: 'Szacunkowe prawdopodobieństwo ruchu w górę (▲) i w dół (▼). Wygenerowane przez AI na bazie technicznych i fundamentalnych danych. Zawsze sumuje się do 100%.' },
    { name: 'Mikro / Makro Trend', desc: 'Mikro = krótkoterminowy kierunek (EMA9/21, RSI, MACD). Makro = długoterminowy (EMA50/200, Golden/Death Cross, ADX). Opisowy tekst od AI.' },
    { name: 'Take Profit Analysis', desc: 'Tekstowe uzasadnienie AI dlaczego wybrany został dany poziom TP — odniesienia do konkretnych wskaźników (Fibonacci, Pivot, 52W High).' },
    { name: '⚠️ R:R Warning (żółty/czerwony baner)', desc: 'System automatycznie ostrzega gdy R:R jest poniżej optymalnego progu 1:1.5. Czerwony = R:R < 1.0 (ujemna wartość oczekiwana). Żółty = R:R 1.0–1.5 (suboptymalne).' },
  ]},
  // ===== SEKCJA: WSKAŹNIKI TECHNICZNE =====
  { cat: 'OSCYLATORY MOMENTUM', color: '#a78bfa', items: [
    { name: 'RSI (14)', desc: 'Relative Strength Index — mierzy siłę trendu w skali 0-100. >70 = wykupienie (możliwy szczyt), <30 = wyprzedanie (możliwe dno). 50 = punkt równowagi.' },
    { name: 'Stochastic RSI (K/D)', desc: 'RSI z RSI — bardziej czuły na ekstremalne sytuacje. K i D >80 = silne wykupienie, <20 = silne wyprzedanie. Crossover K > D = sygnał kupna.' },
    { name: 'Momentum 5d', desc: 'Procentowa zmiana ceny vs średnia z 5 dni. Pokazuje krótkoterminowe przyspieszenie (+) lub hamowanie (-) trendu.' },
  ]},
  { cat: 'TRENDY — EMA & SMA', color: '#38bdf8', items: [
    { name: 'EMA 9 / 21', desc: 'Wykładnicze średnie kroczące. EMA9 > EMA21 = krótkoterminowy trend wzrostowy (bullish crossover). EMA9 < EMA21 = spadkowy.' },
    { name: 'EMA 50 / 200 (Golden/Death Cross)', desc: 'Najważniejszy sygnał instytucjonalny. Golden Cross (EMA50 > EMA200) = silny trend wzrostowy. Death Cross (EMA50 < EMA200) = trend spadkowy.' },
    { name: 'SMA 20 / 50 + Nachylenie SMA50', desc: 'Proste średnie kroczące. Nachylenie SMA50 wskazuje kierunek trendu — rosnące = przyspieszenie wzrostu, malejące = osłabienie.' },
    { name: 'Cena vs EMA200', desc: 'Cena powyżej EMA200 = strefa byków (instytucje kupują). Poniżej = strefa niedźwiedzi (sprzedajemy lub czekamy).' },
  ]},
  { cat: 'MACD (12/26/9)', color: '#34d399', items: [
    { name: 'MACD Line', desc: 'Różnica EMA12 − EMA26. Powyżej zera = momentum wzrostowe, poniżej = spadkowe.' },
    { name: 'Signal Line', desc: 'EMA(9) z linii MACD. Crossover MACD > Signal = sygnał kupna. MACD < Signal = sygnał sprzedaży.' },
    { name: 'Histogram', desc: 'Różnica MACD − Signal. Rosnące słupki = przyspieszenie momentum. Malejące = osłabienie — często poprzedza zmianę trendu.' },
  ]},
  { cat: 'BOLLINGER BANDS (20/2σ)', color: '#f59e0b', items: [
    { name: '%B (Percent-B)', desc: 'Pozycja ceny w paśmie Bollingera. >80% = przy górnym paśmie (wykupienie), <20% = przy dolnym (wyprzedanie). 50% = środek pasm.' },
    { name: 'Bandwidth / Squeeze', desc: 'Szerokość pasm. Squeeze (<5%) = kompresja zmienności — oczekuj silnego wybicia wkrótce. Rozszerzenie (>20%) = wysoka zmienność, szerokie stopy.' },
  ]},
  { cat: 'ADX — SIŁA TRENDU (14)', color: '#fb923c', items: [
    { name: 'ADX (wartość)', desc: 'Average Directional Index. <20 = brak trendu (rynek boczny), 20–25 = słaby trend, 25–40 = silny, >40 = bardzo silny. NIE mówi o kierunku — tylko o sile!' },
    { name: '+DI / −DI', desc: 'Directional Indicators. +DI > −DI = trend wzrostowy. −DI > +DI = trend spadkowy. Razem z ADX dają pełny obraz siły i kierunku.' },
  ]},
  { cat: 'ATR — ZMIENNOŚĆ (14)', color: '#e879f9', items: [
    { name: 'ATR ($)', desc: 'Average True Range — średni dzienny zasięg cenowy w dolarach. Im wyższy, tym większe ryzyko i szerszy stop loss potrzebny.' },
    { name: 'ATR (%)', desc: 'ATR jako procent ceny. <1.5% = niska zmienność, 1.5-3% = normalna, >3% = podwyższona, >4% = ekstremalnie wysoka.' },
    { name: 'SL (2×ATR)', desc: 'Sugerowany stop loss = cena − 2×ATR. Dynamicznie dostosowuje się do aktualnej zmienności rynku. Standard zarządzania ryzykiem.' },
  ]},
  // ===== SEKCJA: FIBONACCI & PIVOT =====
  { cat: 'FIBONACCI & PIVOT POINTS', color: '#a78bfa', items: [
    { name: 'Fibonacci Retracement (52W)', desc: 'Poziomy korekty od 52-tygodniowego High do Low. Kluczowe: 38.2% (pierwszy silny opór/wsparcie), 50% (psychologiczny), 61.8% (złoty podział — najsilniejszy).' },
    { name: 'Pivot Points (tygodniowe)', desc: 'P = punkt zwrotny, R1/R2 = opory, S1/S2 = wsparcia. Obliczone z danych poprzedniego tygodnia. Instytucje ustawiają zlecenia na tych poziomach.' },
  ]},
  // ===== SEKCJA: WOLUMEN ZAAWANSOWANY =====
  { cat: 'OBV & ANALIZA WOLUMENU', color: '#34d399', items: [
    { name: 'OBV (On-Balance Volume)', desc: 'Skumulowany wolumen uwzględniający kierunek. Rosnący OBV + rosnąca cena = zdrowa akumulacja. Spadający OBV + rosnąca cena = dystrybucja (silne ostrzeżenie!).' },
    { name: 'Trend wolumenu (5d vs 20d)', desc: 'Porównanie średniego wolumenu z 5 ostatnich dni do 20 dni. ROSNĄCY = wzrost zainteresowania, MALEJĄCY = rynek traci impet, NEUTRALNY = stabilny.' },
    { name: 'Dystrybucja', desc: 'Cena spada przy jednoczesnym rosnącym wolumenie = „smart money" sprzedaje. Jeden z najsilniejszych sygnałów ostrzegawczych nawet w trendzie wzrostowym.' },
  ]},
  // ===== SEKCJA: GLOBAL DATA & AI =====
  { cat: 'SKAN GŁÓWNY (AI)', color: '#8b5cf6', items: [
    { name: 'Sentiment Score (0-100)', desc: 'Zagregowany wynik sentymentu z analizy newsów i wskaźników. <40 = pesymizm/strach, 40-60 = neutralny, >60 = optymizm, >80 = euforia (ostrożność!).' },
    { name: 'Summary (3 akapity)', desc: 'Akapit 1: stan techniczny (EMA, MACD, RSI, ADX). Akapit 2: katalizatory i fundamenty (earnings, newsy, sentyment). Akapit 3: rekomendacja z entry/SL/TP i oceną setupu.' },
    { name: 'Bull Case / Bear Case', desc: 'Konkretne argumenty za wzrostem i spadkiem z liczbami z danych. Badge „DOMINANT" = ta strona jest silniejsza wg algorytmu. Przygaszona strona = mniej prawdopodobna.' },
  ]},
  { cat: 'GLOBAL DATA & FUNDAMENTALS', color: '#f59e0b', items: [
    { name: 'Bieżący Status', desc: 'Aktualna sytuacja rynkowa spółki — pozycja vs 52W High/Low, kierunek trendu, kontekst makroekonomiczny.' },
    { name: 'Prognoza (1 mc)', desc: 'Scenariusz bazowy na najbliższy miesiąc uwzględniający zbliżające się wyniki kwartalne i wydarzenia rynkowe.' },
    { name: 'Sentyment Elit & Płynność', desc: 'Pozycjonowanie instytucjonalne, sygnały „smart money" — kto kupuje, kto sprzedaje, rotacja sektorowa.' },
    { name: 'Profil Dywidendowy', desc: 'Trend dywidendy, yield, stabilność wypłat. Ważne dla inwestorów income-oriented.' },
    { name: 'Zainteresowanie Publiczne', desc: 'Sentyment medialny — ile artykułów pozytywnych vs negatywnych. Wysoki pozytywny sentyment przy szczycie = potencjalny sygnał eufori.' },
    { name: 'Twardy Kierunek', desc: 'Finalny werdykt AI: kierunek (LONG/SHORT) + siła przekonania + kluczowy katalizator + główne ryzyko. Jednozadniowe podsumowanie.' },
  ]},
  // ===== SEKCJA: FUNDAMENTY ROZSZERZONE =====
  { cat: 'ANALIZA FUNDAMENTALNA', color: '#8b5cf6', items: [
    { name: 'Wycena (P/E, PEG, P/B, P/S, EV/EBITDA)', desc: 'P/E <20 = tanie, >40 = drogie. PEG <1 = niedowartościowanie wzrostu. P/B <1 = akcje tańsze niż aktywa. EV/EBITDA <15 = atrakcyjne.' },
    { name: 'Rentowność (ROE, ROA, Marże)', desc: 'ROE >15% = doskonała efektywność. Marża netto >15% = wysoka rentowność. Malejące marże = ostrzeżenie o erozji zysków.' },
    { name: 'Wzrost (EPS Growth, Revenue Growth)', desc: 'Wzrost zysku i przychodów na akcję za 3-5 lat. Rosnący EPS + rosnąca cena = zdrowy trend. Spadający EPS = fundamentalne osłabienie.' },
    { name: 'Zdrowie finansowe (D/E, Current Ratio, FCF)', desc: 'D/E <1 = niskie zadłużenie, >2 = ryzyko. Current Ratio >1.5 = dobra płynność. FCF >0 = firma generuje gotówkę.' },
    { name: 'Siła Relatywna vs S&P 500', desc: 'Alpha = nadwyżkowy zwrot vs indeks w danym okresie. Zielony = spółka bije rynek P500). Czerwony = przegrywa z rynkiem.' },
    { name: 'Beta', desc: 'Wrażliwość na ruchy rynku. Beta >1.5 = wysoka zmienność (agresywne aktywo). Beta <0.8 = defensywne (mniej zmienne niż rynek).' },
  ]},
  // ===== SEKCJA: TREND ALIGNMENT MATRIX =====
  { cat: 'TREND ALIGNMENT MATRIX', color: '#00e5ff', items: [
    { name: 'Tabela wyrównania sygnałów', desc: 'Macierz 5 timeframe\'ów (1W/1M/3M/6M/1Y) × 4 wskaźniki. BULL (zielony) = sygnał wzrostowy, BEAR (czerwony) = spadkowy, OB/OS = wykupienie/wyprzedanie.' },
    { name: 'Price Change', desc: 'Procentowa zmiana ceny w danym timeframe. Pokazuje momentum cenowe w różnych horyzontach czasowych.' },
    { name: 'EMA Cross (9/21)', desc: 'Czy EMA9 > EMA21 (BULL) czy < (BEAR) w danym przedziale. Krótkoterminowy sygnał kierunkowy.' },
    { name: 'MACD', desc: 'Czy linia MACD jest powyżej sygnału (BULL) czy poniżej (BEAR). Momentum w danej ramie czasowej.' },
    { name: 'RSI Zone', desc: 'Strefa RSI: BULL (>55), BEAR (<45), NEUTRAL (45-55), OVERBOUGHT (>65), OVERSOLD (<35).' },
    { name: 'Price vs EMA200', desc: 'Cena powyżej EMA200 = BULL (strefa instytucjonalna), poniżej = BEAR. Najważniejszy filtr długoterminowy.' },
    { name: 'Alignment %', desc: 'Procent wyrównania sygnałów w jednym kierunku. >70% BULL = silny confluent wzrostowy. >70% BEAR = silny confluent spadkowy.' },
  ]},
  // ===== SEKCJA: KALENDARIUM =====
  { cat: 'KALENDARIUM ANOMALII', color: '#8b5cf6', items: [
    { name: 'Volatile Days (Top 5)', desc: 'Lista 5 dni z największymi ruchami cenowymi w wybranym okresie. Kliknij na dzień aby zobaczyć szczegółową analizę z artykułami.' },
    { name: 'Fioletowe punkty na wykresie', desc: 'Te same dni co w Volatile Days — oznaczone jako duże kropki na wykresie. Kliknij dowolny punkt wykresu aby zobaczyć co się działo danego dnia.' },
    { name: 'Artykuły źródłowe', desc: 'Lista przefiltrowanych newsów z danego dnia z linkami do oryginalnych artykułów. Źródło: Massive API (Polygon-compatible).' },
    { name: 'Głęboka Analiza Quantum', desc: 'Analiza AI (Gemma) streamowana w czasie rzeczywistym. Wyjaśnia przyczyny ruchu cenowego w wybranym dniu w 3 zdaniach.' },
  ]},
  // ===== SEKCJA: NARZĘDZIA =====
  { cat: 'NARZĘDZIA & NAWIGACJA', color: '#94a3b8', items: [
    { name: 'Watchlist (★)', desc: 'Osobista lista obserwowanych spółek — zapisywana w LocalStorage przeglądarki. Kliknij ★ przy tickerze aby dodać/usunąć. Szybki podgląd ceny i zmiany %.' },
    { name: 'PDF (Drukuj)', desc: 'Eksportuje aktualny dashboard do formatu PDF za pomocą systemowego okna drukowania. Optymalizowane pod wydruk.' },
    { name: 'Legenda (ta)', desc: 'Pełny opis wszystkich elementów interfejsu i wskaźników technicznych.' },
  ]},
];

export default function Legend({ onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '2rem', maxWidth: '1100px', width: '100%', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', position: 'sticky', top: '-2rem', background: 'var(--card-bg)', paddingTop: '0.5rem', paddingBottom: '0.8rem', zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HelpCircle size={22} color="var(--accent-blue)" /> Pełna Legenda — Autograph Terminal
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Opis wszystkich elementów interfejsu, sekcji i wskaźników technicznych.</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 8px', display: 'flex', alignItems: 'center', transition: 'background 0.2s' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {LEGEND_ITEMS.map((cat, ci) => (
            <div key={ci} style={{ background: 'rgba(255,255,255,0.025)', borderRadius: '10px', padding: '0.9rem', borderLeft: `3px solid ${cat.color}` }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 'bold', color: cat.color, letterSpacing: '0.1em', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: `1px solid ${cat.color}22` }}>{cat.cat}</div>
              {cat.items.map((item, ii) => (
                <div key={ii} style={{ marginBottom: ii < cat.items.length - 1 ? '0.55rem' : 0 }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 'bold', color: '#fff' }}>{item.name}</span>
                  <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{item.desc}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1.2rem', padding: '0.8rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '10px' }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#f59e0b', textAlign: 'center', lineHeight: 1.5 }}>
            ⚠️ Wskaźniki techniczne i analizy AI opisują stan historyczny — <strong>nie gwarantują przyszłych wyników</strong>. Zawsze stosuj zarządzanie ryzykiem i nie inwestuj więcej niż możesz stracić.
          </p>
        </div>
      </div>
    </div>
  );
}
