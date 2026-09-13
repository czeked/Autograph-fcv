import { useNavigate } from "react-router-dom";
import { useNotifications } from "./NotificationContext";

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

export default function NotificationBanner() {
    const navigate = useNavigate();
    const { bannerNotification, dismissBanner, markAsRead } = useNotifications();

    if (!bannerNotification) return null;

    const sourceLabel = SOURCE_LABELS[bannerNotification.source] || bannerNotification.source;
    const sourceIcon = SOURCE_ICONS[bannerNotification.source] || "🔔";

    const handleClick = () => {
        markAsRead(bannerNotification.id);
        dismissBanner();
        navigate("/user", { state: { section: "notifications" } });
    };

    const handleDismiss = (e) => {
        e.stopPropagation();
        dismissBanner();
    };

    return (
        <div className="notification-banner" onClick={handleClick}>
            <div className="notification-banner-inner">
                <div className="notification-banner-icon">
                    <i className="fa-solid fa-bell notification-bell-pulse"></i>
                </div>
                <div className="notification-banner-content">
                    <span className="notification-banner-label">Masz nowe powiadomienie:</span>
                    <span className="notification-banner-source">
                        <span className="notification-banner-source-icon">{sourceIcon}</span>
                        {sourceLabel}
                    </span>
                </div>
                <div className="notification-banner-preview">
                    {bannerNotification.text}
                </div>
                <button className="notification-banner-close" onClick={handleDismiss}>
                    <i className="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
    );
}
