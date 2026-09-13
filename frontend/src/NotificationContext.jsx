import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

const NotificationContext = createContext();

const SETTINGS_KEY = "autograph_notification_settings";
const NOTIFICATIONS_KEY = "autograph_notifications";
const COOLDOWN_KEY = "autograph_notif_cooldowns";

const DEFAULT_SETTINGS = {
    systemSound: true,
    system: false,
    updates: false,

    cryptoSound: true,
    crypto: true,
    cryptoPrice: true,
    cryptoPercent: true,
    cryptoEspi: false,
    cryptoNews: true,

    stocksSound: false,
    stocks: false,
    stocksPercent: false,
    stocksEspi: false,
    stocksNews: false,
    stocksReports: false,

    dividendsSound: false,
    dividends: false,
    dividendsPercent: false,
    dividendsEspi: false,
    dividendsNews: false,
    dividendsReports: false,
    dividendsDay: false,
};

const SOURCE_LABELS = {
    crypto: "Kryptowaluty",
    stocks: "Rynek tradycyjny",
    dividends: "Spółki dywidendowe",
    system: "System",
};

const SOURCE_ICONS = {
    crypto: "₿",
    stocks: "📈",
    dividends: "💰",
    system: "⚙️",
};

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
}

function loadNotifications() {
    try {
        const raw = localStorage.getItem(NOTIFICATIONS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
}

function loadCooldowns() {
    try {
        const raw = localStorage.getItem(COOLDOWN_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
}

function saveCooldowns(cooldowns) {
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(cooldowns));
}

export function NotificationProvider({ children }) {
    const [settings, setSettings] = useState(loadSettings);
    const [notifications, setNotifications] = useState(loadNotifications);
    const [bannerNotification, setBannerNotification] = useState(null);
    const [settingsChanged, setSettingsChanged] = useState(false);
    const cooldownsRef = useRef(loadCooldowns());
    const sentHashesRef = useRef(new Set());

    // Load app settings for cooldown/banner config
    const getAppSettings = useCallback(() => {
        try {
            const raw = localStorage.getItem("autograph_settings");
            if (raw) return JSON.parse(raw);
        } catch { /* ignore */ }
        return {};
    }, []);

    // Persist settings
    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    // Persist notifications (max from settings)
    useEffect(() => {
        const appSettings = getAppSettings();
        const maxCount = appSettings.notif_maxCount || 50;
        const toStore = notifications.slice(0, maxCount);
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(toStore));
    }, [notifications, getAppSettings]);

    // Auto-clear old notifications based on settings
    useEffect(() => {
        const appSettings = getAppSettings();
        const autoClear = appSettings.notif_autoClear || "never";
        if (autoClear === "never") return;

        const maxAgeMs = {
            "1h": 3600000,
            "6h": 21600000,
            "24h": 86400000,
            "7d": 604800000,
        }[autoClear];

        if (!maxAgeMs) return;

        const interval = setInterval(() => {
            const now = Date.now();
            setNotifications(prev => prev.filter(n => (now - n.timestamp) < maxAgeMs));
        }, 60000); // Check every minute

        return () => clearInterval(interval);
    }, [getAppSettings]);

    // Auto-hide banner based on settings duration
    useEffect(() => {
        if (!bannerNotification) return;
        const appSettings = getAppSettings();
        const duration = (appSettings.notif_bannerDuration || 8) * 1000;
        const timer = setTimeout(() => setBannerNotification(null), duration);
        return () => clearTimeout(timer);
    }, [bannerNotification, getAppSettings]);

    const updateSetting = useCallback((key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setSettingsChanged(true);
    }, []);

    const toggleSetting = useCallback((key) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
        setSettingsChanged(true);
    }, []);

    const saveSettings = useCallback(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        setSettingsChanged(false);
    }, [settings]);

    // ── Deduplication & Cooldown System ──

    // Generate a hash for dedup (same text = same notification)
    const generateHash = useCallback((text) => {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const chr = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash.toString();
    }, []);

    // Check if notification is on cooldown (same ticker+type combo)
    const isOnCooldown = useCallback((ticker, type) => {
        const key = `${ticker}:${type}`;
        const cooldowns = cooldownsRef.current;
        const lastTime = cooldowns[key];
        if (!lastTime) return false;

        const appSettings = getAppSettings();
        const cooldownMs = (appSettings.notif_cooldownMinutes || 30) * 60 * 1000;
        return (Date.now() - lastTime) < cooldownMs;
    }, [getAppSettings]);

    // Set cooldown for ticker+type
    const setCooldown = useCallback((ticker, type) => {
        const key = `${ticker}:${type}`;
        cooldownsRef.current[key] = Date.now();

        // Clean old cooldowns (older than 2h)
        const now = Date.now();
        const cleaned = {};
        Object.entries(cooldownsRef.current).forEach(([k, v]) => {
            if ((now - v) < 7200000) cleaned[k] = v;
        });
        cooldownsRef.current = cleaned;
        saveCooldowns(cleaned);
    }, []);

    // Check if text was already sent (dedup within session)
    const isDuplicate = useCallback((text) => {
        const hash = generateHash(text);
        if (sentHashesRef.current.has(hash)) return true;
        sentHashesRef.current.add(hash);
        // Clean set if too large
        if (sentHashesRef.current.size > 200) {
            const arr = [...sentHashesRef.current];
            sentHashesRef.current = new Set(arr.slice(-100));
        }
        return false;
    }, [generateHash]);

    // Notification Sound
    const playNotificationSound = useCallback((source) => {
        const soundEnabled = {
            system: settings.systemSound,
            crypto: settings.cryptoSound,
            stocks: settings.stocksSound,
            dividends: settings.dividendsSound
        }[source];

        if (soundEnabled) {
            const appSettings = getAppSettings();
            const volume = (appSettings.notif_volume ?? 40) / 100;
            const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3");
            audio.volume = Math.max(0, Math.min(1, volume));
            audio.play().catch(() => {});
        }
    }, [settings, getAppSettings]);

    const addNotification = useCallback((notif) => {
        // ── SMART FILTERING ──
        // 1. Check dedup (same text in session)
        if (isDuplicate(notif.text)) return;

        // 2. Check cooldown (same ticker+type combo)
        if (notif.ticker && isOnCooldown(notif.ticker, notif.type)) return;

        // 3. Set cooldown for this ticker+type
        if (notif.ticker) setCooldown(notif.ticker, notif.type);

        const newNotif = {
            ...notif,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            read: false,
        };

        const appSettings = getAppSettings();
        const maxCount = appSettings.notif_maxCount || 50;

        setNotifications(prev => [newNotif, ...prev].slice(0, maxCount));
        setBannerNotification(newNotif);
        
        // Play sound if enabled
        playNotificationSound(notif.source);
    }, [playNotificationSound, isDuplicate, isOnCooldown, setCooldown, getAppSettings]);

    const removeNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const markAsRead = useCallback((id) => {
        setNotifications(prev =>
            prev.map(n => n.id === id ? { ...n, read: true } : n)
        );
    }, []);

    const markAllAsRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    const dismissBanner = useCallback(() => {
        setBannerNotification(null);
    }, []);

    // Check if a notification type is enabled
    const isTypeEnabled = useCallback((source, type) => {
        if (source === "crypto") {
            if (!settings.crypto) return false;
            const map = {
                price: settings.cryptoPrice,
                percent: settings.cryptoPercent,
                espi: settings.cryptoEspi,
                news: settings.cryptoNews,
            };
            return map[type] ?? false;
        }
        if (source === "stocks") {
            if (!settings.stocks) return false;
            const map = {
                percent: settings.stocksPercent,
                espi: settings.stocksEspi,
                news: settings.stocksNews,
                reports: settings.stocksReports,
            };
            return map[type] ?? false;
        }
        if (source === "dividends") {
            if (!settings.dividends) return false;
            const map = {
                percent: settings.dividendsPercent,
                espi: settings.dividendsEspi,
                news: settings.dividendsNews,
                reports: settings.dividendsReports,
                day: settings.dividendsDay,
            };
            return map[type] ?? false;
        }
        return false;
    }, [settings]);

    // Listen for custom events from AI components
    useEffect(() => {
        const handleAINotification = (e) => {
            const { source, items } = e.detail;
            if (!items || !Array.isArray(items)) return;

            items.forEach(item => {
                if (isTypeEnabled(item.source || source, item.type)) {
                    addNotification({
                        source: item.source || source,
                        type: item.type,
                        text: item.text,
                        ticker: item.ticker || "",
                    });
                }
            });
        };

        window.addEventListener("autograph:notification", handleAINotification);
        return () => window.removeEventListener("autograph:notification", handleAINotification);
    }, [isTypeEnabled, addNotification]);

    const unreadCount = notifications.filter(n => !n.read).length;

    // Filtered notifications based on current settings
    const filteredNotifications = notifications.filter(n => {
        if (n.source === "crypto" && !settings.crypto) return false;
        if (n.source === "stocks" && !settings.stocks) return false;
        if (n.source === "dividends" && !settings.dividends) return false;
        return true;
    });

    return (
        <NotificationContext.Provider value={{
            settings,
            notifications: filteredNotifications,
            allNotifications: notifications,
            bannerNotification,
            unreadCount,
            settingsChanged,
            updateSetting,
            toggleSetting,
            saveSettings,
            addNotification,
            removeNotification,
            markAsRead,
            markAllAsRead,
            clearAll,
            dismissBanner,
            isTypeEnabled,
            playNotificationSound,
            SOURCE_LABELS,
            SOURCE_ICONS,
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const ctx = useContext(NotificationContext);
    if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
    return ctx;
}

export { SOURCE_LABELS, SOURCE_ICONS };
