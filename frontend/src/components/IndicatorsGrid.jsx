import React from 'react';

const DESCRIPTIONS = {
  ema: 'Wykładnicze Średnie Kroczące (EMA) – ważą nowsze ceny bardziej niż SMA. Złoty Krzyż (EMA50 przekracza EMA200 od dołu) to sygnał długoterminowego trendu wzrostowego. Krzyż Śmierci – odwrotnie. Cena powyżej EMA200 = strefa byków.',
  macd: 'MACD = różnica EMA12 – EMA26. Linia sygnału to EMA9 z MACD. Histogram pokazuje dystans między nimi. Crossover bullish (MACD przebija sygnał od dołu) = potencjalny sygnał kupna. Wartości powyżej zera = bycze momentum.',
  bollinger: 'Kanał Bollingera: środek to SMA20, górna/dolna banda to ±2 odchylenia standardowe. Squeeze (wąskie pasma) zapowiada wybicie. Cena przy górnej bandzie = wykupienie, przy dolnej = wyprzedanie. %B > 1 oznacza cenę powyżej górnej bandy.',
  adx: 'ADX mierzy siłę trendu (nie kierunek). ADX > 25 = silny trend, < 20 = brak trendu. +DI > –DI = trend wzrostowy. Stosuj z innymi wskaźnikami do potwierdzenia kierunku.',
  atr: 'ATR (Average True Range) mierzy dzienną zmienność. Wyższy ATR = szersze ruchy. Stop Loss na 2×ATR to popularny poziom – daje cenie "oddychanie" zanim uzna ruch za sygnał.',
  stochRsi: 'Stochastyczny RSI łączy RSI z oscylatorem stochastycznym – szybszy i czulszy niż sam RSI. K > 80 = strefa wykupienia, K < 20 = wyprzedania. Crossover K/D daje sygnały wejścia/wyjścia.',
  fibonacci: 'Poziomy korekty Fibonacciego obliczone między 52W High a 52W Low. Cena często zatrzymuje się lub odbija od 38.2%, 50%, 61.8%. Poziom 61.8% ("złoty stosunek") jest najsilniejszy.',
  pivotPoints: 'Tygodniowe Pivot Points obliczone z poprzedniego tygodnia. P = punkt centralny, R1/R2 = opory, S1/S2 = wsparcia. OBV (On-Balance Volume) mierzy akumulację/dystrybucję na podstawie wolumenu.',
  fundamentyGrid: 'P/E (cena/zysk) – ile płacisz za złotówkę zysku. P/B (cena/wartość księgowa). Wzrost EPS i przychodów 3Y to dynamika fundamentalna. SMA20/50 – proste średnie kroczące z aktualnej ceny.',
};

function Card({ cardKey, title, color, children, activeTooltip, setActiveTooltip }) {
  const isOpen = activeTooltip === cardKey;
  return (
    <div style={{ background: '#252525', border: '1px solid #2e2e2e', borderRadius: '8px', padding: '14px 16px', position: 'relative' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: '8px', borderBottom: `1px solid #2e2e2e`, marginBottom: '8px',
      }}>
        <span style={{ fontSize: '0.6rem', color, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {title}
        </span>
        <button
          onClick={() => setActiveTooltip(isOpen ? null : cardKey)}
          title="Co to jest?"
          style={{
            background: isOpen ? 'rgba(0,168,214,0.22)' : 'rgba(255,255,255,0.1)',
            border: `1px solid ${isOpen ? '#00a8d6' : '#555'}`,
            borderRadius: '50%', width: '18px', height: '18px',
            color: isOpen ? '#00a8d6' : '#aaa',
            fontSize: '0.65rem', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.15s', lineHeight: 1,
          }}
        >?</button>
      </div>
      {isOpen && (
        <div style={{
          marginBottom: '10px', padding: '10px 12px',
          background: '#1a1a1a', border: '1px solid rgba(0,168,214,0.2)',
          borderLeft: '3px solid #00a8d6', borderRadius: '6px',
          fontSize: '0.77rem', color: '#aaa', lineHeight: 1.55,
        }}>
          {DESCRIPTIONS[cardKey]}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {children}
      </div>
    </div>
  );
}

const Row = ({ label, val, valColor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '5px 0', borderBottom: '1px solid #1e1e1e' }}>
    <span style={{ fontSize: '0.8rem', color: '#777', flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: valColor || '#ddd', textAlign: 'right', lineHeight: 1.35 }}>{val}</span>
  </div>
);

export default function IndicatorsGrid({ qs, visibleCards }) {
  if (!qs) return null;
  const show = (key) => !visibleCards || visibleCards[key] !== false;
  const [activeTooltip, setActiveTooltip] = React.useState(null);

  const cardKeys = ['ema','macd','bollinger','adx','atr','stochRsi','fibonacci','pivotPoints','fundamentyGrid'];
  if (!cardKeys.some(show)) return null;

  return (
    <div style={{ marginBottom: '2rem', marginTop: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>

        {show('ema') && (
          <Card cardKey="ema" title="EMA Crossovers (9/21/50/200)" color="var(--accent-blue)" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="EMA 9"    val={`$${qs.ema9}`} />
            <Row label="EMA 21"   val={`$${qs.ema21}`} />
            <Row label="EMA 50"   val={`$${qs.ema50}`} />
            <Row label="EMA 200"  val={`$${qs.ema200}`} />
            <Row label="Sygnał"   val={qs.golden_death_cross} valColor={qs.golden_death_cross?.includes('Golden') ? 'var(--accent-green)' : 'var(--accent-red)'} />
            <Row label="vs EMA200" val={qs.price_vs_ema200} />
          </Card>
        )}

        {show('macd') && (
          <Card cardKey="macd" title="MACD (12/26/9)" color="#f59e0b" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="MACD"      val={qs.macd}          valColor={parseFloat(qs.macd) > 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
            <Row label="Signal"    val={qs.macd_signal} />
            <Row label="Histogram" val={qs.macd_histogram} valColor={parseFloat(qs.macd_histogram) > 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
            <Row label="Cross"     val={qs.macd_cross}     valColor={qs.macd_cross?.includes('BULL') ? 'var(--accent-green)' : 'var(--accent-red)'} />
          </Card>
        )}

        {show('bollinger') && (
          <Card cardKey="bollinger" title="Bollinger Bands (20/2)" color="var(--accent-purple)" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="Upper"   val={`$${qs.bb_upper}`} />
            <Row label="Middle"  val={`$${qs.bb_middle}`} />
            <Row label="Lower"   val={`$${qs.bb_lower}`} />
            <Row label="%B"      val={qs.bb_percentB} />
            <Row label="Squeeze" val={qs.bb_squeeze}   valColor={qs.bb_squeeze?.includes('Squeeze') ? '#f59e0b' : '#555'} />
            <Row label="Pozycja" val={qs.bb_position} />
          </Card>
        )}

        {show('adx') && (
          <Card cardKey="adx" title="ADX — Siła Trendu (14)" color="var(--accent-red)" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="ADX"   val={qs.adx}          valColor={parseFloat(qs.adx) > 25 ? 'var(--accent-green)' : '#f59e0b'} />
            <Row label="+DI"   val={qs.adx_plus_di}  valColor="var(--accent-green)" />
            <Row label="-DI"   val={qs.adx_minus_di} valColor="var(--accent-red)" />
            <Row label="Trend" val={qs.adx_trend} />
          </Card>
        )}

        {show('atr') && (
          <Card cardKey="atr" title="ATR — Zmienność (14)" color="#94a3b8" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="ATR ($)"   val={`$${qs.atr}`} />
            <Row label="ATR (%)"   val={qs.atr_percent} />
            <Row label="SL 2×ATR" val={qs.atr_stop_loss} valColor="var(--accent-red)" />
          </Card>
        )}

        {show('stochRsi') && (
          <Card cardKey="stochRsi" title="Stoch RSI (14/3/3)" color="var(--accent-blue)" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="K"      val={qs.stoch_rsi_k} valColor={parseFloat(qs.stoch_rsi_k) > 80 ? 'var(--accent-red)' : parseFloat(qs.stoch_rsi_k) < 20 ? 'var(--accent-green)' : '#ddd'} />
            <Row label="D"      val={qs.stoch_rsi_d} />
            <Row label="Signal" val={qs.stoch_rsi_signal} valColor={qs.stoch_rsi_signal?.includes('Wykup') ? 'var(--accent-red)' : qs.stoch_rsi_signal?.includes('Wyprz') ? 'var(--accent-green)' : '#888'} />
          </Card>
        )}

        {show('fibonacci') && (
          <Card cardKey="fibonacci" title="Fibonacci (52W)" color="#a78bfa" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="52W High" val={`$${qs.high52w}`} valColor="var(--accent-green)" />
            <Row label="52W Low"  val={`$${qs.low52w}`}  valColor="var(--accent-red)" />
            <Row label="23.6%"    val={`$${qs.fib_236}`} />
            <Row label="38.2%"    val={`$${qs.fib_382}`} />
            <Row label="50.0%"    val={`$${qs.fib_500}`} />
            <Row label="61.8%"    val={`$${qs.fib_618}`} />
            <Row label="78.6%"    val={`$${qs.fib_786}`} />
          </Card>
        )}

        {show('pivotPoints') && (
          <Card cardKey="pivotPoints" title="Pivot Points (tygodniowe)" color="#38bdf8" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="R2"  val={`$${qs.pivot_r2}`} valColor="var(--accent-red)" />
            <Row label="R1"  val={`$${qs.pivot_r1}`} valColor="rgba(239,68,68,0.65)" />
            <Row label="P"   val={`$${qs.pivot_p}`} />
            <Row label="S1"  val={`$${qs.pivot_s1}`} valColor="rgba(34,197,94,0.7)" />
            <Row label="S2"  val={`$${qs.pivot_s2}`} valColor="var(--accent-green)" />
            <Row label="OBV" val={qs.obv_trend} />
          </Card>
        )}

        {show('fundamentyGrid') && (
          <Card cardKey="fundamentyGrid" title="Fundamenty" color="#fbbf24" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
            <Row label="P/E"           val={qs.pe_ratio} />
            <Row label="P/B"           val={qs.pb_ratio} />
            <Row label="EPS Growth 3Y" val={qs.eps_growth}    valColor={parseFloat(qs.eps_growth) > 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
            <Row label="Rev Growth 3Y" val={qs.revenue_growth} valColor={parseFloat(qs.revenue_growth) > 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
            <Row label="SMA 20"        val={`$${qs.sma20}`} />
            <Row label="SMA 50"        val={`$${qs.sma50}`} />
          </Card>
        )}

      </div>
    </div>
  );
}
