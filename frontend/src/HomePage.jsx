import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

export default function HomePage() {
    const navigate = useNavigate();
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

    return (
        <div className="homepage" style={{ '--mouse-x': `${mousePos.x}%`, '--mouse-y': `${mousePos.y}%` }}>
            <h1>Autograph</h1>
            <p>Analizer rynków</p>

            <button onClick={()=> navigate("/getstarted")}>Zacznij</button>
        </div>
    )
}