import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { AccountProvider } from './context/AccountContext.jsx'
import { FileProvider } from './context/FileContext.jsx'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import LandingPage from './pages/LandingPage.jsx'
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
            <Route path="/" element={<Home />} />
            <Route path="/account" element={<Account />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/landingpage" element={<LandingPage />} />
          </Routes>
        </FileProvider>
      </AccountProvider>
    </AuthProvider>
  )
}

export default App