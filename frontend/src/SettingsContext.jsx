import { createContext, useContext, useState, useEffect, useCallback } from "react";

const SettingsContext = createContext();

const SETTINGS_KEY = "autograph_settings";

export const DEFAULT_SETTINGS = {
    // ── OGÓLNE ──
    language: "pl",
    theme: "dark",               // dark | light | oled
    defaultCurrency: "USD",
    startPage: "/autograph",     // where to go after login

    // ── AI TRADER (Krypto) ──
    trader_defaultTicker: "BTC",
    trader_autoRefresh: true,
    trader_refreshInterval: 5,   // minutes (1, 5, 15, 30)
    trader_chartType: "candlestick",
    trader_overlays: ["fibonacci"],
    trader_rsiOversold: 30,
    trader_rsiOverbought: 70,
    trader_percentThreshold: 3,  // % change to trigger notification

    // ── AI ANALYZER (Rynek tradycyjny) ──
    analyzer_defaultTimeframe: "1Y",
    analyzer_autoLoadLast: true,
    analyzer_showEMA: true,
    analyzer_showVolume: true,
    analyzer_showBB: false,
    analyzer_confidenceFilter: "all", // all | high | medium+

    // ── AI DIVIDENDS ──
    dividends_defaultTab: "all",
    dividends_defaultSort: "score",
    dividends_minYield: 0,
    dividends_buyOnly: false,
    dividends_exDivAlertDays: 7, // days before ex-div to alert

    // ── POWIADOMIENIA (zaawansowane) ──
    notif_volume: 40,            // 0-100
    notif_bannerDuration: 8,     // seconds
    notif_maxCount: 50,
    notif_autoClear: "never",    // 1h | 6h | 24h | 7d | never
    notif_cooldownMinutes: 30,   // min between same ticker+type notif
};

const TRANSLATIONS = {
    pl: {
        settings_title: "Ustawienia",
        settings_desc: "Dostosuj aplikację do swoich preferencji. Zmiany zostaną zapisane po kliknięciu „Zapisz zmiany\".",
        general: "Ogólne",
        language: "Język aplikacji",
        theme: "Motyw kolorystyczny",
        currency: "Domyślna waluta",
        start_page: "Strona startowa po zalogowaniu",
        save_changes: "Zapisz zmiany",
        reset: "Resetuj",
        profile: "Profil",
        plans: "Plany",
        notifications: "Powiadomienia",
        help: "Pomoc",
        logout: "Wyloguj",
        login: "Logowanie",
        register: "Rejestracja",
        trader_title: "AiTrader — Kryptowaluty",
        analyzer_title: "AiAnalyzer — Rynek tradycyjny",
        dividends_title: "AiDividends — Spółki dywidendowe",
    },
    en: {
        settings_title: "Settings",
        settings_desc: "Adjust the app to your preferences. Changes will be saved after clicking \"Save Changes\".",
        general: "General",
        language: "App Language",
        theme: "Color Theme",
        currency: "Default Currency",
        start_page: "Start page after login",
        save_changes: "Save Changes",
        reset: "Reset",
        profile: "Profile",
        plans: "Plans",
        notifications: "Notifications",
        help: "Help",
        logout: "Logout",
        login: "Login",
        register: "Register",
        trader_title: "AiTrader — Cryptocurrencies",
        analyzer_title: "AiAnalyzer — Traditional Market",
        dividends_title: "AiDividends — Dividend Stocks",
    }
};

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
}

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(loadSettings);
    const [dirty, setDirty] = useState(false);

    const t = useCallback((key) => {
        const lang = settings.language || "pl";
        return TRANSLATIONS[lang]?.[key] || TRANSLATIONS["pl"][key] || key;
    }, [settings.language]);

    // Persist on every save (not on every change — save is explicit via UserPage)
    const saveSettings = useCallback(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        setDirty(false);
    }, [settings]);

    // Sync theme with body class
    useEffect(() => {
        document.body.className = `theme-${settings.theme || "dark"}`;
    }, [settings.theme]);

    // Removed auto-persist to respect the explicit "Save Changes" workflow in UserPage
    // This allows users to discard changes if they don't click Save.

    const updateSetting = useCallback((key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setDirty(true);
    }, []);

    const updateMultiple = useCallback((updates) => {
        setSettings(prev => ({ ...prev, ...updates }));
        setDirty(true);
    }, []);

    const resetToDefaults = useCallback(() => {
        setSettings({ ...DEFAULT_SETTINGS });
        setDirty(true);
    }, []);

    return (
        <SettingsContext.Provider value={{
            settings,
            dirty,
            t,
            updateSetting,
            updateMultiple,
            saveSettings,
            resetToDefaults,
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
    return ctx;
}
