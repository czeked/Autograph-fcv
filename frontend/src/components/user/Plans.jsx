import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Plans({ showToast }) {
    const navigate = useNavigate();
    const [currentPlan, setCurrentPlan] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState("");
    const [billingDate, setBillingDate] = useState("");
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);



    useEffect(() => {
        const plan = localStorage.getItem("autograph_plan");
        if (plan && plan !== "none") {
            setCurrentPlan(plan);
            setPaymentMethod(localStorage.getItem("autograph_payment_method") || "");
            setBillingDate(localStorage.getItem("autograph_billing_date") || "");
        } else {
            setCurrentPlan(null);
        }
    }, []);

    const handleCancel = () => {
        setShowCancelConfirm(true);
    };

    const confirmCancel = () => {
        localStorage.setItem("autograph_plan", "none");
        localStorage.removeItem("autograph_payment_method");
        localStorage.removeItem("autograph_billing_date");
        setCurrentPlan(null);
        setShowCancelConfirm(false);

        window.dispatchEvent(new Event("planChange")); // 🔥 DODANE

        if (showToast) showToast("Subskrypcja została anulowana.", "error");
    };

    const handleSelectPlan = (planId) => {
        navigate(`/checkout?plan=${planId}`);
    };

    const planNames = {
        "free": "Free Plan",
        "pro": "Professional Plan",
        "maximum": "Maximum Plan"
    };

    return (
        <div className="panel-plans">
            <div className="panel-header">
                <h1>Twoje Plany</h1>
                <p>Wybierz pakiet dopasowany do Twoich potrzeb i odblokuj pełną moc AI.</p>
            </div>

            {currentPlan ? (
                <div className="current-plan-box">
                    <h2>Twój obecny plan: <span className="highlight">{planNames[currentPlan]}</span></h2>

                    <div className="plan-details-grid">
                        <div className="plan-detail-card">
                            <i className="fa-solid fa-credit-card"></i>
                            <p>Metoda subskrypcji</p>
                            <h4>{paymentMethod}</h4>
                        </div>

                        <div className="plan-detail-card">
                            <i className="fa-regular fa-calendar-days"></i>
                            <p>Następne rozliczenie</p>
                            <h4>{billingDate}</h4>
                        </div>

                        <div className="plan-detail-card">
                            <i className="fa-solid fa-box"></i>
                            <p>Status</p>
                            <h4 style={{ color: '#22c55e' }}>Aktywny</h4>
                        </div>
                    </div>

                    <div className="plan-actions">
                        <button className="cancel-sub-btn" onClick={handleCancel}>Zrezygnuj z subskrypcji</button>
                    </div>
                </div>
            ) : (
                <div className="panel-plans-no-access" style={{ padding: '0', textAlign: 'left', marginBottom: '20px' }}>
                    <h1 style={{ fontSize: '28px', margin: '0 0 10px 0' }}>Brak aktywnego planu</h1>
                    <p style={{ color: '#aaa' }}>Nie masz dostępu do funkcji AI (Autograph, AiTrader). Wybierz plan, aby rozpocząć!</p>
                </div>
            )}

            <h2 style={{ marginTop: '40px', fontFamily: 'Cy Grotesk Grand', color: '#fff' }}>Wszystkie możliwości:</h2>
            <div className="block-plans-sec plans-in-user" style={{ padding: '0', marginTop: '20px' }}>

                {/* FREE PLAN */}
                <div className="block-plan" style={{ background: currentPlan === 'free' ? '#2a201b' : 'transparent' }}>
                    <i className="fa-solid fa-suitcase-rolling"></i>
                    <h2>Free Plan</h2>
                    <span className="plan-subtitle">Inteligencja do codziennej analizy</span>
                    <p>0,00 zł / miesiąc</p>

                    <ul className="plan-features">
                        <li><i className="fa-solid fa-check"></i> Ograniczony dostęp do modelu podstawowego GraphRail 2.1</li>
                        <li><i className="fa-solid fa-check"></i> Ograniczone wiadomości i analizowanie</li>
                        <li><i className="fa-solid fa-check"></i> Ograniczone i wolniejsze generowanie odpowiedzi</li>
                        <li><i className="fa-solid fa-check"></i> Ograniczone głębokie badania i analizy</li>
                        <li><i className="fa-solid fa-check"></i> Ograniczony kontekst</li>
                        <li><i className="fa-solid fa-check"></i> Ograniczony dostęp do wyboru walut rynkowych</li>
                    </ul>

                    {currentPlan === 'free' ? (
                        <button disabled className="plan-choose-btn plan-choose-active">Obecny plan</button>
                    ) : (
                        <button className="plan-choose-btn" onClick={() => handleSelectPlan('free')}>Wybierz</button>
                    )}
                </div>

                {/* PRO PLAN */}
                <div className="box-frame" style={currentPlan === 'pro' ? { transform: 'scale(1)' } : {}}>
                    
                    <div className="block-plan" style={{ background: currentPlan === 'pro' ? '#2a201b' : 'transparent' }}>
                        <i className="fa-solid fa-medal"></i>
                        <h2>Professional Plan</h2>
                        <p className="plan-subtitle">Więcej możliwości z zaawansowaną inteligencją</p>
                        <p>64,99 zł / miesiąc</p>

                        <ul className="plan-features">
                            <li><i className="fa-solid fa-check"></i> Zaawansowane modele rozumujące</li>
                            <li><i className="fa-solid fa-check"></i> Rozszerzone wiadomości i analizowanie</li>
                            <li><i className="fa-solid fa-check"></i> Rozszerzone i szybsze generowanie odpowiedzi</li>
                            <li><i className="fa-solid fa-check"></i> Rozszerzone głębokie badania i analizy</li>
                            <li><i className="fa-solid fa-check"></i> Rozszerzony kontekst</li>
                            <li><i className="fa-solid fa-check"></i> Rozszerzony dostęp do wyboru walut rynkowych</li>
                            <li><i className="fa-solid fa-check"></i> Ograniczone przesłanie własnej analizy do oceny przez zaawansowane modele</li>
                            <li><i className="fa-solid fa-check"></i> Wczesny dostęp do nowych funkcji</li>
                        </ul>

                        {currentPlan === 'pro' ? (
                            <button disabled className="plan-choose-btn plan-choose-active">Obecny plan</button>
                        ) : (
                            <button className="plan-choose-btn" onClick={() => handleSelectPlan('pro')}>Wybierz</button>
                        )}
                    </div>
                </div>

                {/* MAXIMUM PLAN */}
                <div className="block-plan" style={{ background: currentPlan === 'maximum' ? '#2a201b' : 'transparent' }}>
                    <i className="fa-solid fa-trophy"></i>
                    <h2>Maximum Plan</h2>
                    <span className="plan-subtitle">Wszystko, co zawiera plan Professional, a dodatkowo:</span>
                    <p>179,99 zł / miesiąc</p>

                    <ul className="plan-features">
                        <li><i className="fa-solid fa-check"></i> 10x lub 20x więcej użytkowania</li>
                        <li><i className="fa-solid fa-check"></i> Rozumowanie Pro w Claude Opus 4.7 i GraphRail 2.3 Pro</li>
                        <li><i className="fa-solid fa-check"></i> Nielimitowany dostęp do GraphRail 2.1 Pro i wysyłania wiadomości</li>
                        <li><i className="fa-solid fa-check"></i> Nieograniczona, szybka analiza i odpowiedź</li>
                        <li><i className="fa-solid fa-check"></i> Maksymalne wykorzystanie funkcji głębokiego badania i analizy</li>
                        <li><i className="fa-solid fa-check"></i> Maksymalny kontekst</li>
                        <li><i className="fa-solid fa-check"></i> Pełny dostęp do wyboru walut rynkowych</li>
                        <li><i className="fa-solid fa-check"></i> Nielimitowane wysyłanie własnych analiz do oceny</li>
                        <li><i className="fa-solid fa-check"></i> Dostęp do sekcji "Rynki dywidendowe"</li>
                        <li><i className="fa-solid fa-check"></i> Rozszerzony dostęp do nowych funkcji</li>
                        <li><i className="fa-solid fa-check"></i> Nielimitowana możliwość zmiany nazwy użytkownika</li>
                    </ul>

                    {currentPlan === 'maximum' ? (
                        <button disabled className="plan-choose-btn plan-choose-active">Obecny plan</button>
                    ) : (
                        <button className="plan-choose-btn" onClick={() => handleSelectPlan('maximum')}>Wybierz</button>
                    )}
                </div>

            </div>

            {/* CANCEL CONFIRM MODAL */}
            {showCancelConfirm && (
                <div className="warning-bar">
                    <p>Czy na pewno chcesz zrezygnować z subskrypcji?</p>
                    <div>
                        <button onClick={confirmCancel}>Tak, zrezygnuj</button>
                        <button onClick={() => setShowCancelConfirm(false)}>Anuluj</button>
                    </div>
                </div>
            )}

        </div>
    );
}