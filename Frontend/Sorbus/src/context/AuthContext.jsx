import { createContext, useState, useContext, useEffect } from "react";
import axios from "axios";

const AuthContext = createContext();

export const useAuthContext = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [isLoggedIn, setIsLoggedIn] = useState(null);

    useEffect(() => {
        // Verifies the stored token with the server on mount — null means still checking
        const verify = async () => {
            if (!localStorage.getItem('token')) {
                setIsLoggedIn(false);
                return;
            }
            try {
                await axios.get('/api/user/verify');
                setIsLoggedIn(true);
            } catch {
                localStorage.removeItem('token');
                setToken(null);
                setIsLoggedIn(false);
            }
        };
        verify();
    }, []);

    const login = (newToken) => {
        // Call this after a successful login with the JWT returned from Node.js
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setIsLoggedIn(true);
    };

    const logout = () => {
        // Call this to clear the session
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        setToken(null);
        setIsLoggedIn(false);
    };

    return (
        <AuthContext.Provider value={{ token, isLoggedIn, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
