import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Login() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
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
        if (!email || !password) {
            setError("Wypełnij wszystkie pola.");
            return;
        }
        setLoading(true);
        setTimeout(() => {
            const result = login({ email, password });
            if (result.success) {
                navigate("/autograph");
            } else {
                setError(result.error);
            }
            setLoading(false);
        }, 400);
    };

    return (
        <div className="auth-page" style={{ '--mouse-x': `${mousePos.x}%`, '--mouse-y': `${mousePos.y}%` }}>
            <div className="auth-card">
                <div className="auth-logo" onClick={() => navigate("/")} style={{ cursor: 'pointer' }}>Autograph</div>
                <h2 className="auth-title">Witaj ponownie</h2>
                <p className="auth-subtitle">Zaloguj się, aby kontynuować analizę rynków</p>

                {error && (
                    <div className="auth-error">
                        <i className="fa-solid fa-circle-exclamation"></i>
                        {error}
                    </div>
                )}

                <form className="auth-form" onSubmit={handleSubmit}>
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
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="auth-submit"
                        disabled={loading}
                    >
                        {loading ? "Logowanie..." : "Zaloguj się"}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        Nie masz konta?{" "}
                        <Link to="/register">Zarejestruj się</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
