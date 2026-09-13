import { useEffect } from "react";
import Header from "./Header";
import Footer from "./Footer";
import DividendsPanel from "./components/dividends/DividendsPanel";

export default function AiDividends() {
    useEffect(() => {
        if (!localStorage.getItem("autograph_plan")) {
            localStorage.setItem("autograph_plan", "maximum");
        }
    }, []);

    return (
        <>
            <Header />
            <div className="dividends-page">
                <DividendsPanel />
            </div>
            <Footer />
        </>
    );
}
