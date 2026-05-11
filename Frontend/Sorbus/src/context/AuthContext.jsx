import { createContext, useState, useContext } from "react";

const AuthContext = createContext();

export const useAuthContext = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));

    const login = (newToken) => {
        // Call this after a successful login with the JWT returned from Node.js
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setIsLoggedIn(true);
    };

    const logout = () => {
        // Call this to clear the session
        localStorage.removeItem('token');
        setToken(null);
        setIsLoggedIn(false);
    };

    return (
        <AuthContext.Provider value={{ token, isLoggedIn, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
