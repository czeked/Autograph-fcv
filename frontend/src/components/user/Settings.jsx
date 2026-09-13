import { useSettings } from "../../SettingsContext";

const OVERLAY_OPTIONS = [
    { key: "fibonacci", label: "Zniesienia Fibonacciego" },
    { key: "rsi", label: "Wskaźnik RSI" },
    { key: "ema", label: "Wstęgi EMA 12/26" },
    { key: "sma", label: "Średnie SMA 20/50" },
    { key: "bb", label: "Wstęgi Bollingera" },
];

export default function Settings({ setHasChanges }) {
    const { settings, updateSetting, resetToDefaults, t } = useSettings();

    const handleChange = (key, value) => {
        updateSetting(key, value);
        setHasChanges(true);
    };

    const handleOverlayToggle = (overlay) => {
        const current = settings.trader_overlays || [];
        const next = current.includes(overlay)
            ? current.filter(o => o !== overlay)
            : [...current, overlay];
        handleChange("trader_overlays", next);
    };

    return (
        <div className="panel-settings">
            <div className="panel-header">
                <h1>{t("settings_title")}</h1>
                <p>{t("settings_desc")}</p>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* SEKCJA: OGÓLNE                              */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="section-title">
                    <i className="fa-solid fa-gear"></i>
                    <h2>{t("general")}</h2>
                </div>

                <div className="settings-card">
                    <div className="settings-grid">
                        <div className="settings-field">
                            <label>{t("language")}</label>
                            <select
                                value={settings.language}
                                onChange={(e) => handleChange("language", e.target.value)}
                            >
                                <option value="pl">🇵🇱 Polski</option>
                                <option value="en">🇬🇧 English</option>
                            </select>
                        </div>

                        <div className="settings-field">
                            <label>{t("theme")}</label>
                            <select
                                value={settings.theme}
                                onChange={(e) => handleChange("theme", e.target.value)}
                            >
                                <option value="dark">🌙 {settings.language === 'pl' ? 'Ciemny (Standard)' : 'Dark (Standard)'}</option>
                                <option value="light">☀️ {settings.language === 'pl' ? 'Jasny' : 'Light'}</option>
                                <option value="oled">⬛ {settings.language === 'pl' ? 'OLED (Głęboka czerń)' : 'OLED (Deep Black)'}</option>
                            </select>
                        </div>

                        <div className="settings-field">
                            <label>{t("currency")}</label>
                            <select
                                value={settings.defaultCurrency}
                                onChange={(e) => handleChange("defaultCurrency", e.target.value)}
                            >
                                {["USD", "EUR", "GBP", "PLN", "JPY", "CAD", "AUD"].map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div className="settings-field">
                            <label>{t("start_page")}</label>
                            <select
                                value={settings.startPage}
                                onChange={(e) => handleChange("startPage", e.target.value)}
                            >
                                <option value="/">Strona główna</option>
                                <option value="/autograph">AiAnalyzer (Rynek tradycyjny)</option>
                                <option value="/aitrader">AiTrader (Kryptowaluty)</option>
                                <option value="/aidividends">AiDividends (Dywidendy)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* SEKCJA: AI TRADER                           */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="section-title">
                    <i className="fa-brands fa-bitcoin"></i>
                    <h2>{t("trader_title")}</h2>
                </div>

                <div className="settings-card">
                    <div className="settings-grid">
                        <div className="settings-field">
                            <label>Domyślna kryptowaluta</label>
                            <input
                                type="text"
                                value={settings.trader_defaultTicker}
                                onChange={(e) => handleChange("trader_defaultTicker", e.target.value.toUpperCase())}
                                placeholder="np. BTC, ETH, SOL..."
                            />
                        </div>

                        <div className="settings-field">
                            <label>Typ wykresu</label>
                            <select
                                value={settings.trader_chartType}
                                onChange={(e) => handleChange("trader_chartType", e.target.value)}
                            >
                                <option value="candlestick">🕯️ Świecowy</option>
                                <option value="line">📈 Liniowy</option>
                                <option value="area">📊 Warstwowy</option>
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <span>Auto-odświeżanie danych</span>
                        <div className="settings-row-right">
                            <div
                                className={`toggle ${settings.trader_autoRefresh ? "active" : ""}`}
                                onClick={() => handleChange("trader_autoRefresh", !settings.trader_autoRefresh)}
                            >
                                <div className="circle"></div>
                            </div>
                        </div>
                    </div>

                    {settings.trader_autoRefresh && (
                        <div className="settings-field slider-field">
                            <label>Interwał odświeżania: <strong>{settings.trader_refreshInterval} min</strong></label>
                            <input
                                type="range"
                                min="1"
                                max="30"
                                step="1"
                                value={settings.trader_refreshInterval}
                                onChange={(e) => handleChange("trader_refreshInterval", parseInt(e.target.value))}
                            />
                            <div className="slider-labels">
                                <span>1 min</span>
                                <span>15 min</span>
                                <span>30 min</span>
                            </div>
                        </div>
                    )}

                    <div className="settings-subsection">
                        <label className="subsection-label">Domyślne overlaye na wykresie</label>
                        <div className="overlay-chips">
                            {OVERLAY_OPTIONS.map(opt => (
                                <button
                                    key={opt.key}
                                    className={`overlay-chip ${(settings.trader_overlays || []).includes(opt.key) ? "active" : ""}`}
                                    onClick={() => handleOverlayToggle(opt.key)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="settings-grid">
                        <div className="settings-field slider-field">
                            <label>Próg RSI — wyprzedanie: <strong>{settings.trader_rsiOversold}</strong></label>
                            <input
                                type="range"
                                min="10"
                                max="40"
                                value={settings.trader_rsiOversold}
                                onChange={(e) => handleChange("trader_rsiOversold", parseInt(e.target.value))}
                            />
                        </div>

                        <div className="settings-field slider-field">
                            <label>Próg RSI — wykupienie: <strong>{settings.trader_rsiOverbought}</strong></label>
                            <input
                                type="range"
                                min="60"
                                max="90"
                                value={settings.trader_rsiOverbought}
                                onChange={(e) => handleChange("trader_rsiOverbought", parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="settings-field slider-field">
                        <label>Próg zmiany procentowej (powiadomienie): <strong>{settings.trader_percentThreshold}%</strong></label>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            step="0.5"
                            value={settings.trader_percentThreshold}
                            onChange={(e) => handleChange("trader_percentThreshold", parseFloat(e.target.value))}
                        />
                        <div className="slider-labels">
                            <span>1%</span>
                            <span>5%</span>
                            <span>10%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* SEKCJA: AI ANALYZER                         */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="section-title">
                    <i className="fa-solid fa-chart-column"></i>
                    <h2>{t("analyzer_title")}</h2>
                </div>

                <div className="settings-card">
                    <div className="settings-grid">
                        <div className="settings-field">
                            <label>Domyślny timeframe</label>
                            <select
                                value={settings.analyzer_defaultTimeframe}
                                onChange={(e) => handleChange("analyzer_defaultTimeframe", e.target.value)}
                            >
                                {["1W", "1M", "3M", "6M", "1Y"].map(tf => (
                                    <option key={tf} value={tf}>{tf}</option>
                                ))}
                            </select>
                        </div>

                        <div className="settings-field">
                            <label>Filtr pewności analizy</label>
                            <select
                                value={settings.analyzer_confidenceFilter}
                                onChange={(e) => handleChange("analyzer_confidenceFilter", e.target.value)}
                            >
                                <option value="all">Pokaż wszystkie</option>
                                <option value="medium+">Średnia i wyższa</option>
                                <option value="high">Tylko wysoka</option>
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <span>Auto-load ostatniego tickera</span>
                        <div
                            className={`toggle ${settings.analyzer_autoLoadLast ? "active" : ""}`}
                            onClick={() => handleChange("analyzer_autoLoadLast", !settings.analyzer_autoLoadLast)}
                        >
                            <div className="circle"></div>
                        </div>
                    </div>

                    <div className="settings-row">
                        <span>Wyświetlaj EMA 50/200 na wykresie</span>
                        <div
                            className={`toggle ${settings.analyzer_showEMA ? "active" : ""}`}
                            onClick={() => handleChange("analyzer_showEMA", !settings.analyzer_showEMA)}
                        >
                            <div className="circle"></div>
                        </div>
                    </div>

                    <div className="settings-row">
                        <span>Wyświetlaj Volume</span>
                        <div
                            className={`toggle ${settings.analyzer_showVolume ? "active" : ""}`}
                            onClick={() => handleChange("analyzer_showVolume", !settings.analyzer_showVolume)}
                        >
                            <div className="circle"></div>
                        </div>
                    </div>

                    <div className="settings-row">
                        <span>Wyświetlaj Bollinger Bands</span>
                        <div
                            className={`toggle ${settings.analyzer_showBB ? "active" : ""}`}
                            onClick={() => handleChange("analyzer_showBB", !settings.analyzer_showBB)}
                        >
                            <div className="circle"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* SEKCJA: AI DIVIDENDS                        */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="section-title">
                    <i className="fa-solid fa-chart-pie"></i>
                    <h2>{t("dividends_title")}</h2>
                </div>

                <div className="settings-card">
                    <div className="settings-grid">
                        <div className="settings-field">
                            <label>Domyślna zakładka</label>
                            <select
                                value={settings.dividends_defaultTab}
                                onChange={(e) => handleChange("dividends_defaultTab", e.target.value)}
                            >
                                <option value="all">Wszystkie</option>
                                <option value="okazje">Okazje</option>
                                <option value="arystokraci">Arystokraci</option>
                                <option value="wzrostowe">Wzrostowe</option>
                                <option value="bezpieczne">Najbezpieczniejsze</option>
                            </select>
                        </div>

                        <div className="settings-field">
                            <label>Domyślne sortowanie</label>
                            <select
                                value={settings.dividends_defaultSort}
                                onChange={(e) => handleChange("dividends_defaultSort", e.target.value)}
                            >
                                <option value="score">Score (opłacalność)</option>
                                <option value="yield">Dividend Yield</option>
                                <option value="price">Cena</option>
                                <option value="pe">P/E Ratio</option>
                                <option value="payout">Payout Ratio</option>
                            </select>
                        </div>
                    </div>

                    <div className="settings-field slider-field">
                        <label>Minimalny dividend yield: <strong>{settings.dividends_minYield}%</strong></label>
                        <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.5"
                            value={settings.dividends_minYield}
                            onChange={(e) => handleChange("dividends_minYield", parseFloat(e.target.value))}
                        />
                        <div className="slider-labels">
                            <span>0%</span>
                            <span>5%</span>
                            <span>10%</span>
                        </div>
                    </div>

                    <div className="settings-row">
                        <span>Pokaż tylko spółki z rekomendacją KUPUJ</span>
                        <div
                            className={`toggle ${settings.dividends_buyOnly ? "active" : ""}`}
                            onClick={() => handleChange("dividends_buyOnly", !settings.dividends_buyOnly)}
                        >
                            <div className="circle"></div>
                        </div>
                    </div>

                    <div className="settings-field slider-field">
                        <label>Alert przed ex-dividend: <strong>{settings.dividends_exDivAlertDays} dni</strong></label>
                        <input
                            type="range"
                            min="1"
                            max="14"
                            value={settings.dividends_exDivAlertDays}
                            onChange={(e) => handleChange("dividends_exDivAlertDays", parseInt(e.target.value))}
                        />
                        <div className="slider-labels">
                            <span>1 dzień</span>
                            <span>7 dni</span>
                            <span>14 dni</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* SEKCJA: POWIADOMIENIA ZAAWANSOWANE           */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="section-title">
                    <i className="fa-solid fa-bell"></i>
                    <h2>Powiadomienia — zaawansowane</h2>
                </div>

                <div className="settings-card">
                    <div className="settings-field slider-field">
                        <label>Głośność dźwięku: <strong>{settings.notif_volume}%</strong></label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={settings.notif_volume}
                            onChange={(e) => handleChange("notif_volume", parseInt(e.target.value))}
                        />
                        <div className="slider-labels">
                            <span>🔇 0%</span>
                            <span>50%</span>
                            <span>🔊 100%</span>
                        </div>
                    </div>

                    <div className="settings-field slider-field">
                        <label>Czas wyświetlania bannera: <strong>{settings.notif_bannerDuration}s</strong></label>
                        <input
                            type="range"
                            min="3"
                            max="15"
                            value={settings.notif_bannerDuration}
                            onChange={(e) => handleChange("notif_bannerDuration", parseInt(e.target.value))}
                        />
                        <div className="slider-labels">
                            <span>3s</span>
                            <span>8s</span>
                            <span>15s</span>
                        </div>
                    </div>

                    <div className="settings-grid">
                        <div className="settings-field slider-field">
                            <label>Maks. powiadomień: <strong>{settings.notif_maxCount}</strong></label>
                            <input
                                type="range"
                                min="10"
                                max="100"
                                step="5"
                                value={settings.notif_maxCount}
                                onChange={(e) => handleChange("notif_maxCount", parseInt(e.target.value))}
                            />
                        </div>

                        <div className="settings-field slider-field">
                            <label>Cooldown (min. między powtórzeniami): <strong>{settings.notif_cooldownMinutes} min</strong></label>
                            <input
                                type="range"
                                min="5"
                                max="120"
                                step="5"
                                value={settings.notif_cooldownMinutes}
                                onChange={(e) => handleChange("notif_cooldownMinutes", parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="settings-field">
                        <label>Automatyczne czyszczenie</label>
                        <select
                            value={settings.notif_autoClear}
                            onChange={(e) => handleChange("notif_autoClear", e.target.value)}
                        >
                            <option value="never">Nigdy</option>
                            <option value="1h">Po 1 godzinie</option>
                            <option value="6h">Po 6 godzinach</option>
                            <option value="24h">Po 24 godzinach</option>
                            <option value="7d">Po 7 dniach</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* RESET                                       */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section settings-danger-zone">
                <div className="section-title">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <h2>Strefa niebezpieczna</h2>
                </div>

                <div className="settings-card settings-card-danger">
                    <div className="settings-row">
                        <div>
                            <span>Przywróć ustawienia domyślne</span>
                            <p className="settings-hint">Wszystkie ustawienia zostaną zresetowane do wartości początkowych.</p>
                        </div>
                        <button
                            className="settings-reset-btn"
                            onClick={() => {
                                if (window.confirm("Czy na pewno chcesz przywrócić ustawienia domyślne?")) {
                                    resetToDefaults();
                                    setHasChanges(true);
                                }
                            }}
                        >
                            <i className="fa-solid fa-rotate-left"></i>
                            Resetuj
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}