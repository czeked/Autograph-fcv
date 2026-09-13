import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Register() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            setMousePos({ x, y });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        setError("");

        if (!username || !email || !password || !confirmPassword) {
            setError("Wypełnij wszystkie pola.");
            return;
        }

        if (username.length < 3) {
            setError("Nazwa użytkownika musi mieć minimum 3 znaki.");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError("Podaj prawidłowy adres e-mail.");
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=(?:.*[^a-zA-Z0-9_;[\]{}/.,'":?><\\|\-\s]){2,})[^_;[\]{}/.,'":?><\\|\-]{9,}$/;
        if (!passwordRegex.test(password)) {
            setError("Hasło musi mieć min. 9 znaków, 1 wielką, 1 małą literę, 1 cyfrę i 2 znaki specjalne.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Hasła nie są identyczne.");
            return;
        }

        setLoading(true);

        setTimeout(() => {
            const result = register({ username, email, password });
            if (result.success) {
                navigate("/autograph");
            } else {
                setError(result.error);
            }
            setLoading(false);
        }, 500);
    };

    return (
        <div className="auth-page" style={{ '--mouse-x': `${mousePos.x}%`, '--mouse-y': `${mousePos.y}%` }}>
            <div className="auth-card">
                <div className="auth-logo" onClick={() => navigate("/")} style={{ cursor: 'pointer' }}>Autograph</div>
                <h2 className="auth-title">Utwórz konto</h2>
                <p className="auth-subtitle">Dołącz do 700 tys. użytkowników analizujących rynki</p>

                {error && (
                    <div className="auth-error">
                        <i className="fa-solid fa-circle-exclamation"></i>
                        {error}
                    </div>
                )}

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="auth-field">
                        <label>Nazwa użytkownika</label>
                        <input
                            type="text"
                            placeholder="Twoja nazwa"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                        />
                    </div>

                    <div className="auth-field">
                        <label>Adres E-mail</label>
                        <input
                            type="email"
                            placeholder="twoj@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                        />
                    </div>

                    <div className="auth-field">
                        <label>Hasło</label>
                        <input
                            type="password"
                            placeholder="Min. 9 znaków, 1W, 1m, 1C, 2S"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="auth-field">
                        <label>Powtórz hasło</label>
                        <input
                            type="password"
                            placeholder="Powtórz hasło"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="auth-submit"
                        disabled={loading}
                    >
                        {loading ? "Tworzenie konta..." : "Zarejestruj się"}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        Masz już konto?{" "}
                        <Link to="/login">Zaloguj się</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
