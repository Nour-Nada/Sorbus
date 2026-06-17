import { createContext, useState, useContext, useEffect } from "react";
import axios from "axios";

const AuthContext = createContext();

export const useAuthContext = () => useContext(AuthContext);

// Module-level variable so the Axios interceptor in App.jsx can always read the latest token without stale closures
let _accessToken = null;
export const getAccessToken = () => _accessToken;
export const setAccessToken = (t) => { _accessToken = t; };

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(null); // Kept for any consumers; synced with _accessToken
    const [isLoggedIn, setIsLoggedIn] = useState(null);

    useEffect(() => {
        // On mount, restore the session silently via the refresh token cookie instead of reading localStorage
        const restore = async () => {
            try {
                const { data } = await axios.post('/api/user/refresh', {}, { withCredentials: true, _retry: true });
                setAccessToken(data.jwt_token);
                setToken(data.jwt_token);
                setIsLoggedIn(true);
            } catch {
                setIsLoggedIn(false);
            }
        };
        restore();
    }, []);

    const login = (newToken) => {
        // Call this after a successful login with the JWT returned from Node.js
        setAccessToken(newToken);
        setToken(newToken);
        setIsLoggedIn(true);
    };

    const logout = () => {
        // Call this to clear the session
        setAccessToken(null);
        setToken(null);
        setIsLoggedIn(false);
        localStorage.removeItem('userId');
        axios.post('/api/user/logout', {}, { withCredentials: true, _retry: true }).catch(() => {});
    };

    return (
        <AuthContext.Provider value={{ token, isLoggedIn, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
