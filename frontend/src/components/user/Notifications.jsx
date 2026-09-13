import { useNotifications } from "../../NotificationContext";

const SOURCE_ICONS = {
    crypto: "₿",
    stocks: "📈",
    dividends: "💰",
    system: "⚙️",
};

const SOURCE_LABELS = {
    crypto: "Kryptowaluty",
    stocks: "Rynek tradycyjny",
    dividends: "Spółki dywidendowe",
    system: "System",
};

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "teraz";
    if (mins < 60) return `${mins} min temu`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h temu`;
    const days = Math.floor(hrs / 24);
    return `${days}d temu`;
}

export default function Notifications({ setHasChanges, currentPlan }) {
    const {
        settings,
        notifications,
        toggleSetting,
        removeNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        settingsChanged,
        playNotificationSound,
    } = useNotifications();

    const isMaximum = currentPlan === "maximum";

    const handleToggle = (key) => {
        toggleSetting(key);
        setHasChanges(true);
    };

    const handleSoundToggle = (key, source) => {
        toggleSetting(key);
        setHasChanges(true);
        // Play sound as a test if enabled
        if (!settings[key]) { // If we just enabled it
             playNotificationSound(source);
        }
    };

    return (
        <div className="panel-notifications">
            <div className="panel-header">
                <h1>Powiadomienia</h1>
                <p>Zarządzaj swoimi alertami i bądź na bieżąco z rynkiem.</p>
            </div>

            <div className="notify-p">

                <div className="notify-list">

                    {/* SYSTEM */}
                    <div className="notify-row">
                        <span>Powiadomienia systemowe</span>

                        <div className="notify-actions">
                            <i className={`fa-solid ${settings.systemSound ? "fa-volume-high" : "fa-volume-xmark"}`}
                                onClick={() => handleSoundToggle("systemSound", "system")}
                            />

                            <div
                                className={`toggle ${settings.system ? "active" : ""}`}
                                onClick={() => handleToggle("system")}
                            >
                                <div className="circle"></div>
                            </div>
                        </div>
                    </div>

                    {/* UPDATES */}
                    <div className="notify-row">
                        <span>Powiadomienia o zaplanowanych aktualizacjach</span>

                        <div className="notify-actions">
                            <div
                                className={`toggle ${settings.updates ? "active" : ""}`}
                                onClick={() => handleToggle("updates")}
                            >
                                <div className="circle"></div>
                            </div>
                        </div>
                    </div>

                    {/* CRYPTO */}
                    <div className="notify-group">
                        <div className="notify-row">
                            <span>Rynek kryptowalut</span>

                            <div className="notify-actions">
                                <i className={`fa-solid ${settings.cryptoSound ? "fa-volume-high" : "fa-volume-xmark"}`}
                                    onClick={() => handleSoundToggle("cryptoSound", "crypto")}
                                />

                                <div
                                    className={`toggle ${settings.crypto ? "active" : ""}`}
                                    onClick={() => handleToggle("crypto")}
                                >
                                    <div className="circle"></div>
                                </div>
                            </div>
                        </div>

                        <div className={`notify-sub ${!settings.crypto ? "disabled" : ""}`}>
                            <div className="notify-row">
                                <span>Skoki cenowe (price alerts)</span>
                                <div className={`toggle ${settings.cryptoPrice ? "active" : ""}`}
                                    onClick={() => handleToggle("cryptoPrice")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Zmiany procentowe</span>
                                <div className={`toggle ${settings.cryptoPercent ? "active" : ""}`}
                                    onClick={() => handleToggle("cryptoPercent")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Komunikaty ESPI/EBI</span>
                                <div className={`toggle ${settings.cryptoEspi ? "active" : ""}`}
                                    onClick={() => handleToggle("cryptoEspi")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Breaking news</span>
                                <div className={`toggle ${settings.cryptoNews ? "active" : ""}`}
                                    onClick={() => handleToggle("cryptoNews")}>
                                    <div className="circle"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* STOCKS */}
                    <div className="notify-group">
                        <div className="notify-row">
                            <span>Rynek tradycyjny</span>

                            <div className="notify-actions">
                                <i className={`fa-solid ${settings.stocksSound ? "fa-volume-high" : "fa-volume-xmark"}`}
                                    onClick={() => handleSoundToggle("stocksSound", "stocks")}
                                />

                                <div
                                    className={`toggle ${settings.stocks ? "active" : ""}`}
                                    onClick={() => handleToggle("stocks")}
                                >
                                    <div className="circle"></div>
                                </div>
                            </div>
                        </div>

                        <div className={`notify-sub ${!settings.stocks ? "disabled" : ""}`}>
                            <div className="notify-row">
                                <span>Zmiany procentowe</span>
                                <div className={`toggle ${settings.stocksPercent ? "active" : ""}`}
                                    onClick={() => handleToggle("stocksPercent")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Komunikaty ESPI/EBI</span>
                                <div className={`toggle ${settings.stocksEspi ? "active" : ""}`}
                                    onClick={() => handleToggle("stocksEspi")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Breaking news</span>
                                <div className={`toggle ${settings.stocksNews ? "active" : ""}`}
                                    onClick={() => handleToggle("stocksNews")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Raporty sprzedażowe</span>
                                <div className={`toggle ${settings.stocksReports ? "active" : ""}`}
                                    onClick={() => handleToggle("stocksReports")}>
                                    <div className="circle"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* DIVIDENDS */}
                    <div className={`notify-group ${!isMaximum ? "locked" : ""}`}>
                        <div className="notify-row">
                            <span>Spółki dywidendowe</span>

                            <div className="notify-actions">
                                <i className={`fa-solid ${settings.dividendsSound ? "fa-volume-high" : "fa-volume-xmark"}`}
                                    onClick={() => {
                                        if (!isMaximum) return;
                                        handleSoundToggle("dividendsSound", "dividends");
                                    }}
                                />

                                <div
                                    className={`toggle ${settings.dividends ? "active" : ""}`}
                                    onClick={() => {
                                        if (!isMaximum) return;
                                        handleToggle("dividends");
                                    }}
                                >
                                    <div className="circle"></div>
                                </div>
                            </div>
                        </div>

                        <div className={`notify-sub ${(!settings.dividends || !isMaximum) ? "disabled" : ""}`}>
                            <div className="notify-row">
                                <span>Zmiany procentowe</span>
                                <div className={`toggle ${settings.dividendsPercent ? "active" : ""}`}
                                    onClick={() => handleToggle("dividendsPercent")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Komunikaty ESPI/EBI</span>
                                <div className={`toggle ${settings.dividendsEspi ? "active" : ""}`}
                                    onClick={() => handleToggle("dividendsEspi")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Breaking news</span>
                                <div className={`toggle ${settings.dividendsNews ? "active" : ""}`}
                                    onClick={() => handleToggle("dividendsNews")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Raporty sprzedażowe</span>
                                <div className={`toggle ${settings.dividendsReports ? "active" : ""}`}
                                    onClick={() => handleToggle("dividendsReports")}>
                                    <div className="circle"></div>
                                </div>
                            </div>

                            <div className="notify-row">
                                <span>Dzień dywidendy</span>
                                <div className={`toggle ${settings.dividendsDay ? "active" : ""}`}
                                    onClick={() => handleToggle("dividendsDay")}>
                                    <div className="circle"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>


                <div className="notify-feed">
                    <div className="notify-feed-header">
                        <h3>Najnowsze powiadomienia</h3>
                        {notifications.length > 0 && (
                            <div className="notify-feed-actions">
                                <button className="notify-action-btn" onClick={markAllAsRead} title="Oznacz wszystkie jako przeczytane">
                                    <i className="fa-solid fa-check-double"></i>
                                </button>
                                <button className="notify-action-btn notify-action-btn--danger" onClick={clearAll} title="Wyczyść wszystkie">
                                    <i className="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        )}
                    </div>

                    {notifications.length === 0 ? (
                        <div className="notify-empty">
                            <i className="fa-regular fa-bell-slash notify-empty-icon"></i>
                            <p>Brak nowych powiadomień</p>
                            <span className="notify-empty-hint">Włącz powiadomienia dla wybranych rynków, aby otrzymywać alerty</span>
                        </div>
                    ) : (
                        <div className="notify-items-list">
                            {notifications.map(n => (
                                <div
                                    className={`notify-item ${!n.read ? "notify-item--unread" : ""}`}
                                    key={n.id}
                                    onClick={() => markAsRead(n.id)}
                                >
                                    <div className="notify-item-icon">
                                        <span className="notify-item-source-icon">
                                            {SOURCE_ICONS[n.source] || "🔔"}
                                        </span>
                                    </div>
                                    <div className="notify-item-body">
                                        <div className="notify-item-top">
                                            <span className={`notify-source-badge notify-source-badge--${n.source}`}>
                                                {SOURCE_LABELS[n.source] || n.source}
                                            </span>
                                            {!n.read && <span className="notify-badge-new">nowe</span>}
                                        </div>
                                        <p className="notify-item-text">{n.text}</p>
                                        {n.ticker && <span className="notify-item-ticker">{n.ticker}</span>}
                                        <span className="notify-item-time">{timeAgo(n.timestamp)}</span>
                                    </div>
                                    <button
                                        className="remove-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeNotification(n.id);
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}