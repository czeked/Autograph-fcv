import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useSettings } from "./SettingsContext";

export default function Header({ onNavigate }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { isLoggedIn, user } = useAuth();
    const { t } = useSettings();
    const [isMaximum, setIsMaximum] = useState(false);

    useEffect(() => {
        const plan = localStorage.getItem("autograph_plan") || (user?.plan);
        setIsMaximum(plan === "maximum");
    }, [user]);

    const handleNavigate = (path) => {
        if (onNavigate) {
            onNavigate(path);
        } else {
            navigate(path);
        }
    };

    return (
        <div className="header">
            <div className="icons">
                {isLoggedIn ? (
                    <>
                        <i 
                            className={`fa-regular fa-user ${location.pathname === "/user" ? "selected" : ""}`} 
                            title={t("profile")} 
                            onClick={() => handleNavigate("/user")}
                        ></i>
                        <i 
                            className={`fa-solid fa-chart-column ${location.pathname === "/autograph" ? "selected" : ""}`} 
                            title={t("analyzer_title")} 
                            onClick={() => handleNavigate("/autograph")}
                        ></i>
                        <i 
                            className={`fa-brands fa-bitcoin ${location.pathname === "/aitrader" ? "selected" : ""}`} 
                            title={t("trader_title")} 
                            onClick={() => handleNavigate("/aitrader")}
                        ></i>
                        {isMaximum && (
                            <i
                                className={`fa-solid fa-chart-pie ai-dividends-icon ${location.pathname === "/aidividends" ? "selected" : ""}`}
                                title={t("dividends_title")}
                                onClick={() => handleNavigate("/aidividends")}
                            ></i>
                        )}
                    </>
                ) : (
                    <div className="header-auth-links">
                        <span 
                            className={`header-link ${location.pathname === "/login" ? "active" : ""}`}
                            onClick={() => navigate("/login")}
                        >
                            {t("login")}
                        </span>
                        <span 
                            className="header-link-divider">/</span>
                        <span 
                            className={`header-link ${location.pathname === "/register" ? "active" : ""}`}
                            onClick={() => navigate("/register")}
                        >
                            {t("register")}
                        </span>
                    </div>
                )}
            </div>
            <h1 onClick={() => navigate("/")} style={{ cursor: 'pointer' }}>Autograph</h1>
        </div>
    );
}