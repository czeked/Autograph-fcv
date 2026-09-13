import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext();

const USERS_KEY = "autograph_users";
const CURRENT_USER_KEY = "autograph_current_user";

function loadUsers() {
    try {
        const raw = localStorage.getItem(USERS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
}

function loadCurrentUser() {
    try {
        const raw = localStorage.getItem(CURRENT_USER_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(loadCurrentUser);

    const isLoggedIn = !!user;

    const register = useCallback(({ username, email, password }) => {
        const users = loadUsers();

        // Check if email already exists
        if (users.find(u => u.email === email)) {
            return { success: false, error: "Konto z tym adresem email już istnieje." };
        }

        // Check if username already exists
        if (users.find(u => u.username === username)) {
            return { success: false, error: "Ta nazwa użytkownika jest już zajęta." };
        }

        const newUser = {
            id: `user_${Date.now()}`,
            username,
            email,
            password, // In production, this would be hashed
            avatar: "/imgs/user-icon-default.png",
            plan: "free",
            createdAt: new Date().toISOString(),
        };

        const updatedUsers = [...users, newUser];
        localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));

        // Auto-login after registration
        const sessionUser = { ...newUser };
        delete sessionUser.password;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(sessionUser));

        // Set related localStorage items for compatibility with existing code
        localStorage.setItem("autograph_username", username);
        localStorage.setItem("autograph_avatar", newUser.avatar);
        localStorage.setItem("autograph_plan", "free");
        localStorage.setItem("autograph_password", password);

        setUser(sessionUser);
        return { success: true, user: sessionUser };
    }, []);

    const login = useCallback(({ email, password }) => {
        const users = loadUsers();
        const found = users.find(u => u.email === email && u.password === password);

        if (!found) {
            return { success: false, error: "Nieprawidłowy email lub hasło." };
        }

        const sessionUser = { ...found };
        delete sessionUser.password;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(sessionUser));

        // Sync with existing localStorage keys
        localStorage.setItem("autograph_username", found.username);
        localStorage.setItem("autograph_avatar", found.avatar);
        localStorage.setItem("autograph_plan", found.plan || "free");
        localStorage.setItem("autograph_password", found.password);

        setUser(sessionUser);
        return { success: true, user: sessionUser };
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(CURRENT_USER_KEY);
        setUser(null);
    }, []);

    const updateUser = useCallback((updates) => {
        setUser(prev => {
            if (!prev) return prev;
            const updated = { ...prev, ...updates };
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));

            // Also update in users array
            const users = loadUsers();
            const idx = users.findIndex(u => u.id === updated.id);
            if (idx !== -1) {
                users[idx] = { ...users[idx], ...updates };
                localStorage.setItem(USERS_KEY, JSON.stringify(users));
            }

            return updated;
        });
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            isLoggedIn,
            register,
            login,
            logout,
            updateUser,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
