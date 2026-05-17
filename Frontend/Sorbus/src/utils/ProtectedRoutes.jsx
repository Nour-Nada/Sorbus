import { Outlet, Navigate } from "react-router-dom";
import { useAuthContext } from '../context/AuthContext.jsx';

const ProtectedRoutes = () => {
    const { isLoggedIn } = useAuthContext();

    if (isLoggedIn === null) return null;
    return isLoggedIn ? <Outlet /> : <Navigate to="/unauthorized" />;
}

export default ProtectedRoutes;
