import { useState } from "react";
import "./Help.css";

const HELP_DATA = {
    account: {
        id: "account",
        title: "Zarządzanie kontem",
        icon: "fa-solid fa-user-gear",
        description: "Zmiana danych, bezpieczeństwo i subskrypcje.",
        content: [
            { q: "Jak zmienić hasło?", a: "Przejdź do sekcji Profil, gdzie znajdziesz formularz zmiany hasła pod swoimi danymi podstawowymi." },
            { q: "Jak zmienić zdjęcie profilowe?", a: "W sekcji Profil kliknij przycisk 'Prześlij' obok swojego obecnego awatara." },
            { q: "Gdzie znajdę informacje o moim planie?", a: "Informacje o aktywnym planie znajdziesz w sekcji Plany." },
            { q: "Nie pamiętam hasła - co zrobić?", a: "Jeśli zapomniałeś hasła, skontaktuj się z naszym zespołem wsparcia pod adresem office@autograph.com lub użyj przycisku 'Zapomniałem hasła' na ekranie logowania, aby otrzymać link resetujący." }
        ]
    },
    ai: {
        id: "ai",
        title: "Analiza AI",
        icon: "fa-solid fa-robot",
        description: "Jak interpretować wyniki i optymalizować zapytania.",
        content: [
            { q: "Czym jest wskaźnik sentymentu?", a: "Wskaźnik sentymentu to analiza nastrojów rynkowych na podstawie danych z wiadomości i mediów społecznościowych." },
            { q: "Jak często aktualizowane są dane?", a: "Dane rynkowe są aktualizowane w czasie rzeczywistym, natomiast głęboka analiza AI odbywa się raz na dobę." },
            { q: "Czy mogę ufać prognozom AI?", a: "AI to narzędzie wspomagające analizę techniczną i fundamentalną. Nigdy nie traktuj prognoz jako pewnej porady inwestycyjnej." }
        ]
    },
    payments: {
        id: "payments",
        title: "Płatności",
        icon: "fa-solid fa-credit-card",
        description: "Faktury, metody płatności i zwroty.",
        content: [
            { q: "Jakie metody płatności są akceptowane?", a: "Akceptujemy karty płatnicze (Visa, Mastercard), Google Pay, Apple Pay oraz PayPal poprzez system Stripe." },
            { q: "Jak zrezygnować z subskrypcji?", a: "Rezygnacja jest możliwa w każdej chwili w sekcji Plany. Dostęp pozostanie aktywny do końca opłaconego okresu." },
            { q: "Kiedy otrzymam fakturę?", a: "Faktura jest generowana automatycznie po zaksięgowaniu wpłaty i wysyłana na Twój adres e-mail." }
        ]
    },
    privacy: {
        id: "privacy",
        title: "Prywatność",
        icon: "fa-solid fa-shield-halved",
        description: "Twoje dane i sposób ich przetwarzania.",
        content: [
            { q: "Czy moje dane są bezpieczne?", a: "Tak, wszystkie dane są szyfrowane i przechowywane zgodnie ze standardami RODO/GDPR." },
            { q: "Czy udostępniacie moje dane osobom trzecim?", a: "Nigdy nie sprzedajemy ani nie udostępniamy Twoich danych osobowych firmom zewnętrznym w celach marketingowych." }
        ]
    }
};

export default function Help() {
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");

    const allQuestions = Object.values(HELP_DATA).flatMap(cat => 
        cat.content.map(item => ({ ...item, categoryTitle: cat.title, categoryId: cat.id }))
    );

    const filteredQuestions = searchQuery.length > 2 
        ? allQuestions.filter(item => 
            item.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
            item.a.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : [];

    if (selectedCategory) {
        const category = HELP_DATA[selectedCategory];
        return (
            <div className="panel-help">
                <button className="back-btn" onClick={() => setSelectedCategory(null)}>
                    <i className="fa-solid fa-arrow-left"></i> Wróć do Centrum Pomocy
                </button>
                
                <div className="category-detail">
                    <div className="category-header">
                        <i className={category.icon}></i>
                        <h1>{category.title}</h1>
                    </div>
                    
                    <div className="faq-list">
                        {category.content.map((item, index) => (
                            <div key={index} className="faq-item">
                                <h3>{item.q}</h3>
                                <p>{item.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="panel-help">
            <div className="panel-header">
                <h1>Pomoc</h1>
                <p>Znajdź odpowiedzi na swoje pytania lub skontaktuj się z naszym zespołem.</p>
            </div>

            <div className="help-search">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input 
                    type="text" 
                    placeholder="W czym możemy Ci pomóc?" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                
                {searchQuery.length > 2 && (
                    <div className="search-results">
                        {filteredQuestions.length > 0 ? (
                            filteredQuestions.map((item, index) => (
                                <div key={index} className="search-result-item" onClick={() => {
                                    setSelectedCategory(item.categoryId);
                                    setSearchQuery("");
                                }}>
                                    <span className="res-cat">{item.categoryTitle}</span>
                                    <span className="res-q">{item.q}</span>
                                </div>
                            ))
                        ) : (
                            <div className="no-results">Brak wyników dla "{searchQuery}"</div>
                        )}
                    </div>
                )}
            </div>

            <div className="help-grid">
                {Object.values(HELP_DATA).map(category => (
                    <div key={category.id} className="help-card" onClick={() => setSelectedCategory(category.id)}>
                        <i className={category.icon}></i>
                        <h3>{category.title}</h3>
                        <p>{category.description}</p>
                    </div>
                ))}
            </div>

            <div className="help-contact-section">
                <h2>Skontaktuj się z nami</h2>
                <div className="contact-grid">
                    <div className="contact-item">
                        <i className="fa-solid fa-envelope"></i>
                        <div>
                            <h4>Email</h4>
                            <p>office@autograph.com</p>
                        </div>
                    </div>
                    <div className="contact-item">
                        <i className="fa-solid fa-phone"></i>
                        <div>
                            <h4>Telefon</h4>
                            <p>+48 213 420 967</p>
                        </div>
                    </div>
                    <div className="contact-item">
                        <i className="fa-solid fa-location-dot"></i>
                        <div>
                            <h4>Biuro</h4>
                            <p>ul. Szeroka 17, Kraków</p>
                            <p className="sub-text">Pon - Pt: 08:00 - 15:00</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}