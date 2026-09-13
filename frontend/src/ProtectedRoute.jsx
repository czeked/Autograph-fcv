import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children, requiredPlan }) {
    const { isLoggedIn } = useAuth();

    // Not logged in -> redirect to login
    if (!isLoggedIn) {
        return <Navigate to="/login" replace />;
    }

    // Plan validation - only if a specific plan is required (or any plan for tools)
    const currentPlan = localStorage.getItem("autograph_plan") || "none";

    if (requiredPlan) {
        if (currentPlan === "none") {
            return <Navigate to="/user" state={{ section: "plans" }} replace />;
        }
        if (requiredPlan === "maximum" && currentPlan !== "maximum") {
            return <Navigate to="/user" state={{ section: "plans" }} replace />;
        }
    }



    return children;
}
