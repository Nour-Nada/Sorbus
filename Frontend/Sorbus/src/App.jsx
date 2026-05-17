import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { AccountProvider } from './context/AccountContext.jsx'
import { FileProvider } from './context/FileContext.jsx'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import LandingPage from './pages/LandingPage.jsx'
import RedirectPage from './pages/RedirectPage.jsx'
import UnauthorizedPage from './pages/UnauthorizedPage.jsx'
import ProtectedRoutes from './utils/ProtectedRoutes.jsx'
import axios from 'axios'
import './styles/App.css'

function App() {
  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return (
    <AuthProvider>
      <AccountProvider>
        <FileProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="*" element={<RedirectPage />} />

            <Route element={<ProtectedRoutes />}>
              <Route path="/home" element={<Home />} />
              <Route path="/account" element={<Account />} />
            </Route>
          </Routes>
        </FileProvider>
      </AccountProvider>
    </AuthProvider>
  )
}

export default App