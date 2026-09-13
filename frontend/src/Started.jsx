import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Started() {
    const navigate = useNavigate();
    const { isLoggedIn } = useAuth();
    const [counts, setCounts] = useState({ users: 0, analysis: 0, signals: 0 });
    const observerRef = useRef(null);

    // Target values for count-up animation
    const targets = { users: 700, analysis: 25, signals: 140 };

    useEffect(() => {
        // Intersection Observer to trigger animations
        const options = { threshold: 0.1 };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('anim-visible');

                    if (entry.target.classList.contains('offers-extra')) {
                        startCountUp();
                    }
                }
            });
        }, options);

        const animatedElements = document.querySelectorAll('.anim-hidden, .icons-sep, .extra-item, .box-frame, .block-plan');
        animatedElements.forEach(el => observer.observe(el));
        observerRef.current = observer;

        return () => observer.disconnect();
    }, []);

    const startCountUp = () => {
        const duration = 2000;
        const steps = 50;
        const interval = duration / steps;

        let currentStep = 0;
        const timer = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;

            setCounts({
                users: Math.floor(targets.users * progress),
                analysis: Math.floor(targets.analysis * progress),
                signals: Math.floor(targets.signals * progress)
            });

            if (currentStep >= steps) clearInterval(timer);
        }, interval);
    };

    const handlePlanSelection = (plan) => {
        if (!isLoggedIn) {
            navigate("/login", { state: { redirect: "/checkout", plan } });
        } else {
            navigate("/user", { state: { section: "plans" } });
        }
    };

    return (
        <div className="started-container">
            {/* Background Particles */}
            <div className="started-particles">
                {[...Array(15)].map((_, i) => (
                    <div key={i} className="started-particle"></div>
                ))}
            </div>

            {/* SECTION 1: HELLO */}
            <section className="div-hello">
                <div className="hello-tx anim-hidden">
                    <p className="hello-hero-text">
                        <span className="line visible">Witamy w <span className="strong">Autograph</span>.</span>
                        <br />
                        <span className="line visible anim-delay-1">Twoim osobistym centrum</span>
                        <br />
                        <span className="line visible anim-delay-2">analizy <span className="strong">finansowej</span>.</span>
                    </p>
                    <div className="tptext anim-hidden anim-delay-3">
                        Dołącz do ponad 700 000 użytkowników i zyskaj przewagę na rynkach dzięki potędze sztucznej inteligencji.
                    </div>
                </div>
                
                <div className="scroll-indicator anim-hidden anim-delay-4">
                    <button className="scroll-btn" onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}>
                        <i className="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
            </section>

            {/* SECTION 2: OFFERS */}
            <section className="div-offers">
                <div className="anim-hidden">
                    <p className="div-offers-subtitle">NAJSZYBSZA ANALIZA RYNKU</p>
                    <h1>Wszystko, czego potrzebujesz</h1>
                </div>

                <div className="icons-s">
                    <div className="icons-sep anim-hidden anim-delay-1">
                        <div className="icon-wrapper"><i className="fa-solid fa-brain"></i></div>
                        <h3>Modele Rozumujące</h3>
                        <p>Dostęp do zaawansowanych modeli GraphRail 2.3 i Claude Opus 4.7 do głębokiej analizy fundamentów.</p>
                    </div>
                    <div className="icons-sep anim-hidden anim-delay-2">
                        <div className="icon-wrapper"><i className="fa-solid fa-bolt"></i></div>
                        <h3>Błyskawiczne Dane</h3>
                        <p>Analiza tysięcy spółek i kryptowalut w czasie rzeczywistym. Decyzje oparte na faktach, nie emocjach.</p>
                    </div>
                    <div className="icons-sep anim-hidden anim-delay-3">
                        <div className="icon-wrapper"><i className="fa-solid fa-bell"></i></div>
                        <h3>Inteligentne Alerty</h3>
                        <p>Powiadomienia o zmianach trendów, komunikatach ESPI i okazjach dywidendowych prosto na Twój telefon.</p>
                    </div>
                    <div className="icons-sep anim-hidden anim-delay-4">
                        <div className="icon-wrapper"><i className="fa-solid fa-gem"></i></div>
                        <h3>Ekskluzywny Wgląd</h3>
                        <p>Dostęp do sekcji "Rynki dywidendowe" i priorytetowe generowanie odpowiedzi dla planu Maximum.</p>
                    </div>
                </div>

                <div className="offers-extra anim-hidden anim-delay-2">
                    <div className="extra-item">
                        <span className="extra-num">{counts.users}k+</span>
                        <span className="extra-label">Inwestorów</span>
                    </div>
                    <div className="extra-divider"></div>
                    <div className="extra-item">
                        <span className="extra-num">{counts.analysis}M+</span>
                        <span className="extra-label">Analiz/Doba</span>
                    </div>
                    <div className="extra-divider"></div>
                    <div className="extra-item">
                        <span className="extra-num">{counts.signals}</span>
                        <span className="extra-label">Sygnałów AI</span>
                    </div>
                </div>

                <div className="scroll-indicator anim-hidden anim-delay-4">
                    <button className="scroll-btn" onClick={() => window.scrollTo({ top: window.innerHeight * 2, behavior: 'smooth' })}>
                        <i className="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
            </section>

            {/* SECTION 3: PLANS */}
            <section className="div-plans">
                <div className="anim-hidden">
                    <h1>Plany Subskrypcji</h1>
                </div>

                <div className="block-plans-sec">
                    {/* FREE */}
                    <div className="block-plan anim-hidden anim-delay-1">
                        <i className="fa-solid fa-suitcase-rolling"></i>
                        <h2>Free Plan</h2>
                        <span className="plan-subtitle">Podstawowa analiza</span>
                        <p className="plan-price">0,00 zł <small>/ msc</small></p>
                        <button className="plan-choose-btn" onClick={() => handlePlanSelection('free')}>Wybierz</button>
                    </div>

                    {/* MAXIMUM */}
                    <div className="block-plan featured anim-hidden anim-delay-2">
                        <div className="plan-badge">Najczęściej wybierany</div>
                        <i className="fa-solid fa-trophy" style={{ color: "gold" }}></i>
                        <h2>Maximum Plan</h2>
                        <span className="plan-subtitle">Pełna moc Autograph</span>
                        <p className="plan-price">179,99 zł <small>/ msc</small></p>
                        <button className="plan-choose-btn featured-btn" onClick={() => handlePlanSelection('maximum')}>Wybierz</button>
                    </div>

                    {/* PRO */}
                    <div className="block-plan anim-hidden anim-delay-3">
                        <i className="fa-solid fa-medal"></i>
                        <h2>Professional</h2>
                        <span className="plan-subtitle">Dla zaawansowanych</span>
                        <p className="plan-price">64,99 zł <small>/ msc</small></p>
                        <button className="plan-choose-btn" onClick={() => handlePlanSelection('pro')}>Wybierz</button>
                    </div>
                </div>

                <div className="scroll-indicator anim-hidden anim-delay-4">
                    <button className="scroll-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <i className="fa-solid fa-chevron-up"></i>
                    </button>
                </div>

                <div className="started-footer anim-hidden anim-delay-4">
                    <p onClick={() => navigate("/")} className="footer-logo">Autograph</p>
                </div>
            </section>
        </div>
    );
}