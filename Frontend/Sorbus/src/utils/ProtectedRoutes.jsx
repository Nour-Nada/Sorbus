// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { Outlet, Navigate } from "react-router-dom";
import { useAuthContext } from '../context/AuthContext.jsx';

const ProtectedRoutes = () => {
    const { isLoggedIn } = useAuthContext();

    if (isLoggedIn === null) return null;
    return isLoggedIn ? <Outlet /> : <Navigate to="/unauthorized" />;
}

export default ProtectedRoutes;
