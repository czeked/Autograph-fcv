import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Footer() {
    const navigate = useNavigate();
    const { logout } = useAuth();


    return (
        <div className="footer">
            <div className="texts">
                <div className="version">
                    <h1>Autograph</h1>
                    <p>wersja 2.21.6526</p>
                </div>

                <div className="motivation">
                    <h2>Dla Ciebie.</h2>
                    <h2>Dla analizy.</h2>
                </div>
            </div>


            <div className="informations">
                <div className="i-block">
                    <h1>Biuro</h1>
                    <ol>
                        <li>47-015 Kraków, Polska</li>
                        <li>ul. Szeroka 17</li>
                        <li>Tel. +48 213 420 967</li>
                        <li>office@autograph.com</li>
                    </ol>
                </div>

                <div className="i-block">
                    <h1>Godziny otwarcia</h1>
                    <ol>
                        <li>Poniedziałek - Piątek: 08:00 - 15:00</li>
                        <li>Sobota i Niedziela: Zamknięte</li>
                    </ol>
                </div>

                <div className="i-block">
                    <h1>Konto</h1>
                    <ol>
                        <li className="clickable" onClick={() => navigate("/user", { state: { section: "profile" } })}>Profil</li>
                        <li className="clickable" onClick={() => navigate("/user", { state: { section: "plans" } })}>Twoje plany</li>
                        <li className="clickable" onClick={() => navigate("/user", { state: { section: "settings" } })}>Ustawienia</li>
                        <li className="clickable" onClick={() => navigate("/user", { state: { section: "help" } })}>Pomoc</li>
                        <li className="clickable" onClick={() => { logout(); navigate("/"); }}>Wyloguj</li>
                    </ol>
                </div>

                <div className="i-block">
                    <h1>Informacje</h1>
                    <ol>
                        <li className="clickable" onClick={() => navigate("/user", { state: { section: "help" } })}>Jak działa Autograph?</li>
                        <li className="creators-link clickable">
                            Twórcy
                            <div className="creators-tooltip">
                                <strong>SCRUM MASTER</strong> Jakub Szczęśniak<br />
                                <strong>DEV</strong> Kamil Sosnowski<br />
                                <strong>DEV</strong> Oskar Wojciechowski
                            </div>
                        </li>
                        <li className="locked">Changelog</li>
                    </ol>
                </div>
            </div>

            <hr />

            <div className="finish-footer">
                <div className="media">
                    <h2>Dołącz do nas</h2>
                    <i className="fa-brands fa-instagram"></i>
                    <i className="fa-brands fa-x-twitter"></i>
                </div>
                <div className="payments">
                    <i className="fa-brands fa-google-pay"></i>
                    <i className="fa-brands fa-apple-pay"></i>
                    <i className="fa-brands fa-cc-visa"></i>
                    <i className="fa-brands fa-cc-paypal"></i>
                    <i className="fa-brands fa-stripe"></i>
                </div>
            </div>



            <hr />

            <div className="disclaimer">
                <p>Program AUTOGRAPH to nie jest porada inwestycyjna. Aplikacja została stworzona dla wsparcia analizy inwestorów.</p>
                <p className="disclaimer-red">Pamiętaj, że inwestowanie wiąże się z ryzykiem.</p>
            </div>

        </div>
    )
}