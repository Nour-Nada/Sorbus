import { useState, useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import axios from 'axios';

const ProtectedRoutes = () => {
    const [isVerified, setIsVerified] = useState(null);

    useEffect(() => {
        // Skips network call if no token exists, otherwise verifies with the server
        const verify = async () => {
            if (!localStorage.getItem('token')) {
                setIsVerified(false);
                return;
            }
            try {
                await axios.get('/api/user/verify');
                setIsVerified(true);
            } catch {
                setIsVerified(false);
            }
        };
        verify();
    }, []);

    if (isVerified === null) return null;
    return isVerified ? <Outlet /> : <Navigate to="/unauthorized" />;
}

export default ProtectedRoutes;
