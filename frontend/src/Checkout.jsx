import { useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Checkout() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const plan = searchParams.get("plan");
    
    const [selectedMethod, setSelectedMethod] = useState(null);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = "info") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handlePayment = () => {
        // Wybrano plan płatny, ale nie zaznaczono metody
        if (plan !== "free" && !selectedMethod) {
            showToast("Wybierz metodę płatności!", "error");
            return;
        }

        // Zapisujemy w "bazie" symulację opłacenia i logiki
        localStorage.setItem("autograph_plan", plan);
        
        let method = selectedMethod;
        if (plan === "free") method = "Darmowy";
        
        localStorage.setItem("autograph_payment_method", method);
        
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        localStorage.setItem("autograph_billing_date", nextMonth.toLocaleDateString());

        showToast(`Pomyślnie aktywowano plan: ${plan.toUpperCase()}`, "success");
        setTimeout(() => navigate("/user"), 1500);
    };

    const getPlanPrice = () => {
        if(plan === "free") return "0,00 zł";
        if(plan === "pro") return "64,99 zł";
        if(plan === "maximum") return "179,99 zł";
        return "Nieznany";
    };

    const getPlanName = () => {
        if(plan === "free") return "Free Plan";
        if(plan === "pro") return "Professional Plan";
        if(plan === "maximum") return "Maximum Plan";
        return "Plan";
    }

    return (
        <div className="checkout-container">
            <div className="checkout-box">
                <h1 className="checkout-logo">Autograph</h1>
                <h2>Podsumowanie zamówienia</h2>
                
                <div className="checkout-summary">
                    <p>Wybrany pakiet: <strong>{getPlanName()}</strong></p>
                    <p>Kwota do zapłaty: <strong>{getPlanPrice()} / miesiąc</strong></p>
                </div>

                {plan !== "free" && (
                    <div className="checkout-methods">
                        <h3>Wybierz metodę płatności</h3>
                        <div className="methods-grid">
                            <button className={selectedMethod === "VISA" ? "active" : ""} onClick={() => setSelectedMethod("VISA")}>
                                <i className="fa-brands fa-cc-visa"></i> VISA
                            </button>
                            <button className={selectedMethod === "GPAY" ? "active" : ""} onClick={() => setSelectedMethod("GPAY")}>
                                <i className="fa-brands fa-google-pay"></i> GPay
                            </button>
                            <button className={selectedMethod === "APPLE PAY" ? "active" : ""} onClick={() => setSelectedMethod("APPLE PAY")}>
                                <i className="fa-brands fa-apple"></i> Apple Pay
                            </button>
                            <button className={selectedMethod === "PAYPAL" ? "active" : ""} onClick={() => setSelectedMethod("PAYPAL")}>
                                <i className="fa-brands fa-paypal"></i> PayPal
                            </button>
                            <button className={selectedMethod === "STRIPE" ? "active" : ""} onClick={() => setSelectedMethod("STRIPE")}>
                                <i className="fa-brands fa-stripe-s"></i> Stripe
                            </button>
                        </div>
                    </div>
                )}

                <button className="pay-btn" onClick={handlePayment}>
                    {plan === "free" ? "Wybierz" : "Zapłać"}
                </button>
                <button className="cancel-btn" onClick={() => navigate(-1)}>Anuluj</button>
            </div>

            {/* TOAST */}
            {toast && (
                <div className={`toast-notification toast-${toast.type}`}>
                    <i className={toast.type === "success" ? "fa-solid fa-circle-check" : toast.type === "error" ? "fa-solid fa-circle-exclamation" : "fa-solid fa-circle-info"}></i>
                    <span>{toast.message}</span>
                </div>
            )}
        </div>
    );
}
